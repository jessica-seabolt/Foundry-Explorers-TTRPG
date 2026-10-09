import { SYSTEM_ID, filePath } from '../constants.mjs';
import { FAINTED_STATUS } from './conditions.mjs';
import { roomOfToken } from './rooms.mjs';
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
// Remembers each token's last facing for this session, to preselect it next time
const lastFacing = new Map();

/** The token representing an actor on the current scene, preferring a controlled one. */
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

/** Everything targeting needs to know about the scene, from the user's point of view. */
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

/** A short description of a move's targeting, e.g. "Foe up to 4 tiles ahead". */
export function describeTargeting(system) {
  const target = system.target ? game.i18n.localize(targets[system.target]) : "";
  const range = system.range ? game.i18n.format(ranges[system.range], { X: system.rangeCount ?? "" }) : "";
  return [target, range].filter(Boolean).join(" ");
}

/**
 * Picks the targets for a move from its Target and Range, setting them as the user's targets.
 * Asks the user only when there's a real choice (a direction, a location, or which of several targets).
 * @returns {Promise<boolean>}  false if the user cancelled
 */
export async function pickTargets(actor, move, { force = false } = {}) {
  const system = move.system;
  if (!force && !game.settings.get(SYSTEM_ID, "autoTargeting")) return true;
  if (system.target === 'self' || (!system.target && system.range !== 'special')) return true; // nothing to aim
  if (!canvas?.ready || !canvas.grid.isSquare) return true; // targeting only understands square grids

  const scene = buildScene(actor);
  if (!scene) {
    ui.notifications.warn("SYSTEM.Targeting.NoToken", { localize: true });
    return true;
  }
  const location = system.range === 'special' ? parseLocationMove(system.description) : null;
  if (system.range === 'special' && !location) return true; // other special moves are aimed by hand

  const moveSpec = { target: system.target ?? 'foes', range: system.range, rangeCount: system.rangeCount };
  const compute = (direction = null, chosenLocation = null) => {
    const result = computeTargets({ ...scene, move: moveSpec, direction, location: chosenLocation, burst: location?.burst });
    // "Self or Ally" moves can also be used on yourself
    if (moveSpec.target === 'selfOrAlly') result.candidates.unshift(scene.user);
    return result;
  };

  // Resolve without asking when there's only one sensible choice
  if (!location) {
    if (needsDirection(system.range)) {
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

  return new TargetingDialog({ actor, move, scene, compute, location }).wait();
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

  constructor({ actor, move, scene, compute, location, ...options }) {
    super(options);
    this.actor = actor;
    this.move = move;
    this.scene = scene;
    this.compute = compute;
    this.locationMove = location;
    this.direction = needsDirection(move.system.range) ? (lastFacing.get(scene.userToken.id) ?? null) : null;
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
    if (needsDirection(this.move.system.range) && !this.direction) return null;
    if (this.locationMove && !this.location) return null;
    return this.compute(this.direction, this.location);
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.move.system;
    context.description = describeTargeting(system);
    context.needsDirection = needsDirection(system.range);
    if (context.needsDirection) {
      // Lay out the 8 directions around the user's token, with how many targets each would hit
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
    // Preview each direction's area while hovering it
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
    // With no valid targets the move can still be used ("Use anyway"); otherwise at least one must be picked
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
