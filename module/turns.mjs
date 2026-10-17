import { SYSTEM_ID } from '../constants.mjs';
import { postAutomationMessage } from './conditions.mjs';
import { getRules } from './features.mjs';

export const TURN_LIMITS_SETTING = "turnLimits";
const TURN_FLAG = "turn";
const USER_MOVEMENT = ["dragging", "keyboard"];

export const ACTIONS = { move: "Move", item: "Item", skill: "Skill", dash: "Dash", escape: "Escape", guard: "Guard", basicAttack: "BasicAttack" };

export function registerTurnSettings() {
  game.settings.register(SYSTEM_ID, TURN_LIMITS_SETTING, {
    name: "SYSTEM.Settings.TurnLimits.Name",
    hint: "SYSTEM.Settings.TurnLimits.Hint",
    scope: "world", config: true, type: Boolean, default: true,
    onChange: () => ui.controls?.render()
  });
}

const limitsOn = () => game.settings.get(SYSTEM_ID, TURN_LIMITS_SETTING);
const escape = text => foundry.utils.escapeHTML(text ?? "");

export function turnOf(actor) {
  if (!actor || !limitsOn()) return null;
  for (const combat of game.combats?.contents ?? []) {
    if (!combat.started) continue;
    const combatant = combat.combatants.find(combatant => combatant.actor === actor || (combatant.actor && combatant.actor.uuid === actor.uuid));
    if (!combatant) continue;
    const saved = combatant.getFlag(SYSTEM_ID, TURN_FLAG) ?? {};
    const state = saved.round === combat.round ? saved : { round: combat.round, moved: 0, actions: [], dash: false, afterPriority: false };
    const priorityTurn = state.priorityRound === combat.round && !(state.actions ?? []).length;
    return {
      combat, combatant, priorityTurn, isTurn: combat.combatant?.id === combatant.id || priorityTurn,
      state: { ...state, reactionRound: saved.reactionRound ?? null }
    };
  }
  return null;
}

async function saveState(turn, changes) {
  const { reactionRound, ...state } = turn.state;
  await turn.combatant.setFlag(SYSTEM_ID, TURN_FLAG, { ...state, reactionRound, ...changes });
}

export function movementLeft(actor) {
  const turn = turnOf(actor);
  if (!turn) return Infinity;
  if (!turn.isTurn || turn.state.afterPriority) return 0;
  const allowance = (actor.system.tileMovement ?? 0) * (turn.state.dash ? 2 : 1);
  return Math.max(0, allowance - (turn.state.moved ?? 0));
}

export function canAct(actor, kind, { reaction = false, priority = false } = {}) {
  const turn = turnOf(actor);
  if (!turn) return { allowed: true };
  const name = escape(actor.name);
  if (reaction) {
    return turn.state.reactionRound === turn.combat.round
      ? { allowed: false, reason: game.i18n.format("SYSTEM.Turns.ReactionUsed", { name }) }
      : { allowed: true };
  }
  const actions = turn.state.actions ?? [];
  if (!turn.isTurn) {
    if (priority && kind === "move" && !actions.length) return { allowed: true };
    return { allowed: false, reason: game.i18n.format("SYSTEM.Turns.NotYourTurn", { name }) };
  }
  if (turn.priorityTurn && !(priority && kind === "move")) {
    return { allowed: false, reason: game.i18n.format("SYSTEM.Turns.PriorityOnly", { name }) };
  }
  if (!actions.length) return { allowed: true };
  const extraMoves = getRules(actor, "extraMove").reduce((sum, rule) => sum + (rule.count ?? 1), 0);
  if (kind === "move" && actions.every(action => action === "move") && actions.length <= extraMoves) {
    return { allowed: true, secondMove: true };
  }
  return { allowed: false, reason: game.i18n.format("SYSTEM.Turns.ActionUsed", { name }) };
}

export function checkAction(actor, kind, options) {
  const result = canAct(actor, kind, options);
  if (!result.allowed) ui.notifications.warn(result.reason);
  return result;
}

export async function recordAction(actor, kind, { reaction = false, priority = false } = {}) {
  const turn = turnOf(actor);
  if (!turn || !turn.combatant.isOwner) return;
  if (reaction) return saveState(turn, { reactionRound: turn.combat.round });
  if (!turn.isTurn && !priority) return;
  await saveState(turn, {
    actions: [...(turn.state.actions ?? []), kind],
    dash: turn.state.dash || kind === "dash",
    afterPriority: turn.state.afterPriority || priority
  });
}

export async function takeSimpleAction(actor, kind) {
  if (!checkAction(actor, kind).allowed) return false;
  await recordAction(actor, kind);
  const key = kind === "dash" ? "SYSTEM.Turns.Dashed" : "SYSTEM.Turns.Escaped";
  await postAutomationMessage(actor, [game.i18n.format(key, { name: escape(actor.name), tiles: movementLeft(actor) })]);
  return true;
}

function tilesAlong(tokenDocument, positions) {
  const grid = tokenDocument.parent.grid;
  const points = positions.map(position => tokenDocument.getCenterPoint(position));
  if (points.length < 2) return 0;
  return Math.max(0, grid.getDirectPath(points).length - 1);
}

function onPreMoveToken(tokenDocument, movement) {
  if (!USER_MOVEMENT.includes(movement.method)) return;
  const actor = tokenDocument.actor;
  const turn = turnOf(actor);
  if (!turn) return;
  if (!turn.isTurn) {
// Lets the GM push and pull Pokemon off their turn.
    if (game.user.isGM) return;
    if (!(turn.state.actions ?? []).length && actor.items.some(item => item.type === "Move" && item.system.hasTag?.("priority"))) {
      offerPriorityTurn(actor, turn);
      return false;
    }
    ui.notifications.warn(game.i18n.format("SYSTEM.Turns.NotYourTurn", { name: escape(actor.name) }));
    return false;
  }
  const tiles = tilesAlong(tokenDocument, [movement.origin, ...movement.passed.waypoints, ...movement.pending.waypoints]);
  const left = movementLeft(actor);
  if (tiles <= left) return;
  ui.notifications.warn(game.i18n.format(left ? "SYSTEM.Turns.TooFar" : "SYSTEM.Turns.NoMovement", { name: escape(actor.name), tiles: left }));
  return false;
}

async function offerPriorityTurn(actor, turn) {
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title: "SYSTEM.Turns.PriorityTitle" },
    content: `<p>${game.i18n.format("SYSTEM.Turns.PriorityPrompt", { name: escape(actor.name) })}</p>`,
    rejectClose: false
  });
  if (!confirmed) return;
  await saveState(turn, { priorityRound: turn.combat.round });
  ui.notifications.info(game.i18n.format("SYSTEM.Turns.PriorityDeclared", { name: escape(actor.name) }));
}

async function onMoveToken(tokenDocument, movement, operation, user) {
  if (user !== game.user || !USER_MOVEMENT.includes(movement.method)) return;
  const turn = turnOf(tokenDocument.actor);
  if (!turn?.isTurn || !turn.combatant.isOwner) return;
  const tiles = tilesAlong(tokenDocument, [movement.origin, ...movement.passed.waypoints]);
  if (tiles) await saveState(turn, { moved: (turn.state.moved ?? 0) + tiles });
}

function onGetSceneControlButtons(controls) {
  if (!game.user.isGM || !controls.tokens) return;
  controls.tokens.tools.turnLimits = {
    name: "turnLimits",
    title: "SYSTEM.Turns.Toggle",
    icon: "fa-solid fa-hourglass-half",
    order: Object.keys(controls.tokens.tools).length,
    toggle: true,
    active: limitsOn(),
    onChange: (event, active) => game.settings.set(SYSTEM_ID, TURN_LIMITS_SETTING, active)
  };
}

export function registerTurnHooks() {
  Hooks.on("preMoveToken", onPreMoveToken);
  Hooks.on("moveToken", onMoveToken);
  Hooks.on("getSceneControlButtons", onGetSceneControlButtons);
}
