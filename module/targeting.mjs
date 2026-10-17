import { SYSTEM_ID, filePath } from '../constants.mjs';
import { FAINTED_STATUS } from './conditions.mjs';
import { roomOfToken } from './rooms.mjs';
import { effectiveRange, hasRule } from './features.mjs';
import { DIRECTIONS, computeTargets, includesSelf, isSingleTarget, needsDirection, parseLocationMove, tileDistance } from './targeting-geometry.mjs';
import { ranges, targets } from './types.mjs';

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

const HIGHLIGHT_LAYER = "explorers-targeting";
const AREA_COLOR = 0x33BBFF;
const TARGET_COLOR = 0xFF5533;
const DIRECTION_ICONS = {
  nw: "fa-arrow-up-left", n: "fa-arrow-up", ne: "fa-arrow-up-right",
  w: "fa-arrow-left", e: "fa-arrow-right",
  sw: "fa-arrow-down-left", s: "fa-arrow-down", se: "fa-arrow-down-right",
};
const lastFacing = new Map();

export function getActorToken(actor) {
  const tokens = actor?.getActiveTokens(true) ?? [];
  return tokens.find(token => token.controlled) ?? tokens[0] ?? null;
}

function tokenInfo(token) {
  const document = token.document;
  return {
    id: token.id,
    token,
    cells: document.getOccupiedGridSpaceOffsets(),
    team: document.disposition,
    center: token.center,
    fainted: token.actor?.statuses.has(FAINTED_STATUS) ?? false,
    room: roomOfToken(document)?.id ?? null,
  };
}

function buildScene(actor) {
  const userToken = getActorToken(actor);
  if (!userToken) return null;
  const user = tokenInfo(userToken);
  const others = canvas.tokens.placeables
    .filter(token => token !== userToken && token.actor && (token.visible || game.user.isGM))
    .map(tokenInfo);
  const backend = CONFIG.Canvas.polygonBackends.sight;
  const isBlocked = (from, cell) => backend.testCollision(from, canvas.grid.getCenterPoint(cell), { type: "sight", mode: "any" });
  return {
    userToken, user, others, isBlocked,
    userRoom: user.room,
    visibility: actor.system.tileVisibility ?? Infinity,
  };
}

function highlightCells(cells, color = AREA_COLOR) {
  const grid = canvas.interface.grid;
  grid.addHighlightLayer(HIGHLIGHT_LAYER);
  grid.clearHighlightLayer(HIGHLIGHT_LAYER);
  for (const cell of cells) {
    const { x, y } = canvas.grid.getTopLeftPoint(cell);
    grid.highlightPosition(HIGHLIGHT_LAYER, { x, y, color, border: color, alpha: 0.25 });
  }
}

function clearHighlight() {
  canvas.interface?.grid?.clearHighlightLayer(HIGHLIGHT_LAYER);
}

function setUserTargets(tokens) {
  canvas.tokens.setTargets(tokens.map(token => token.id), { mode: "replace" });
}

export function describeTargeting(system, { range: rangeId = system.range, rangeCount = system.rangeCount } = {}) {
  const target = system.target ? game.i18n.localize(targets[system.target]) : "";
  const range = rangeId ? game.i18n.format(ranges[rangeId], { X: rangeCount ?? "" }) : "";
  return [target, range].filter(Boolean).join(" ");
}

export async function pickTargets(actor, move, { force = false } = {}) {
  const system = move.system;
  if (!force && !game.settings.get(SYSTEM_ID, "autoTargeting")) return true;
  if (system.target === 'self' || (!system.target && system.range !== 'special')) return true;
  if (!canvas?.ready || !canvas.grid.isSquare) return true;

  const scene = buildScene(actor);
  if (!scene) {
    ui.notifications.warn("SYSTEM.Targeting.NoToken", { localize: true });
    return true;
  }
  const location = system.range === 'special' ? parseLocationMove(system.description) : null;
  if (system.range === 'special' && !location) return true;

  const { range, rangeCount } = effectiveRange(actor, move);
  const moveSpec = { target: system.target ?? 'foes', range, rangeCount };
  const lineOptions = { pierce: hasRule(actor, "pierce") && range === 'ahead', throughAllies: hasRule(actor, "shootThroughAllies") };
  const compute = (direction = null, chosenLocation = null) => {
    const result = computeTargets({ ...scene, ...lineOptions, move: moveSpec, direction, location: chosenLocation, burst: location?.burst });
    if (moveSpec.target === 'selfOrAlly') result.candidates.unshift(scene.user);
    return result;
  };

  if (!location) {
    if (needsDirection(range)) {
      const withTargets = Object.keys(DIRECTIONS).map(direction => ({ direction, result: compute(direction) }))
        .filter(({ result }) => result.candidates.length);
      if (withTargets.length === 1 && (!isSingleTarget(moveSpec.target) || withTargets[0].result.candidates.length === 1)) {
        return confirmAutomatically(scene, withTargets[0].result, withTargets[0].direction);
      }
    }
    else {
      const result = compute();
      if (result.candidates.length && (!isSingleTarget(moveSpec.target) || result.candidates.length === 1)) {
        return confirmAutomatically(scene, result, null);
      }
    }
  }

  return new TargetingDialog({ actor, move, scene, compute, location, range, rangeCount }).wait();
}

const RETREAT_MEMORY_MS = 5 * 60 * 1000;
const retreats = new Map();

const battleRound = scene => game.combats?.find(combat => combat.scene === scene && combat.started)?.round ?? null;

function rememberRetreats(tokenDocument, movement) {
  const scene = tokenDocument.parent;
  if (!scene || !movement.origin || !movement.destination) return;
  const from = tokenDocument.getOccupiedGridSpaceOffsets(movement.origin);
  const to = tokenDocument.getOccupiedGridSpaceOffsets(movement.destination);
  const now = Date.now();
  for (const other of scene.tokens) {
    if (other === tokenDocument || !other.actor || other.disposition === tokenDocument.disposition) continue;
    const cells = other.getOccupiedGridSpaceOffsets();
    if (tileDistance(from, cells) > 1 || tileDistance(to, cells) <= 1) continue;
    const list = (retreats.get(other.id) ?? []).filter(entry => entry.tokenId !== tokenDocument.id && now - entry.time < RETREAT_MEMORY_MS);
    list.push({ tokenId: tokenDocument.id, sceneId: scene.id, round: battleRound(scene), time: now });
    retreats.set(other.id, list);
  }
}

export function registerOpportunityHooks() {
  Hooks.on("moveToken", rememberRetreats);
}

export async function aimOpportunityStrike(actor) {
  if (!globalThis.canvas?.ready) return true;
  const userToken = getActorToken(actor);
  if (!userToken) return true;
  const scene = canvas.scene;
  const round = battleRound(scene);
  const isFoe = token => token !== userToken && token.actor && token.document.disposition !== userToken.document.disposition
    && !token.actor.statuses.has(FAINTED_STATUS);
  let choices = (retreats.get(userToken.id) ?? [])
    .filter(entry => entry.sceneId === scene.id && Date.now() - entry.time < RETREAT_MEMORY_MS && (round === null || entry.round === round))
    .reverse().map(entry => canvas.tokens.get(entry.tokenId)).filter(token => token && isFoe(token));
  if (!choices.length) choices = [...game.user.targets].filter(isFoe);
  if (!choices.length) {
    ui.notifications.warn("SYSTEM.Targeting.NoOpportunityTarget", { localize: true });
    return false;
  }
  let chosen = choices[0];
  if (choices.length > 1) {
    const id = await foundry.applications.api.DialogV2.wait({
      window: { title: "SYSTEM.Actions.OpportunityStrike" },
      content: `<p>${game.i18n.localize("SYSTEM.Targeting.ChooseOpportunityTarget")}</p>`,
      buttons: choices.map(token => ({ action: token.id, label: token.name })),
      rejectClose: false
    });
    chosen = choices.find(token => token.id === id);
    if (!chosen) return false;
  }
  setUserTargets([chosen]);
  return true;
}

function confirmAutomatically(scene, result, direction) {
  if (direction) lastFacing.set(scene.userToken.id, direction);
  setUserTargets(result.candidates.map(candidate => candidate.token));
  highlightCells(result.cells);
  setTimeout(clearHighlight, 2000);
  return true;
}

class TargetingDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["explorers-targeting"],
    window: { title: "SYSTEM.Targeting.Title", icon: "fa-solid fa-crosshairs" },
    position: { width: 320 },
    actions: {
      direction: TargetingDialog.#onDirection,
      pickLocation: TargetingDialog.#onPickLocation,
      confirm: TargetingDialog.#onConfirm,
      cancel: TargetingDialog.#onCancel,
    }
  };

  static PARTS = {
    body: { template: filePath("templates/targeting/targeting.hbs") }
  };

  #resolve;
  #settled = false;
  #removeCanvasListener = null;

  constructor({ actor, move, scene, compute, location, range, rangeCount, ...options }) {
    super(options);
    this.actor = actor;
    this.move = move;
    this.scene = scene;
    this.compute = compute;
    this.locationMove = location;
    this.range = range;
    this.rangeCount = rangeCount;
    this.direction = needsDirection(range) ? (lastFacing.get(scene.userToken.id) ?? null) : null;
    this.location = null;
    this.result = this.#recompute();
  }

  get title() {
    return `${game.i18n.localize("SYSTEM.Targeting.Title")}: ${this.move.name}`;
  }

  wait() {
    return new Promise(resolve => {
      this.#resolve = resolve;
      this.render({ force: true });
    });
  }

  #recompute() {
    if (needsDirection(this.range) && !this.direction) return null;
    if (this.locationMove && !this.location) return null;
    return this.compute(this.direction, this.location);
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.move.system;
    context.description = describeTargeting(system, { range: this.range, rangeCount: this.rangeCount });
    context.needsDirection = needsDirection(this.range);
    if (context.needsDirection) {
      const order = ['nw', 'n', 'ne', 'w', null, 'e', 'sw', 's', 'se'];
      context.directions = order.map(direction => direction ? {
        direction,
        icon: DIRECTION_ICONS[direction],
        count: this.compute(direction).candidates.length,
        active: direction === this.direction
      } : { center: true, img: this.scene.userToken.document.texture.src });
    }
    context.locationMove = this.locationMove;
    context.location = this.location;
    context.single = isSingleTarget(system.target);
    context.candidates = (this.result?.candidates ?? []).map((candidate, index) => ({
      id: candidate.id,
      name: candidate.token.name,
      img: candidate.token.document.texture.src,
      checked: !context.single || index === 0
    }));
    context.ready = !!this.result;
    context.blockedBy = this.result?.blockedBy?.token.name ?? null;
    context.includeSelf = includesSelf(system.target) && system.target !== 'selfOrAlly';
    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    highlightCells(this.result?.cells ?? []);
    for (const button of this.element.querySelectorAll("[data-action=direction]")) {
      button.addEventListener("mouseenter", () => highlightCells(this.compute(button.dataset.direction).cells));
      button.addEventListener("mouseleave", () => highlightCells(this.result?.cells ?? []));
    }
  }

  static #onDirection(event, target) {
    this.direction = target.dataset.direction;
    this.result = this.#recompute();
    this.render();
  }

  static #onPickLocation() {
    ui.notifications.info(game.i18n.format("SYSTEM.Targeting.ClickLocation", { reach: this.locationMove.reach }));
    const reachCells = [];
    for (const cell of this.scene.user.cells) {
      for (let di = -this.locationMove.reach; di <= this.locationMove.reach; di++) {
        for (let dj = -this.locationMove.reach; dj <= this.locationMove.reach; dj++) reachCells.push({ i: cell.i + di, j: cell.j + dj });
      }
    }
    highlightCells(reachCells);
    this.#listenForLocation();
  }

  #listenForLocation() {
    this.#removeCanvasListener?.();
    const view = canvas.app.view;
    const handler = event => {
      if (event.button !== 0) return;
      event.stopPropagation();
      event.preventDefault();
      this.#removeCanvasListener?.();
      const point = canvas.canvasCoordinatesFromClient({ x: event.clientX, y: event.clientY });
      const cell = canvas.grid.getOffset(point);
      if (tileDistance(this.scene.user.cells, [cell]) > this.locationMove.reach || this.scene.isBlocked(this.scene.user.center, cell)) {
        ui.notifications.warn("SYSTEM.Targeting.LocationOutOfRange", { localize: true });
        this.#listenForLocation();
        return;
      }
      this.location = cell;
      this.result = this.#recompute();
      this.render();
    };
    view.addEventListener("pointerdown", handler, true);
    this.#removeCanvasListener = () => {
      view.removeEventListener("pointerdown", handler, true);
      this.#removeCanvasListener = null;
    };
  }

  static #onConfirm() {
    const selected = new Set(Array.from(this.element.querySelectorAll("input[name=target]:checked"), input => input.value));
    const candidates = this.result?.candidates ?? [];
    const chosen = candidates.filter(candidate => selected.has(candidate.id)).map(candidate => candidate.token);
    if (!chosen.length && candidates.length && !includesSelf(this.move.system.target)) {
      ui.notifications.warn("SYSTEM.Targeting.NoneChosen", { localize: true });
      return;
    }
    if (this.direction) lastFacing.set(this.scene.userToken.id, this.direction);
    setUserTargets(chosen);
    this.#settle(true);
  }

  static #onCancel() {
    this.#settle(false);
  }

  #settle(value) {
    if (this.#settled) return;
    this.#settled = true;
    this.#resolve?.(value);
    this.close();
  }

  _onClose(options) {
    super._onClose(options);
    this.#removeCanvasListener?.();
    clearHighlight();
    if (!this.#settled) {
      this.#settled = true;
      this.#resolve?.(false);
    }
  }
}
