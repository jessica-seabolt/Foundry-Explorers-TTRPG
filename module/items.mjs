import { SYSTEM_ID, getSkillDie, getDieString, applyTypeMatchup } from '../constants.mjs';
import {
  FAINTED_STATUS, applyDamage, applyEffects, consumeItem, cureConditions, healActor, postAutomationMessage, registerActorOp, runAsOwner
} from './conditions.mjs';
import { DamageRoll, ExplorersRoll, StatusRoll } from './explorers-roll.mjs';
import { AFFLICTIONS, getRules, heldItemOf } from './features.mjs';
import { registerSocketHandler, requestFromGM } from './socket.mjs';
import { checkAction, recordAction } from './turns.mjs';
import { includesSelf, tileDistance } from './targeting-geometry.mjs';
import { getActorToken, pickTargets } from './targeting.mjs';
import { abilities, typeMatchups } from './types.mjs';
import { postRoll, rollSetup } from './roll-confirm.mjs';
import { applyFieldEffect } from './weather.mjs';

const { DialogV2 } = foundry.applications.api;
const { Roll } = foundry.dice;
const { ChatMessage } = foundry.documents;

const localize = key => game.i18n.localize(key);
const format = (key, data) => game.i18n.format(key, data);
const escape = text => foundry.utils.escapeHTML(text ?? "");

export const USE_EFFECTS = {
  heal: '{"type":"heal","amount":100}  (or "full":true, "percent":25, "formula":"2d6")',
  cure: '{"type":"cure","conditions":["paralyzed"]}  (or "all":true)',
  effects: '{"type":"effects","effects":[{"effect":"speUp","effectCount":2}]}',
  randomCondition: '{"type":"randomCondition","conditions":["poisoned","paralyzed","asleep","burned","confused","frozen"]}',
  restorePP: '{"type":"restorePP","amount":10}  (or "full":true; "all":true for every Move)',
  maxHp: '{"type":"maxHp","amount":5}',
  stat: '{"type":"stat","stat":"iq","amount":5,"types":["dark"]}  (permanent; "types" limits who benefits)',
  belly: '{"type":"belly","halves":1}  (or "days":7)',
  hunger: '{"type":"hunger","days":2}',
  revive: '{"type":"revive","hp":"full","restorePP":true}  ("hp" can be "half")',
  damage: '{"type":"damage","formula":"2d6","moveType":"fire"}',
  cleanse: '{"type":"cleanse"}  (un-sticks the Held Item and the Team bag)',
  field: '{"type":"field","effect":"rain"}  (any Weather or Terrain; "lock":true stops the Weather changing)',
};

const isHarmfulEffect = ({ effect }) => AFFLICTIONS.has(effect) || effect.endsWith("Down");

export async function chooseUser(holder) {
  if (holder.type !== "Team") return holder;
  const members = holder.system.memberActors.filter(actor => actor.isOwner);
  if (!members.length) {
    ui.notifications.warn("SYSTEM.Team.NoMember", { localize: true });
    return null;
  }
  if (game.user.character && members.includes(game.user.character)) return game.user.character;
  if (members.length === 1) return members[0];
  return chooseFrom(localize("SYSTEM.Team.ChooseUser"), members.map(actor => ({ value: actor.uuid, label: actor.name })))
    .then(uuid => uuid ? fromUuidSync(uuid) : null);
}

async function chooseFrom(title, options) {
  const select = `<select name="choice">${options.map(o => `<option value="${o.value}">${escape(o.label)}</option>`).join("")}</select>`;
  try {
    return await DialogV2.prompt({
      window: { title },
      content: `<div class="form-group"><div class="form-fields">${select}</div></div>`,
      ok: { label: localize("SYSTEM.Targeting.Confirm"), callback: (event, button) => button.form.elements.choice.value },
      rejectClose: false
    });
  } catch {
    return null;
  }
}

function adjacentAllies(user) {
  const token = globalThis.canvas?.ready ? getActorToken(user) : null;
  if (!token) return [];
  const cells = token.document.getOccupiedGridSpaceOffsets();
  return canvas.tokens.placeables.filter(other => other !== token && other.actor && other.actor !== user
    && other.document.disposition === token.document.disposition
    && tileDistance(cells, other.document.getOccupiedGridSpaceOffsets()) <= 1).map(other => other.actor);
}

function itemAsMove(item, overrides = {}) {
  const system = item.system;
  return {
    name: item.name,
    img: item.img,
    actor: null,
    system: {
      target: system.target, range: system.range, rangeCount: system.rangeCount, description: system.description,
      isPhysical: false, isStatus: true, power: 0, level: 1, hasTag: () => false, ...overrides
    }
  };
}

const targetedActors = () => Array.from(game.user.targets).map(token => token.actor).filter(_ => _);

export async function useItem(item, { user = null } = {}) {
  if (isSticky(item)) return;
  user ??= await chooseUser(item.actor);
  if (!user || !checkAction(user, "item").allowed) return;
  const system = item.system;

  let recipients = [user];
  if (system.target && system.target !== 'self') {
    if (!await pickTargets(user, itemAsMove(item))) return;
    const targeted = targetedActors();
    recipients = includesSelf(system.target) ? [user, ...targeted.filter(actor => actor !== user)] : targeted;
    if (!recipients.length) {
      ui.notifications.warn("SYSTEM.Targeting.NoTargets", { localize: true });
      return;
    }
  }
  else {
    const allies = adjacentAllies(user);
    if (allies.length) {
      const uuid = await chooseFrom(format("SYSTEM.Items.ChooseRecipient", { item: escape(item.name) }), [
        { value: user.uuid, label: format("SYSTEM.Items.Yourself", { name: user.name }) },
        ...allies.map(ally => ({ value: ally.uuid, label: ally.name }))
      ]);
      if (!uuid) return;
      recipients = [fromUuidSync(uuid)];
    }
  }

  await recordAction(user, "item");
  await postItemCard(user, item, "SYSTEM.Items.Used");
  const onUse = await resolveChoices(system.onUse, recipients[0]);
  const harmful = onUse.filter(rule => rule.type === "effects").flatMap(rule => rule.effects ?? []).filter(isHarmfulEffect);
  for (const recipient of recipients) {
    if (recipient !== user && harmful.length) {
      const traps = await rollTraps(user, item);
      await postStatusCheck(user, recipient, item, traps.total, harmful);
      const rest = onUse.filter(rule => rule.type !== "effects");
      if (rest.length) await runAsOwner(recipient, "useEffects", { rules: rest, context: useContext(user, item) });
    }
    else await runAsOwner(recipient, "useEffects", { rules: onUse, context: useContext(user, item) });
  }
  if (system.manualNote) await postAutomationMessage(user, [format("SYSTEM.Items.ManualNote", { item: escape(item.name), note: escape(system.manualNote) })]);
  if (system.consumable) await consumeItem(item);
}

function isSticky(item) {
  if (!item.getFlag?.(SYSTEM_ID, "sticky")) return false;
  ui.notifications.warn(format("SYSTEM.Traps.IsSticky", { item: escape(item.name) }));
  return true;
}

export async function throwItem(item, { user = null } = {}) {
  if (isSticky(item)) return;
  user ??= await chooseUser(item.actor);
  if (!user || !checkAction(user, "item").allowed) return;
  const system = item.system;
  const traps = await rollTraps(user, item);
  const arc = system.throwMode === 'arc';
  const distance = Math.max(arc ? Math.floor(traps.total / 2) : traps.total, 1);
  const move = itemAsMove(item, { target: 'any', range: arc ? 'away' : 'ahead', rangeCount: distance });
  if (!await pickTargets(user, move, { force: true })) return;
  await recordAction(user, "item");
  const target = targetedActors().find(actor => actor !== user) ?? null;

  if (!target) await postAutomationMessage(user, [format("SYSTEM.Items.ThrowMissed", { name: escape(user.name), item: escape(item.name) })]);
  else {
    if (system.throwDamage) await throwDamage(user, target, item);
    const onUse = await resolveChoices(system.onUse.filter(rule => rule.type !== "damage"), target);
    const harmful = onUse.filter(rule => rule.type === "effects").flatMap(rule => rule.effects ?? []).filter(isHarmfulEffect);
    if (harmful.length) await postStatusCheck(user, target, item, traps.total, harmful);
    const rest = onUse.filter(rule => !(rule.type === "effects" && harmful.length));
    if (rest.length) await runAsOwner(target, "useEffects", { rules: rest, context: useContext(user, item) });
  }
  if (system.consumable) await consumeItem(item);
}

async function throwDamage(user, target, item) {
  const { throwDamage: formula, throwType } = item.system;
  const match = formula.match(/^(\d+)d6$/);
  let rollFormula = formula;
  let flavor = `${item.name} (${target.name})`;
  if (match) {
    const die = { sides: Number(match[1]), modifier: 0, advantage: 'normal', multiplier: 1, highCrit: false };
    const matchup = throwType ? target.system.getTypeMatchup?.(throwType) : null;
    const result = matchup ? applyTypeMatchup(die, matchup) : 0;
    if (result) flavor = `${result > 0 ? "+" : "-"}${localize(typeMatchups[matchup])}<br>${flavor}`;
    rollFormula = getDieString(die);
  }
  const options = { targetId: target.uuid, attackerUuid: user.uuid, moveType: throwType, moveName: item.name, resistAbility: null };
  const purpose = { title: format("SYSTEM.Confirm.Titles.Throw", { name: escape(user.name), item: escape(item.name) }),
    text: format("SYSTEM.Confirm.Purpose.Throw", { name: escape(user.name), item: escape(item.name), target: escape(target.name) }) };
  const setup = rollSetup(rollFormula, { rollClass: "DamageRoll", options, explode: true });
  const { roll, message } = await postRoll(setup ?? new DamageRoll(rollFormula, {}, options), {
    speaker: ChatMessage.implementation.getSpeaker({ actor: user }), flavor
  }, { actor: user, purpose });
  const result = await applyDamage(target, roll.damageOptions);
  if (result !== undefined) await message?.setFlag?.("explorers", "damageApplied", true);
}

async function rollTraps(user, item) {
  const { sides, modifier } = getSkillDie(user, 'traps');
  const { roll } = await postRoll({ dice: sides, modifier, rollClass: "ExplorersRoll" }, {
    speaker: ChatMessage.implementation.getSpeaker({ actor: user }),
    flavor: format("SYSTEM.Items.TrapsCheck", { item: escape(item.name) })
  }, { actor: user, purpose: {
    title: format("SYSTEM.Confirm.Titles.Throw", { name: escape(user.name), item: escape(item.name) }),
    text: format("SYSTEM.Confirm.Purpose.TrapsCheck", { name: escape(user.name), item: escape(item.name) })
  } });
  return roll;
}

async function postStatusCheck(user, target, item, total, effects) {
  const roll = new StatusRoll(String(total), {}, {
    effects, onLandEffects: [], resistSkill: 'endurance', attackerUuid: user.uuid, targetId: target.uuid,
    moveName: item.name, moveType: null, resistBonusDice: 0
  });
  await roll.evaluate();
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor: user }),
    flavor: `${item.name} (${target.name}) - ${localize("SYSTEM.Automation.Status")}`,
    rolls: [roll]
  });
}

async function postItemCard(user, item, key) {
  const description = item.system.description ? `<p>${escape(item.system.description)}</p>` : "";
  await ChatMessage.implementation.create({
    speaker: ChatMessage.implementation.getSpeaker({ actor: user }),
    content: `<p><img src="${item.img}" width="24" height="24" style="vertical-align:middle;border:none"> <strong>${format(key, { name: escape(user.name), item: escape(item.name) })}</strong></p>${description}`
  });
}

const useContext = (user, item) => ({ sourceUuid: user.uuid, sourceName: user.name, itemName: item.name });

async function resolveChoices(rules, recipient) {
  const resolved = [];
  for (const rule of rules) {
    if (rule.type === "restorePP" && !rule.all && !rule.moveId) {
      const moves = recipient.items.filter(item => item.type === "Move");
      if (!moves.length) continue;
      const moveId = moves.length === 1 ? moves[0].id : await chooseFrom(localize("SYSTEM.Items.ChooseMove"),
        moves.map(move => ({ value: move.id, label: `${move.name} (${move.system.ppLeft}/${move.system.pp} PP)` })));
      if (!moveId) continue;
      resolved.push({ ...rule, moveId });
    }
    else resolved.push(rule);
  }
  return resolved;
}

export async function applyUseEffectsLocal(actor, rules, context = {}) {
  const lines = [];
  const name = escape(actor.name);
  const system = actor.system;
  const label = context.itemName ?? "";
  for (const rule of rules) {
    switch (rule.type) {
      case "heal": {
        let amount = rule.amount ?? 0;
        if (rule.full) amount = system.hp.max;
        else if (rule.percent) amount = Math.floor(system.hp.max * rule.percent / 100);
        else if (rule.formula) amount = (await new Roll(rule.formula).evaluate()).total;
        await system.heal?.(amount, label);
        break;
      }
      case "cure":
        await cureConditions(actor, rule.all ? [...AFFLICTIONS] : (rule.conditions ?? []));
        break;
      case "effects":
        await applyEffects(actor, rule.effects ?? [], { sourceUuid: context.sourceUuid, sourceName: context.sourceName });
        break;
      case "randomCondition": {
        const list = rule.conditions ?? [];
        const roll = await new Roll(`1d${list.length}`).evaluate();
        await roll.toMessage({ speaker: ChatMessage.implementation.getSpeaker({ actor }), flavor: label });
        await applyEffects(actor, [{ effect: list[roll.total - 1] }], { sourceUuid: context.sourceUuid, sourceName: context.sourceName });
        break;
      }
      case "restorePP": {
        const moves = actor.items.filter(item => item.type === "Move" && (rule.all || item.id === rule.moveId));
        const updates = moves.map(move => ({ _id: move.id, "system.ppLeft": rule.full ? move.system.pp : Math.min(move.system.pp, move.system.ppLeft + (rule.amount ?? 0)) }));
        if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
        lines.push(format("SYSTEM.Items.PPRestored", { name, moves: moves.map(move => escape(move.name)).join(", ") }));
        break;
      }
      case "maxHp": {
        const path = "bonus" in system.hp ? "system.hp.bonus" : "system.hp.max";
        const current = "bonus" in system.hp ? system.hp.bonus : system.hp.max;
        await actor.update({ [path]: current + rule.amount, "system.hp.raw": system.hp.raw + rule.amount });
        lines.push(format("SYSTEM.Items.MaxHpUp", { name, amount: rule.amount }));
        break;
      }
      case "stat": {
        if (rule.types && !rule.types.some(type => [system.type1, system.type2].includes(type))) {
          lines.push(format("SYSTEM.Items.NoBenefit", { name, item: escape(label) }));
          break;
        }
        await actor.update({ [`system.abilities.${rule.stat}.raw`]: system.abilities[rule.stat].raw + rule.amount });
        lines.push(format("SYSTEM.Items.StatUp", { name, stat: localize(abilities[rule.stat]), amount: rule.amount }));
        break;
      }
      case "belly":
        if (system.belly) {
          if (rule.days) await actor.update({ "system.belly.fedDays": Math.max(system.belly.fedDays, rule.days) });
          else await actor.update({ "system.belly.eaten": system.belly.eaten + (rule.halves ?? 1) });
          lines.push(format("SYSTEM.Items.Ate", { name, item: escape(label) }));
        }
        break;
      case "hunger":
        if (system.belly) await actor.update({ "system.belly.eaten": 0, "system.belly.fedDays": 0, "system.belly.hungryDays": rule.days ?? 2 });
        break;
      case "revive": {
        if (system.hp.raw > 0 && !actor.statuses.has(FAINTED_STATUS)) {
          lines.push(format("SYSTEM.Items.NotFainted", { name }));
          break;
        }
        const hp = rule.hp === "half" ? Math.floor(system.hp.max / 2) : system.hp.max;
        await actor.update({ "system.hp.raw": hp });
        await actor.toggleStatusEffect(FAINTED_STATUS, { active: false });
        if (rule.restorePP) {
          const updates = actor.items.filter(item => item.type === "Move").map(move => ({ _id: move.id, "system.ppLeft": move.system.pp }));
          if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
        }
        lines.push(format("SYSTEM.Items.Revived", { name }));
        break;
      }
      case "damage": {
        const roll = await new Roll(rule.formula).evaluate();
        await roll.toMessage({ speaker: ChatMessage.implementation.getSpeaker({ actor }), flavor: label });
        await system.applyDamage?.({ amount: roll.total, moveType: rule.moveType ?? null, label, isAttack: true, attackerUuid: context.sourceUuid });
        break;
      }
      case "cleanse": {
        const held = heldItemOf(actor);
        const items = [...(held ? [held] : []), ...(teamOf(actor)?.items.contents ?? [])].filter(item => item.getFlag(SYSTEM_ID, "sticky"));
        for (const item of items) await item.unsetFlag(SYSTEM_ID, "sticky");
        lines.push(format("SYSTEM.Items.Cleansed", { count: items.length }));
        break;
      }
      case "field":
        await applyFieldEffect(actor, rule.effect, rule.lock === undefined ? {} : { locked: !!rule.lock });
        break;
    }
  }
  await postAutomationMessage(actor, lines);
}

registerActorOp("useEffects", (actor, { rules, context }) => applyUseEffectsLocal(actor, rules, context));

export async function transferItem(item, toActor, { hold = false } = {}) {
  const fromActor = item.actor;
  const data = item.toObject();
  delete data._id;
  const [created] = await toActor.createEmbeddedDocuments("Item", [data]);
  if (hold && created) await toActor.update({ "system.heldItem": created.id });
  if (fromActor?.system?.heldItem === item.id) await fromActor.update({ "system.heldItem": null });
  await item.delete();
  return created;
}

export async function holdItem(actor, item) {
  if (item.actor === actor && actor.system.heldItem === item.id) return item;
  const previous = heldItemOf(actor);
  const team = teamOf(actor);
  if (previous) {
    if (team) await transferItem(previous, team);
    else await previous.delete();
  }
  if (item.actor === actor) {
    await actor.update({ "system.heldItem": item.id });
    return item;
  }
  if (item.actor?.isOwner) return transferItem(item, actor, { hold: true });
  const data = item.toObject();
  delete data._id;
  const [created] = await actor.createEmbeddedDocuments("Item", [data]);
  await actor.update({ "system.heldItem": created.id });
  return created;
}

export async function stealHeldItem(thief, target) {
  if (!thief || !target) return null;
  if (!game.user.isGM) return requestFromGM(STEAL_ACTION, { thiefUuid: thief.uuid, targetUuid: target.uuid });
  const item = heldItemOf(target);
  if (!item) return null;
  const name = escape(thief.name), targetName = escape(target.name), itemName = escape(item.name);
  const guard = getRules(target, "keepHeldItem")[0];
  if (guard) {
    await postAutomationMessage(target, [format("SYSTEM.Items.StealBlocked", { name: targetName, feature: escape(guard.source), item: itemName })]);
    return null;
  }
  const team = teamOf(thief);
  let stolen = null;
  if (!heldItemOf(thief)) stolen = await transferItem(item, thief, { hold: true });
  else if (team && team.system.bagCount < team.system.capacity) stolen = await transferItem(item, team);
  if (!stolen) {
    await postAutomationMessage(thief, [format("SYSTEM.Items.StealNoRoom", { name, target: targetName, item: itemName })]);
    return null;
  }
  await postAutomationMessage(thief, [format("SYSTEM.Items.Stole", { name, target: targetName, item: itemName })]);
  return stolen.id;
}

const STEAL_ACTION = "stealHeldItem";
registerSocketHandler(STEAL_ACTION, async ({ thiefUuid, targetUuid }) => {
  const [thief, target] = await Promise.all([fromUuid(thiefUuid), fromUuid(targetUuid)]);
  return stealHeldItem(thief, target);
});

export function teamOf(actor) {
  return game.actors?.find(team => team.type === "Team" && team.system.members.includes(actor.uuid)) ?? null;
}
