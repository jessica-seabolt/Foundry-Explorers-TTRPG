import { SYSTEM_ID, getSkillDie, getDieString, isHungry } from '../constants.mjs';
import { ExplorersRoll } from './explorers-roll.mjs';
import { registerSocketHandler, requestFromGM } from './socket.mjs';
import {
  stateConditions, statConditions, conditionIcons, conditionTypeImmunities, resistRerollConditions,
  durationEffects, untilNextTurnConditions, statKeys, weathers, terrains, effects, skills
} from './types.mjs';
import { AFFLICTIONS, getRules, hasRule } from './features.mjs';
import { applyFieldEffect, familyOf, fieldBlocksCondition, fieldLabel, harshWeatherFor, terrainFor, weatherFor } from './weather.mjs';

const { Roll } = foundry.dice;
const ACTOR_OP_ACTION = "actorOp";
export const FAINTED_STATUS = "fainted";

const localize = key => game.i18n.localize(key);
const format = (key, data) => game.i18n.format(key, data);
const escape = text => foundry.utils.escapeHTML(text ?? "");

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

export async function postAutomationMessage(actor, lines) {
  lines = lines.filter(Boolean);
  if (!lines.length) return;
  await foundry.documents.ChatMessage.implementation.create({
    speaker: foundry.documents.ChatMessage.implementation.getSpeaker({ actor }),
    content: lines.map(line => `<p>${line}</p>`).join("")
  });
}

const actorOps = {
  applyEffects: (actor, { effectList, context }) => applyEffectsLocal(actor, effectList, context),
  applyDamage: (actor, { options }) => actor.system.applyDamage?.(options),
  heal: (actor, { amount, label }) => actor.system.heal?.(amount, label),
  cure: (actor, { conditions }) => cureConditionsLocal(actor, conditions),
};

export function registerActorOp(name, operation) {
  actorOps[name] = operation;
}

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
export const cureConditions = (actor, conditions) => runAsOwner(actor, "cure", { conditions });

export async function cureConditionsLocal(actor, conditions) {
  const cured = conditions.filter(condition => actor.statuses.has(condition));
  for (const condition of cured) await removeCondition(actor, condition);
  if (cured.length) {
    await postAutomationMessage(actor, [format("SYSTEM.Automation.Cured", { name: escape(actor.name), labels: cured.map(c => localize(effects[c])).join(", ") })]);
  }
}

export async function consumeItem(item) {
  const actor = item?.actor;
  if (!actor) return;
  const wasHeld = actor.system?.heldItem === item.id;
  let replacement = null;
  if (item.system.becomes) {
    const source = await findItemByName(item.system.becomes);
    if (source) [replacement] = await actor.createEmbeddedDocuments("Item", [source]);
  }
  if (wasHeld) await actor.update({ "system.heldItem": replacement?.id ?? null });
  await item.delete();
  if (wasHeld && !replacement && actor.system?.hp) {
    for (const rule of getRules(actor, "onHeldItemLost")) {
      await postAutomationMessage(actor, [format("SYSTEM.Automation.FeatureTriggered", { name: escape(actor.name), feature: escape(rule.source) })]);
      await applyEffectsLocal(actor, rule.effects ?? [], { sourceUuid: actor.uuid, sourceName: actor.name });
    }
  }
}

export async function consumeRuleItem(actor, rule) {
  if (!rule.consume || !rule.itemId) return;
  const item = actor.items.get?.(rule.itemId) ?? actor.items.find?.(other => other.id === rule.itemId);
  if (!item) return;
  await postAutomationMessage(actor, [format("SYSTEM.Automation.ItemConsumed", { name: escape(actor.name), item: escape(item.name) })]);
  await consumeItem(item);
}

async function findItemByName(name) {
  const pack = game.packs?.get("explorers.items");
  const entry = pack?.index.find(e => e.name === name);
  const document = entry ? await pack.getDocument(entry._id) : game.items?.getName(name);
  if (!document) return null;
  const data = document.toObject();
  delete data._id;
  return data;
}

export async function applyEffectsLocal(actor, effectList, context = {}) {
  const lines = [];
  const name = escape(actor.name);
  const statChanges = {};
  const followUps = [];
  const reflect = [];
  for (const { effect, effectCount } of effectList) {
    const label = localize(effects[effect] ?? effect);

    if (statConditions[effect]) {
      let isUp = effect.endsWith("Up");
      const stat = effect.slice(0, isUp ? -2 : -4);
      let amount = effectCount ?? 1;
      const modes = getRules(actor, "statChange").map(rule => rule.mode);
      if (modes.includes("invert")) isUp = !isUp;
      if (modes.includes("double")) amount *= 2;
      const changedLabel = localize(effects[`${stat}${isUp ? "Up" : "Down"}`] ?? effect);
      if (!isUp && (actor.statuses.has("noLoweredStats") || statLowerBlocked(actor, stat, context))) {
        lines.push(format("SYSTEM.Automation.StatBlocked", { name, label: changedLabel }));
        continue;
      }
      const current = statChanges[stat] ?? actor.system.statChanges?.[stat] ?? 0;
      statChanges[stat] = Math.clamp(current + (isUp ? amount : -amount), -10, 10);
      lines.push(format("SYSTEM.Automation.StatChanged", { name, label: changedLabel, amount, total: statChanges[stat] }));
      if (!isUp && context.fromOther) for (const rule of getRules(actor, "onStatLowered")) followUps.push({ rule, effects: rule.effects ?? [] });
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
      for (const rule of getRules(actor, "onConditionGained")) {
        const matches = rule.conditions === "any" ? AFFLICTIONS.has(effect) : (rule.conditions ?? []).includes(effect);
        if (matches) followUps.push({ rule, effects: rule.effects ?? [], cure: rule.cure ? effect : null });
      }
      if (context.fromOther && context.sourceUuid && !context.reflected
        && getRules(actor, "reflectConditions").some(rule => (rule.conditions ?? []).includes(effect))) {
        reflect.push({ effect, effectCount });
      }
      if (effect === "burned" && actor.statuses.has("frozen")) {
        await removeCondition(actor, "frozen");
        lines.push(format("SYSTEM.Automation.Thawed", { name }));
      }
      continue;
    }

    if (weathers[effect] || terrains[effect]) {
      await applyFieldEffect(actor, effect);
      continue;
    }

    lines.push(format("SYSTEM.Automation.ManualEffect", { name, label, count: effectCount ?? "" }));
  }

  if (Object.keys(statChanges).length) {
    await actor.update(Object.fromEntries(Object.entries(statChanges).map(([stat, value]) => [`system.statChanges.${stat}`, value])));
  }
  await postAutomationMessage(actor, lines);

  for (const { rule, effects: triggered, cure } of followUps) {
    if (rule.itemId && !actor.items.find?.(item => item.id === rule.itemId)) continue;
    await postAutomationMessage(actor, [format("SYSTEM.Automation.FeatureTriggered", { name, feature: escape(rule.source) })]);
    if (triggered.length) await applyEffectsLocal(actor, triggered, { sourceUuid: actor.uuid, sourceName: actor.name });
    if (cure) await cureConditionsLocal(actor, [cure]);
    await consumeRuleItem(actor, rule);
  }
  if (reflect.length) {
    const source = fromUuidSync(context.sourceUuid);
    if (source && source !== actor) {
      await postAutomationMessage(actor, [format("SYSTEM.Automation.Synchronized", { name, target: escape(source.name) })]);
      await applyEffects(source, reflect, { sourceUuid: actor.uuid, sourceName: actor.name, fromOther: true, reflected: true });
    }
  }
}

function statLowerBlocked(actor, stat, context = {}) {
  return getRules(actor, "statLowerImmunity").some(rule => (!rule.fromOthers || context.fromOther)
    && (rule.stats ?? []).some(blocked => blocked === stat || blocked === "all"));
}

function conditionBlockedReason(actor, effect, context) {
  const name = escape(actor.name);
  const label = localize(effects[effect]);
  if (context.fromOther && actor.statuses.has("invulnerable")) {
    return format("SYSTEM.Automation.BlockedInvulnerable", { name, label });
  }
  const immuneTypes = conditionTypeImmunities[effect] ?? [];
  const actorTypes = [actor.system.type1, actor.system.type2];
  const source = context.sourceUuid ? fromUuidSync(context.sourceUuid) : null;
  const bypassed = getRules(source, "bypassConditionImmunity").some(rule => (rule.conditions ?? []).includes(effect));
  if (!bypassed && immuneTypes.some(type => actorTypes.includes(type))) {
    return format("SYSTEM.Automation.BlockedType", { name, label });
  }
  const field = fieldBlocksCondition(actor, effect);
  if (field) return format("SYSTEM.Automation.BlockedField", { name, label, field: fieldLabel(field) });
  if ((effect === "asleep" || effect === "yawning") && actor.statuses.has("insomnia")) {
    return format("SYSTEM.Automation.BlockedInsomnia", { name, label });
  }
  const immunity = getRules(actor, "conditionImmunity").find(rule => rule.conditions === "any" ? AFFLICTIONS.has(effect) : (rule.conditions ?? []).includes(effect));
  if (immunity) return format("SYSTEM.Automation.BlockedFeature", { name, label, feature: escape(immunity.source) });
  return null;
}

export async function addCondition(actor, statusId, data = {}) {
  const ActiveEffect = foundry.documents.ActiveEffect.implementation;
  const effect = await ActiveEffect.fromStatusEffect(statusId);
  effect.updateSource({ [`flags.${SYSTEM_ID}`]: data });
  return ActiveEffect.create(effect.toObject(), { parent: actor });
}

export async function removeCondition(actor, statusId) {
  const ids = actor.effects.filter(e => e.statuses.has(statusId) && !e.getFlag(SYSTEM_ID, "permanent")).map(e => e.id);
  if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
}

export async function syncPermanentConditions(actor) {
  if (!actor?.isOwner) return;
  const wanted = new Map();
  for (const rule of getRules(actor, "permanentCondition")) {
    if (CONFIG.statusEffects.some(status => status.id === rule.condition)) wanted.set(rule.condition, rule.source);
  }
  const existing = actor.effects.filter(effect => effect.getFlag(SYSTEM_ID, "permanent"));
  const stale = existing.filter(effect => ![...effect.statuses].some(status => wanted.has(status))).map(effect => effect.id);
  if (stale.length) await actor.deleteEmbeddedDocuments("ActiveEffect", stale);
  for (const [condition, source] of wanted) {
    if (existing.some(effect => effect.statuses.has(condition))) continue;
    await addCondition(actor, condition, { permanent: true, sourceName: source });
  }
}

function conditionEffect(actor, statusId) {
  return actor.effects.find(e => e.statuses.has(statusId));
}

export async function syncStatChangeIcons(actor) {
  for (const stat of statKeys) {
    const change = actor.system.statChanges?.[stat] ?? 0;
    await actor.toggleStatusEffect(`${stat}Up`, { active: change > 0 });
    await actor.toggleStatusEffect(`${stat}Down`, { active: change < 0 });
  }
}

async function rollD6(actor, flavor) {
  const roll = await new Roll("1d6").evaluate();
  await roll.toMessage({ speaker: foundry.documents.ChatMessage.implementation.getSpeaker({ actor }), flavor });
  return roll.total;
}

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
  if (move.system.isStatus && hasRule(actor, "blockStatusMoves")) return block("SYSTEM.Automation.CannotUseStatusMoves");

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

async function tickDamage(actor, formula, label) {
  const roll = await new Roll(formula).evaluate();
  await roll.toMessage({ speaker: foundry.documents.ChatMessage.implementation.getSpeaker({ actor }), flavor: label });
  await actor.system.applyDamage?.({ amount: roll.total, label });
}

async function tickHeal(actor, formula, label) {
  const roll = await new Roll(formula).evaluate();
  await roll.toMessage({ speaker: foundry.documents.ChatMessage.implementation.getSpeaker({ actor }), flavor: label });
  await actor.system.heal?.(roll.total, label);
}

export async function processStartOfTurn(actor) {
  if (!actor?.system?.hp) return;
  const name = escape(actor.name);
  const lines = [];

  for (const statusId of untilNextTurnConditions) {
    if (!actor.statuses.has(statusId)) continue;
    await removeCondition(actor, statusId);
    lines.push(format("SYSTEM.Automation.ConditionEnded", { name, label: localize(effects[statusId]) }));
  }

  for (const effect of actor.effects.contents) {
    const remaining = effect.getFlag(SYSTEM_ID, "remaining");
    if (typeof remaining !== "number") continue;
    if (remaining <= 1) {
      await effect.delete();
      lines.push(format("SYSTEM.Automation.ConditionEnded", { name, label: escape(effect.name) }));
    }
    else await effect.setFlag(SYSTEM_ID, "remaining", remaining - 1);
  }

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

  if (actor.statuses.has("frozen") && familyOf(weatherFor(actor)) === "harshSunlight") {
    await removeCondition(actor, "frozen");
    await postAutomationMessage(actor, [format("SYSTEM.Automation.Thawed", { name })]);
  }
  if (terrainFor(actor) === "grassyTerrain" && actor.system.hp.raw < actor.system.hp.max) await tickHeal(actor, "1d6", fieldLabel("grassyTerrain"));

  for (const rule of getRules(actor, "onTurnStart")) {
    if (rule.damage) await tickDamage(actor, rule.damage, rule.source);
    if (rule.effects?.length) await applyEffectsLocal(actor, rule.effects, { sourceUuid: actor.uuid, sourceName: actor.name });
  }

  if (actor.statuses.has("burned")) await tickDamage(actor, "1d6", localize("SYSTEM.Conditions.Burned"));
  const poisonHeals = hasRule(actor, "poisonHeal");
  if (poisonHeals && (actor.statuses.has("poisoned") || actor.statuses.has("badlyPoisoned"))) {
    const roll = await new Roll("1d6").evaluate();
    await roll.toMessage({ speaker: foundry.documents.ChatMessage.implementation.getSpeaker({ actor }), flavor: getRules(actor, "poisonHeal")[0].source });
    await actor.system.heal?.(roll.total, getRules(actor, "poisonHeal")[0].source);
  }
  if (actor.statuses.has("poisoned") && !poisonHeals) await tickDamage(actor, "1d6", localize("SYSTEM.Conditions.Poisoned"));
  if (actor.statuses.has("badlyPoisoned") && !poisonHeals) {
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
  if (hasRule(actor, "earlyBird")) {
    await removeCondition(actor, "asleep");
    await postAutomationMessage(actor, [format("SYSTEM.Automation.FeatureTriggered", { name, feature: escape(getRules(actor, "earlyBird")[0].source) }), format("SYSTEM.Automation.WokeUp", { name })]);
    return;
  }
  if (typeof duration !== "number") {
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
  if (typeof rounds !== "number") {
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
  if (typeof dc !== "number" || !skill) {
    await postAutomationMessage(actor, [format("SYSTEM.Automation.RerollReminder", { name, label })]);
    return;
  }
  const roll = new ExplorersRoll(getDieString({ ...getSkillDie(actor, skill), advantage: isHungry(actor) ? 'disadvantage' : 'normal' }), {}, { dc });
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

export async function processEndOfTurn(actor) {
  if (!actor?.system?.hp) return;
  if (actor.statuses.has("flinched")) {
    await removeCondition(actor, "flinched");
    await postAutomationMessage(actor, [format("SYSTEM.Automation.ConditionEnded", { name: escape(actor.name), label: localize(effects.flinched) })]);
  }
  if (actor.system.hp.raw <= 0) return;
  if (actor.statuses.has("seeded")) {
    const { sourceUuid } = conditionEffect(actor, "seeded")?.flags?.[SYSTEM_ID] ?? {};
    const label = localize(effects.seeded);
    const roll = await new Roll("1d6").evaluate();
    await roll.toMessage({ speaker: foundry.documents.ChatMessage.implementation.getSpeaker({ actor }), flavor: label });
    await actor.system.applyDamage?.({ amount: roll.total, label });
    const seeder = sourceUuid ? await fromUuid(sourceUuid) : null;
    if (seeder && seeder !== actor && seeder.system?.hp?.raw > 0) await healActor(seeder, roll.total, label);
  }
  if (harshWeatherFor(actor) === "sandstorm") await tickDamage(actor, "1d6", fieldLabel("sandstorm"));
  for (const rule of getRules(actor, "onTurnEnd")) {
    if (actor.system.hp.raw <= 0) return;
    if (rule.damage) await tickDamage(actor, rule.damage, rule.source);
    if (rule.heal) await tickHeal(actor, rule.heal, rule.source);
    if (rule.cure) await cureConditionsLocal(actor, rule.cure === "any" ? [...AFFLICTIONS] : rule.cure);
    if (!rule.effects?.length) continue;
    await postAutomationMessage(actor, [format("SYSTEM.Automation.FeatureTriggered", { name: escape(actor.name), feature: escape(rule.source) })]);
    await applyEffectsLocal(actor, rule.effects, { sourceUuid: actor.uuid, sourceName: actor.name });
  }
}
