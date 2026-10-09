import { SYSTEM_ID, getSkillDie, getDieString } from '../constants.mjs';
import { ExplorersRoll } from './explorers-roll.mjs';
import { registerSocketHandler, requestFromGM } from './socket.mjs';
import {
  stateConditions, statConditions, conditionIcons, conditionTypeImmunities, resistRerollConditions,
  durationEffects, untilNextTurnConditions, statKeys, weathers, terrains, effects, skills
} from './types.mjs';

const { Roll } = foundry.dice;
const ACTOR_OP_ACTION = "actorOp";
export const FAINTED_STATUS = "fainted";

const localize = key => game.i18n.localize(key);
const format = (key, data) => game.i18n.format(key, data);
const escape = text => foundry.utils.escapeHTML(text ?? "");

/** The status effects shown on tokens. Stat changes are tracked as numbers on the sheet, so they're hidden from the HUD. */
export function buildStatusEffects() {
  const statusEffects = Object.entries(stateConditions).map(([id, name]) => ({
    id,
    name,
    img: conditionIcons[id] ?? "icons/svg/aura.svg",
    hud: !statConditions[id]
  }));
  statusEffects.push({ id: FAINTED_STATUS, name: "SYSTEM.Conditions.Fainted", img: "icons/svg/skull.svg" });
  return statusEffects;
}

/** Posts an automation message to chat, spoken by the given actor. */
export async function postAutomationMessage(actor, lines) {
  lines = lines.filter(Boolean);
  if (!lines.length) return;
  await foundry.documents.ChatMessage.implementation.create({
    speaker: foundry.documents.ChatMessage.implementation.getSpeaker({ actor }),
    content: lines.map(line => `<p>${line}</p>`).join("")
  });
}

/* -------------------------------------------- */
/*  Running actions on actors you may not own   */
/* -------------------------------------------- */

const actorOps = {
  applyEffects: (actor, { effectList, context }) => applyEffectsLocal(actor, effectList, context),
  applyDamage: (actor, { options }) => actor.system.applyDamage?.(options),
  heal: (actor, { amount, label }) => actor.system.heal?.(amount, label),
};

/**
 * Runs an operation on an actor and returns its result. If the current user doesn't own the actor,
 * the active GM runs it instead (e.g. a player's move inflicting a Condition on an enemy), and this waits for it.
 */
export async function runAsOwner(actor, op, args) {
  if (!actor) return;
  if (actor.isOwner) return actorOps[op](actor, args);
  return requestFromGM(ACTOR_OP_ACTION, { op, uuid: actor.uuid, args });
}

registerSocketHandler(ACTOR_OP_ACTION, async ({ op, uuid, args }) => {
  const actor = await fromUuid(uuid);
  if (actor && actorOps[op]) return actorOps[op](actor, args);
});

export const applyEffects = (actor, effectList, context = {}) => runAsOwner(actor, "applyEffects", { effectList, context });
export const applyDamage = (actor, options) => runAsOwner(actor, "applyDamage", { options });
export const healActor = (actor, amount, label = null) => runAsOwner(actor, "heal", { amount, label });

/* -------------------------------------------- */
/*  Applying effects                            */
/* -------------------------------------------- */

/**
 * Applies move effects ({effect, effectCount}) to an actor the current user owns.
 * @param {object} context
 * @param {string} [context.sourceName]   Name of the Pokemon that applied the effects
 * @param {string} [context.sourceUuid]   UUID of that Pokemon's actor
 * @param {boolean} [context.fromOther]   Whether another Pokemon applied this (Invulnerable blocks those)
 * @param {number} [context.dc]           The applying roll, used as the target for later resist re-rolls
 * @param {string} [context.resistSkill]  The skill used to resist, for later re-rolls
 * @param {string} [context.moveType]     The move's Type (Trapped deals damage of this Type)
 */
export async function applyEffectsLocal(actor, effectList, context = {}) {
  const lines = [];
  const name = escape(actor.name);
  const statChanges = {};
  for (const { effect, effectCount } of effectList) {
    const label = localize(effects[effect] ?? effect);

    if (statConditions[effect]) {
      const isUp = effect.endsWith("Up");
      const stat = effect.slice(0, isUp ? -2 : -4);
      if (!isUp && actor.statuses.has("noLoweredStats")) {
        lines.push(format("SYSTEM.Automation.StatBlocked", { name, label }));
        continue;
      }
      const amount = effectCount ?? 1;
      const current = statChanges[stat] ?? actor.system.statChanges?.[stat] ?? 0;
      statChanges[stat] = Math.clamp(current + (isUp ? amount : -amount), -10, 10);
      lines.push(format("SYSTEM.Automation.StatChanged", { name, label, amount, total: statChanges[stat] }));
      continue;
    }

    if (stateConditions[effect]) {
      const blocked = conditionBlockedReason(actor, effect, context);
      if (blocked) {
        lines.push(blocked);
        continue;
      }
      if (actor.statuses.has(effect)) {
        lines.push(format("SYSTEM.Automation.AlreadyHas", { name, label }));
        continue;
      }
      await addCondition(actor, effect, {
        dc: context.dc ?? null,
        resistSkill: context.resistSkill ?? null,
        sourceUuid: context.sourceUuid ?? null,
        sourceName: context.sourceName ?? null,
        moveType: context.moveType ?? null,
        remaining: durationEffects.has(effect) && effectCount ? effectCount : null,
      });
      lines.push(format("SYSTEM.Automation.ConditionApplied", { name, label }));
      if (effect === "burned" && actor.statuses.has("frozen")) { // the Burned Condition thaws a Frozen Pokemon early
        await removeCondition(actor, "frozen");
        lines.push(format("SYSTEM.Automation.Thawed", { name }));
      }
      continue;
    }

    if (weathers[effect] || terrains[effect]) {
      lines.push(format("SYSTEM.Automation.WeatherChanged", { label }));
      continue;
    }

    // Push, Size Change, Instant KO, Mud Sport, etc. are left to the GM
    lines.push(format("SYSTEM.Automation.ManualEffect", { name, label, count: effectCount ?? "" }));
  }

  if (Object.keys(statChanges).length) {
    await actor.update(Object.fromEntries(Object.entries(statChanges).map(([stat, value]) => [`system.statChanges.${stat}`, value])));
  }
  await postAutomationMessage(actor, lines);
}

/** Returns a message if the actor can't receive this Condition, or null if it can. */
function conditionBlockedReason(actor, effect, context) {
  const name = escape(actor.name);
  const label = localize(effects[effect]);
  if (context.fromOther && actor.statuses.has("invulnerable")) {
    return format("SYSTEM.Automation.BlockedInvulnerable", { name, label });
  }
  const immuneTypes = conditionTypeImmunities[effect] ?? [];
  const actorTypes = [actor.system.type1, actor.system.type2];
  if (immuneTypes.some(type => actorTypes.includes(type))) {
    return format("SYSTEM.Automation.BlockedType", { name, label });
  }
  if ((effect === "asleep" || effect === "yawning") && actor.statuses.has("insomnia")) {
    return format("SYSTEM.Automation.BlockedInsomnia", { name, label });
  }
  return null;
}

export async function addCondition(actor, statusId, data = {}) {
  const ActiveEffect = foundry.documents.ActiveEffect.implementation;
  const effect = await ActiveEffect.fromStatusEffect(statusId);
  effect.updateSource({ [`flags.${SYSTEM_ID}`]: data });
  return ActiveEffect.create(effect.toObject(), { parent: actor });
}

export async function removeCondition(actor, statusId) {
  const ids = actor.effects.filter(e => e.statuses.has(statusId)).map(e => e.id);
  if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
}

function conditionEffect(actor, statusId) {
  return actor.effects.find(e => e.statuses.has(statusId));
}

/** Shows the Stat Up/Down icons on the token to match the actor's stat changes. */
export async function syncStatChangeIcons(actor) {
  for (const stat of statKeys) {
    const change = actor.system.statChanges?.[stat] ?? 0;
    await actor.toggleStatusEffect(`${stat}Up`, { active: change > 0 });
    await actor.toggleStatusEffect(`${stat}Down`, { active: change < 0 });
  }
}

/* -------------------------------------------- */
/*  Using a move while afflicted                */
/* -------------------------------------------- */

async function rollD6(actor, flavor) {
  const roll = await new Roll("1d6").evaluate();
  await roll.toMessage({ speaker: foundry.documents.ChatMessage.implementation.getSpeaker({ actor }), flavor });
  return roll.total;
}

/**
 * Checks Conditions that stop or change a Pokemon using a move.
 * @returns {Promise<{proceed: boolean, spendPP: boolean}>}
 */
export async function checkMoveConditions(actor, move, { targetsFoe = true } = {}) {
  const statuses = actor.statuses;
  const name = escape(actor.name);
  const block = (key, spendPP = false) => {
    ui.notifications.warn(format(key, { name, move: move.name }));
    return { proceed: false, spendPP };
  };

  if (statuses.has("frozen")) return block("SYSTEM.Automation.CannotActFrozen");
  if (statuses.has("asleep")) return block("SYSTEM.Automation.CannotActAsleep");
  if (statuses.has("flinched")) return block("SYSTEM.Automation.CannotActFlinched");
  if (statuses.has("silenced") && move.system.hasTag?.("sound")) return block("SYSTEM.Automation.CannotActSilenced");

  if (statuses.has("paralyzed")) {
    const result = await rollD6(actor, format("SYSTEM.Automation.ParalysisCheck", { name }));
    if (result <= 2) {
      await postAutomationMessage(actor, [format("SYSTEM.Automation.ParalysisFail", { name, move: escape(move.name) })]);
      return { proceed: false, spendPP: false };
    }
  }

  if (statuses.has("confused")) {
    const result = await rollD6(actor, format("SYSTEM.Automation.ConfusionCheck", { name }));
    if (result === 2) {
      await postAutomationMessage(actor, [format("SYSTEM.Automation.ConfusionSelfHit", { name })]);
      const damage = await new Roll("1d6").evaluate();
      await damage.toMessage({ speaker: foundry.documents.ChatMessage.implementation.getSpeaker({ actor }), flavor: localize("SYSTEM.Automation.ConfusionDamage") });
      await applyDamage(actor, { amount: damage.total, label: localize("SYSTEM.Conditions.Confused") });
      return { proceed: false, spendPP: false };
    }
    if (result === 1 || result === 3) {
      await postAutomationMessage(actor, [format(result === 1 ? "SYSTEM.Automation.ConfusionAlly" : "SYSTEM.Automation.ConfusionRandom", { name })]);
      return { proceed: false, spendPP: false };
    }
    if (result >= 5) {
      await removeCondition(actor, "confused");
      await postAutomationMessage(actor, [format("SYSTEM.Automation.ConfusionEnds", { name })]);
    }
  }

  if (statuses.has("blinded") && targetsFoe) {
    const result = await rollD6(actor, format("SYSTEM.Automation.BlindCheck", { name }));
    if (result <= 3) {
      await postAutomationMessage(actor, [format("SYSTEM.Automation.BlindMiss", { name, move: escape(move.name) })]);
      return { proceed: false, spendPP: true };
    }
    if (result === 6) {
      await removeCondition(actor, "blinded");
      await postAutomationMessage(actor, [format("SYSTEM.Automation.BlindCured", { name })]);
    }
  }

  return { proceed: true, spendPP: true };
}

/* -------------------------------------------- */
/*  Start and end of turn                       */
/* -------------------------------------------- */

async function tickDamage(actor, formula, label) {
  const roll = await new Roll(formula).evaluate();
  await roll.toMessage({ speaker: foundry.documents.ChatMessage.implementation.getSpeaker({ actor }), flavor: label });
  await actor.system.applyDamage?.({ amount: roll.total, label });
}

/** Runs the start-of-turn effects of an actor's Conditions. Only the active GM calls this. */
export async function processStartOfTurn(actor) {
  if (!actor?.system?.hp) return;
  const name = escape(actor.name);
  const lines = [];

  // Effects that last "this turn" end when the Pokemon's next turn starts
  for (const statusId of untilNextTurnConditions) {
    if (!actor.statuses.has(statusId)) continue;
    await removeCondition(actor, statusId);
    lines.push(format("SYSTEM.Automation.ConditionEnded", { name, label: localize(effects[statusId]) }));
  }

  // Count down effects that last a number of turns
  for (const effect of actor.effects.contents) {
    const remaining = effect.getFlag(SYSTEM_ID, "remaining");
    if (typeof remaining !== "number") continue;
    if (remaining <= 1) {
      await effect.delete();
      lines.push(format("SYSTEM.Automation.ConditionEnded", { name, label: escape(effect.name) }));
    }
    else await effect.setFlag(SYSTEM_ID, "remaining", remaining - 1);
  }

  // Yawning becomes Asleep
  if (actor.statuses.has("yawning")) {
    const data = conditionEffect(actor, "yawning")?.flags?.[SYSTEM_ID] ?? {};
    await removeCondition(actor, "yawning");
    if (actor.statuses.has("insomnia")) lines.push(format("SYSTEM.Automation.BlockedInsomnia", { name, label: localize(effects.asleep) }));
    else {
      await addCondition(actor, "asleep", { ...data, remaining: null });
      lines.push(format("SYSTEM.Automation.FellAsleep", { name }));
    }
  }
  await postAutomationMessage(actor, lines);

  if (actor.system.hp.raw <= 0) return;

  // Damage over time. Tick damage isn't resisted by Defence and can't score a Critical Hit.
  if (actor.statuses.has("burned")) await tickDamage(actor, "1d6", localize("SYSTEM.Conditions.Burned"));
  if (actor.statuses.has("poisoned")) await tickDamage(actor, "1d6", localize("SYSTEM.Conditions.Poisoned"));
  if (actor.statuses.has("badlyPoisoned")) {
    const effect = conditionEffect(actor, "badlyPoisoned");
    const turns = effect.getFlag(SYSTEM_ID, "turns") ?? 0;
    await tickDamage(actor, `${turns + 1}d6`, localize("SYSTEM.Conditions.BadlyPoisoned"));
    await effect.setFlag(SYSTEM_ID, "turns", turns + 1);
  }
  let skipTrappedReroll = false;
  if (actor.statuses.has("trapped")) {
    const effect = conditionEffect(actor, "trapped");
    if (!effect.getFlag(SYSTEM_ID, "damaged")) {
      await tickDamage(actor, "1d6", localize("SYSTEM.Conditions.Trapped"));
      await effect.setFlag(SYSTEM_ID, "damaged", true);
      skipTrappedReroll = true;
    }
  }

  await processSleep(actor);
  await processConfusion(actor);

  // Status Resistance re-rolls to shake off a Condition
  for (const statusId of resistRerollConditions) {
    if (!actor.statuses.has(statusId)) continue;
    if (statusId === "trapped" && skipTrappedReroll) continue;
    await rerollResist(actor, statusId);
  }
}

async function processSleep(actor) {
  if (!actor.statuses.has("asleep")) return;
  const name = escape(actor.name);
  const effect = conditionEffect(actor, "asleep");
  const duration = effect.getFlag(SYSTEM_ID, "duration");
  if (typeof duration !== "number") { // first turn asleep: roll how many rounds
    const rounds = await rollD6(actor, format("SYSTEM.Automation.SleepDuration", { name }));
    await effect.setFlag(SYSTEM_ID, "duration", rounds);
    await effect.setFlag(SYSTEM_ID, "turns", 0);
    return;
  }
  const turns = (effect.getFlag(SYSTEM_ID, "turns") ?? 0) + 1;
  if (turns >= duration) {
    await removeCondition(actor, "asleep");
    await postAutomationMessage(actor, [format("SYSTEM.Automation.WokeUp", { name })]);
    return;
  }
  const target = 6 - turns;
  const result = await rollD6(actor, format("SYSTEM.Automation.WakeCheck", { name, target }));
  if (result >= target) {
    await removeCondition(actor, "asleep");
    await postAutomationMessage(actor, [format("SYSTEM.Automation.WokeUp", { name })]);
  }
  else await effect.setFlag(SYSTEM_ID, "turns", turns);
}

async function processConfusion(actor) {
  if (!actor.statuses.has("confused")) return;
  const name = escape(actor.name);
  const effect = conditionEffect(actor, "confused");
  const rounds = effect.getFlag(SYSTEM_ID, "rounds");
  if (typeof rounds !== "number") { // first turn confused: 1-2 is 1 round, 3-4 is 2, 5-6 is 3
    const result = await rollD6(actor, format("SYSTEM.Automation.ConfusionDuration", { name }));
    await effect.setFlag(SYSTEM_ID, "rounds", Math.ceil(result / 2));
    return;
  }
  if (rounds <= 1) {
    await removeCondition(actor, "confused");
    await postAutomationMessage(actor, [format("SYSTEM.Automation.ConfusionEnds", { name })]);
  }
  else await effect.setFlag(SYSTEM_ID, "rounds", rounds - 1);
}

async function rerollResist(actor, statusId) {
  const name = escape(actor.name);
  const label = localize(effects[statusId]);
  const effect = conditionEffect(actor, statusId);
  const dc = effect?.getFlag(SYSTEM_ID, "dc");
  const skill = effect?.getFlag(SYSTEM_ID, "resistSkill");
  if (typeof dc !== "number" || !skill) { // applied by hand, so there's no roll to beat
    await postAutomationMessage(actor, [format("SYSTEM.Automation.RerollReminder", { name, label })]);
    return;
  }
  const roll = new ExplorersRoll(getDieString(getSkillDie(actor, skill)), {}, { dc });
  await roll.evaluate();
  await roll.toMessage({
    speaker: foundry.documents.ChatMessage.implementation.getSpeaker({ actor }),
    flavor: format("SYSTEM.Automation.RerollFlavor", { label, skill: localize(skills[skill]), dc })
  });
  if (roll.success) {
    await removeCondition(actor, statusId);
    await postAutomationMessage(actor, [format("SYSTEM.Automation.ConditionShaken", { name, label })]);
  }
}

/** Runs end-of-turn effects. Only the active GM calls this. */
export async function processEndOfTurn(actor) {
  if (!actor?.statuses?.has("flinched")) return;
  await removeCondition(actor, "flinched");
  await postAutomationMessage(actor, [format("SYSTEM.Automation.ConditionEnded", { name: escape(actor.name), label: localize(effects.flinched) })]);
}
