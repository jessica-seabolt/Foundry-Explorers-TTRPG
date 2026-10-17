import { SYSTEM_ID, filePath, getSkillDie, getMoveDie, getStatusDie, getDieString, applyTypeMatchup, getSelectedActors, isHungry } from '../constants.mjs';
import { applyDamage, applyEffects, checkMoveConditions, consumeRuleItem, healActor, postAutomationMessage, removeCondition } from './conditions.mjs';
import { DamageRoll, ExplorersRoll, StatusRoll } from './explorers-roll.mjs';
import { emitToGM, registerSocketHandler } from './socket.mjs';
import { aimOpportunityStrike, pickTargets } from './targeting.mjs';
import { critRangeMin, effectiveMoveType, getRules, hasCondition, hasRule, heldItemOf, moveImmunity, movePowerBonus } from './features.mjs';
import { stealHeldItem } from './items.mjs';
import { canAct, checkAction, recordAction } from './turns.mjs';
import { advantage, effects, skills, typeMatchups } from './types.mjs';
import { applyFieldEffect, awarenessHindered, fieldLabel, fieldMatchup, fieldPower, noChargeWeather, priorityBlocked } from './weather.mjs';

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;
const { ChatMessage } = foundry.documents;
const { Roll } = foundry.dice;

const localize = key => game.i18n.localize(key);
const format = (key, data) => game.i18n.format(key, data);
const escape = text => foundry.utils.escapeHTML(text ?? "");
const effectList = list => list.map(({ effect, effectCount }) =>
  `${localize(effects[effect] ?? effect)}${effectCount ? ` (${effectCount})` : ""}`).join(", ");

export class RollDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    tag: "form",
    form: {
      submitOnChange: true
    },
    actions: {
      setMessageMode: RollDialog.#setMessageMode
    }
  }

  static PARTS = {
    roll: { template: filePath("templates/roll/roll.hbs") }
  }

  constructor(options={}) {
    super(options);
    this.messageMode = 'publicroll';
    this.dialogState = {
      extraDie: options.extraDie ?? 0,
      extraModifier: 0,
      multiplier: 1,
      advantage: 'normal',
      highCrit: false,
      dc: options.dc ?? null
    };
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.dialogState = this.dialogState;
    context.advantage = advantage;
    context.messageMode = this.messageMode;
    return context;
  }

  _onChangeForm(config, event) {
    super._onChangeForm(config, event);
    const inputName = event.target.dataset.name;
    if (this.dialogState[inputName] !== undefined) {
      if (inputName === 'dc') {
        this.dialogState.dc = event.target.value === '' ? null : Number(event.target.value);
      }
      else if (typeof this.dialogState[inputName] == 'number') {
        this.dialogState[inputName] = Number(event.target.value);
      }
      else if (typeof this.dialogState[inputName] == 'boolean') {
        this.dialogState[inputName] = event.target.checked;
      }
      else this.dialogState[inputName] = event.target.value;
    }
  }

  getDialogDie() {
    return {
      sides: this.dialogState.extraDie,
      modifier: this.dialogState.extraModifier,
      advantage: this.dialogState.advantage,
      multiplier: this.dialogState.multiplier,
      highCrit: this.dialogState.highCrit
    }
  }

  getDC() {
    return this.dialogState.dc;
  }

  static #setMessageMode(event, target) {
    this.messageMode = target.dataset.messagemode;
    this.render();
  }

  async toChatMessage(roll, chatData) {
    await roll.evaluate();
    const dcFlavor = roll.success === null ? "" : roll.success
      ? `<br><span style="color:green;font-weight:bold;">${localize("SYSTEM.Dice.Success")}</span>`
      : `<br><span style="color:red;font-weight:bold;">${localize("SYSTEM.Dice.Failure")}</span>`;
    chatData = {
      ...chatData,
      rolls: [roll],
      speaker: ChatMessage.implementation.getSpeaker({ actor: this.user }),
    }
    chatData.flavor = `${chatData.flavor}${dcFlavor}`;
    ChatMessage.applyRollMode(chatData, this.messageMode);
    this.lastMessage = await ChatMessage.create(chatData);
    return roll;
  }
}

export class SkillRollDialog extends RollDialog {
  static DEFAULT_OPTIONS = {
    actions: {
      roll: SkillRollDialog.#rollSkill
    }
  }

  get title() {
    const { sides, modifier } = getSkillDie(this.user, this.skill);
    const title = `${this.user.name}: ${localize(skills[this.skill])} (Base ${sides}d6x+${modifier})`;
    return this.statusRoll ? `${title} ${format("SYSTEM.Automation.ResistTitle", { move: this.statusRoll.options.moveName })}` : title;
  }

  constructor(options={}) {
    const { userId, skill } = options;
    const user = options.user ?? game.actors.get(userId);
    if (!user) throw new Error("No user given.");
    if (!skill) throw new Error("No skill given.");
    super(options);
    this.user = user;
    this.skill = skill;
    this.statusRoll = options.statusRoll ?? null;
    this.statusMessage = options.statusMessage ?? null;
    if (isHungry(user) || (skill === 'awareness' && awarenessHindered(user))) this.dialogState.advantage = 'disadvantage';
  }

  static async #rollSkill() {
    const die = this.getDialogDie();
    const { sides, modifier } = getSkillDie(this.user, this.skill);
    die.sides += sides;
    die.modifier += modifier;

    if (!this.statusRoll && canAct(this.user, "skill").allowed) await recordAction(this.user, "skill");
    if (this.statusRoll) {
      const roll = await this.toChatMessage(new ExplorersRoll(getDieString(die), {}, { dc: this.getDC() }), {
        flavor: `${localize(skills[this.skill])} ${format("SYSTEM.Automation.ResistTitle", { move: escape(this.statusRoll.options.moveName) })}`,
      });
      await resolveStatusCheck(this.user, this.statusRoll, roll, this.statusMessage);
      this.close();
      return;
    }

    const targetRolls = game.user.targets.size > 0 ? game.user.targets.map(target => target.actor?.system) : [null];
    for (const target of targetRolls) {
      this.toChatMessage(new ExplorersRoll(getDieString(die), {}, { dc: this.getDC() }), {
        flavor: `${localize(skills[this.skill])}${target ? ` (${target.parent.name})` : ""}`,
      });
    }
  }
}

function resistBonusDice(actor, statusRoll) {
  return (statusRoll.options.resistBonusDice ?? 0) + (actor.statuses.has('guarding') ? 1 : 0);
}

export function openResistDialog(statusRoll, statusMessage = null) {
  const { targetId, resistSkill } = statusRoll.options;
  const actors = targetId ? [fromUuidSync(targetId)].filter(_ => _) : (getSelectedActors() ?? []);
  if (!actors.length) ui.notifications.error("SYSTEM.Automation.NoActorSelected", { localize: true });
  for (const actor of actors) {
    const dialog = new SkillRollDialog({
      user: actor, skill: resistSkill, dc: statusRoll.total, extraDie: resistBonusDice(actor, statusRoll), statusRoll, statusMessage
    });
    Promise.resolve(dialog.render({ force: true })).then(() => dialog.bringToFront?.());
  }
}

async function rollStatusCheck(actor, statusRoll, statusMessage) {
  const { sides, modifier } = getSkillDie(actor, statusRoll.options.resistSkill);
  const advantage = isHungry(actor) ? 'disadvantage' : 'normal';
  const roll = new ExplorersRoll(getDieString({ sides: sides + resistBonusDice(actor, statusRoll), modifier, advantage }), {}, { dc: statusRoll.total });
  await roll.evaluate();
  await roll.toMessage({
    speaker: ChatMessage.implementation.getSpeaker({ actor }),
    flavor: `${localize(skills[statusRoll.options.resistSkill])} ${format("SYSTEM.Automation.ResistTitle", { move: escape(statusRoll.options.moveName) })}`
      + `<br><span style="color:${roll.success ? "green" : "red"};font-weight:bold;">${localize(roll.success ? "SYSTEM.Dice.Success" : "SYSTEM.Dice.Failure")}</span>`
  });
  await resolveStatusCheck(actor, statusRoll, roll, statusMessage);
}

const MARK_RESOLVED_ACTION = "markStatusResolved";
registerSocketHandler(MARK_RESOLVED_ACTION, ({ messageId }) => game.messages.get(messageId)?.setFlag(SYSTEM_ID, "statusResolved", true));

async function markStatusCheckResolved(message) {
  if (!message) return;
  if (message.isOwner) await message.setFlag(SYSTEM_ID, "statusResolved", true);
  else emitToGM(MARK_RESOLVED_ACTION, { messageId: message.id });
}

function statusCheckResolver(message, actor) {
  const canSee = user => !message.whisper.length || message.whisper.includes(user.id);
  const players = game.users.filter(user => user.active && !user.isGM && canSee(user) && actor.testUserPermission(user, "OWNER"))
    .sort((a, b) => a.id.localeCompare(b.id));
  const ownsDirectly = user => (actor.ownership?.[user.id] ?? 0) >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
  return players.find(user => user.character === actor) ?? players.find(ownsDirectly) ?? players[0] ?? game.users.activeGM;
}

export function registerStatusCheckHooks() {
  Hooks.on("createChatMessage", message => {
    const statusRoll = message.rolls.find(roll => roll instanceof StatusRoll);
    if (!statusRoll?.options.targetId) return;
    const actor = fromUuidSync(statusRoll.options.targetId);
    if (!actor || statusCheckResolver(message, actor) !== game.user) return;
    if (game.user.isGM && game.settings.get(SYSTEM_ID, "autoRollNpcStatusChecks")) rollStatusCheck(actor, statusRoll, message);
    else openResistDialog(statusRoll, message);
  });
}

async function resolveStatusCheck(actor, statusRoll, roll, statusMessage = null) {
  const { attackerUuid, moveName, moveType, resistSkill, effects: landed = [], onLandEffects = [] } = statusRoll.options;
  await markStatusCheckResolved(statusMessage);
  if (roll.success) {
    await postAutomationMessage(actor, [format("SYSTEM.Automation.Resisted", { name: escape(actor.name), move: escape(moveName) })]);
    return;
  }
  const attacker = attackerUuid ? fromUuidSync(attackerUuid) : null;
  await applyEffects(actor, landed, {
    dc: statusRoll.total, resistSkill, moveType, sourceUuid: attackerUuid, sourceName: attacker?.name, fromOther: actor !== attacker
  });
  if (attacker && onLandEffects.length) await applyEffects(attacker, onLandEffects, { sourceUuid: attackerUuid });
}

const FRIENDLY_TARGETS = new Set(['self', 'selfOrAlly', 'selfAllies', 'allies', 'ally']);

export class MoveRollDialog extends RollDialog {
  static DEFAULT_OPTIONS = {
    actions: {
      use: MoveRollDialog.#use
    }
  }

  get title() {
    const moveDie = getMoveDie(this.user, this.move);
    if (!moveDie) return `${this.user.name}: ${this.move.name}`;
    const { sides, modifier } = moveDie;
    return `${this.user.name}: ${this.move.name} (Base ${sides}d6x+${modifier})`;
  }

  constructor(options={}) {
    const { userId, moveId } = options;
    const user = options.user ?? game.actors.get(userId);
    const move = options.move ?? user?.items.get(moveId) ?? game.items.get(moveId);
    if (!user) throw new Error("No user given.");
    if (!move) throw new Error("No move given.");
    super(options);

    this.user = user;
    this.move = move;
    this.isBasicAttack = !!options.basicAttack;
    this.dialogState.advantage = ''; // Allowed a default option
    this.dialogState.typeMatchup = '';
    this.dialogState.opportunity = false;
    this.dialogState.skipChecks = false;
  }

  static basicAttack(actor) {
    const Item = getDocumentClass("Item");
    const move = new Item({
      name: localize("SYSTEM.Actions.BasicAttack"),
      type: "Move",
      img: "icons/svg/sword.svg",
      system: { type: 'normal', category: 'physical', power: 1, pp: 0, ppLeft: 0, target: 'foe', range: 'front' }
    }, { parent: actor });
    return new MoveRollDialog({ user: actor, move, basicAttack: true });
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.move.system;
    context.typeMatchups = typeMatchups;
    context.isMove = true;
    context.isBasicAttack = this.isBasicAttack;
    return context;
  }

  get #targetActors() {
    const actors = Array.from(game.user.targets).map(token => token.actor).filter(_ => _);
    return actors.length ? actors : [null];
  }

  #spendPP() {
    if (this.isBasicAttack || this.move.actor?.id !== this.user.id) return true;
    const extra = Math.max(0, ...this.#targetActors.filter(_ => _).flatMap(target => getRules(target, "extraPpCost").map(rule => rule.amount ?? 1)));
    if (this.move.system.use(1 + extra)) return true;
    ui.notifications.error("SYSTEM.Automation.OutOfPP", { localize: true });
    return false;
  }

  async #beginUse() {
    if (this.dialogState.opportunity ? !await aimOpportunityStrike(this.user) : !await pickTargets(this.user, this.move)) return false;
    if (!this.dialogState.skipChecks) {
      const { proceed, spendPP } = await checkMoveConditions(this.user, this.move, { targetsFoe: this.move.system.targetsFoe });
      if (!proceed) {
        if (spendPP) this.#spendPP();
        return false;
      }
    }
    if (!this.#spendPP()) return false;
    if (this.move.system.targetsFoe && this.user.statuses.has('invisible')) {
      await removeCondition(this.user, 'invisible');
      await postAutomationMessage(this.user, [format("SYSTEM.Automation.ConditionEnded", { name: escape(this.user.name), label: localize(effects.invisible) })]);
    }
    return true;
  }

  get #resistAbility() {
    const system = this.move.system;
    if (system.hasTag('usesHighestDefense')) return 'highest';
    let isPhysical = system.isPhysical;
    if (system.hasTag('changeDefense')) isPhysical = !isPhysical;
    return isPhysical ? 'def' : 'spdef';
  }

  static async #use() {
    if (!this.isBasicAttack && this.move.getFlag?.(SYSTEM_ID, "sealed")) {
      ui.notifications.warn(format("SYSTEM.Traps.MoveSealed", { move: escape(this.move.name) }));
      return;
    }
    const kind = this.isBasicAttack ? "basicAttack" : "move";
    const reaction = !!this.dialogState.opportunity;
    const priority = !this.isBasicAttack && !!this.move.system.hasTag?.('priority');
    const turn = checkAction(this.user, kind, { reaction, priority });
    if (!turn.allowed) return;
    this.secondMove = !!turn.secondMove;
    if (!await this.#beginUse()) return;
    await recordAction(this.user, kind, { reaction, priority });
    const system = this.move.system;
    const fieldEffects = this.isBasicAttack ? [] : system.getFieldEffects?.() ?? [];
    const hit = system.getSplitEffects('hit');
    const charge = this.isBasicAttack ? null : noChargeWeather(this.user, this.move);
    if (charge) await postAutomationMessage(this.user, [format("SYSTEM.Field.NoCharge", { move: escape(this.move.name), weather: fieldLabel(charge) })]);
    if (system.power > 0) {
      await this.#rollPower();
      if (FRIENDLY_TARGETS.has(system.target)) await this.#applyFriendlyEffects(hit.target);
    }
    else if (system.getTriggerTypes().has('hit') && (hit.target.length || hit.user.length || !fieldEffects.length)) await this.#rollStatusEffects();
    else await this.#postDescription();
    for (const effect of fieldEffects) await applyFieldEffect(this.user, effect, { fromMove: true });
    if (!this.isBasicAttack) await this.#applyUserEffects();
    this.close();
  }

  async #rollPower() {
    const system = this.move.system;
    const isHealing = system.hasTag('healPower');
    const tags = Object.values(system.tags);
    const userSystem = this.user.system;
    const { sides, modifier } = getMoveDie(this.user, this.move);
    const moveType = this.isBasicAttack ? null : effectiveMoveType(this.user, this.move);
    const isPhysical = system.isPhysical;
    const isStab = !this.isBasicAttack && (userSystem.type1 === moveType || userSystem.type2 === moveType);
    const isMultistrike = system.hasTag('multihit') || system.hasTag('multihitHalf');
    const note = (text, good) => `<span style="color:${good ? "green" : "red"};font-weight:bold;">${text}</span><br>`;
    let targets = this.#targetActors;
    if (isHealing && system.target === 'self') targets = [this.user];
    let knockedOut = false;

    for (const target of targets) {
      const die = this.getDialogDie();
      die.sides += sides;
      die.modifier += isHealing ? 0 : modifier;
      let additionString = "";

      if (!isHealing && await this.#fieldAvoids(target)) continue;
      const immunity = target && !this.isBasicAttack && !isHealing ? moveImmunity(target, this.move, moveType) : null;
      if (immunity) {
        await this.#resolveImmunity(target, immunity, die);
        continue;
      }

      let matchup = '';
      if (!this.isBasicAttack && !isHealing) {
        matchup = this.dialogState.typeMatchup;
        if (matchup === '' && target) {
          const chart = target.system.getTypeMatchup?.(moveType) ?? '';
          matchup = fieldMatchup(target, moveType, chart);
          if (matchup !== chart) additionString += note(fieldLabel("strongWinds"), false);
        }
        const steamroll = getRules(this.user, "steamroll").find(rule => (!rule.moveTypes || rule.moveTypes.includes(moveType))
          && (rule.matchups ?? ['notVeryEffective', 'mostlyIneffective', 'immune']).includes(matchup));
        if (steamroll) {
          additionString += note(steamroll.source, true);
          matchup = 'effective';
        }
        const filter = getRules(target, "filter")[0];
        if (filter && ['superEffective', 'extremelyEffective'].includes(matchup)) {
          additionString += note(filter.source, false);
          matchup = 'effective';
        }
        const matchupResult = applyTypeMatchup(die, matchup, { isMultistrike });
        if (matchupResult > 0) additionString += note(`+${localize(typeMatchups[matchup])}`, true);
        else if (matchupResult < 0) additionString += note(`-${localize(typeMatchups[matchup])}`, false);
      }
      if (die.advantage === '') {
        const hungry = isHungry(this.user);
        die.advantage = isStab && !hungry ? 'advantage' : hungry && !isStab ? 'disadvantage' : 'normal';
        if (isStab) additionString += note("+STAB", true);
      }
      if (isHungry(this.user) && !isHealing) {
        die.multiplier *= 0.5;
        additionString += note(localize("SYSTEM.Belly.Hungry"), false);
      }

      const bonus = this.isBasicAttack ? { amount: 0, sources: [], removeSecondary: false }
        : movePowerBonus(this.user, this.move, { target, moveType, isPhysical, isStab, opportunity: this.dialogState.opportunity });
      if (bonus.amount && !isMultistrike) {
        die.sides = Math.max(die.sides + bonus.amount, 1);
        additionString += note(`${bonus.amount > 0 ? "+" : ""}${bonus.amount} ${localize("SYSTEM.Automation.MovePower")} (${bonus.sources.join(", ")})`, bonus.amount > 0);
      }
      const field = this.isBasicAttack ? null : fieldPower(this.user, this.move, { target, moveType, isHealing });
      if (field?.amount && !isMultistrike) {
        const sides = die.sides + field.amount;
// Move Power can't drop below 1, so the damage halves instead.
        if (sides < 1) die.multiplier *= 0.5;
        die.sides = Math.max(sides, 1);
        additionString += note(`${field.amount > 0 ? "+" : ""}${field.amount} ${localize("SYSTEM.Automation.MovePower")} (${field.sources.join(", ")})`, field.amount > 0);
      }
      if (field && field.multiplier !== 1) {
        die.multiplier *= field.multiplier;
        additionString += note(field.halved.join(", "), false);
      }

      if (critRangeMin(this.user) <= 5) die.highCrit = true;
      if (hasRule(target, "noCritsAgainst")) die.explode = false;

      if (this.dialogState.opportunity && !this.isBasicAttack && !isHealing) {
        die.multiplier *= 0.5;
        additionString += note(localize("SYSTEM.Actions.OpportunityStrike"), false);
      }
      if (this.secondMove && !isHealing) {
        die.multiplier *= 0.5;
        additionString += note(localize("SYSTEM.Turns.SecondMove"), false);
      }

      const roll = await this.toChatMessage(new DamageRoll(getDieString(die), {}, {
        dc: this.getDC(),
        resistAbility: this.#resistAbility,
        targetId: target?.uuid ?? null,
        isHealing,
        attackerUuid: this.user.uuid,
        moveType,
        moveCategory: isPhysical ? 'physical' : 'special',
        matchup: matchup || null,
        moveName: this.move.name,
        tags
      }), {
        flavor: `${additionString}${this.move.name}${target ? ` (${target.name})` : ""} - ${localize(isHealing ? "SYSTEM.Automation.Healing" : "SYSTEM.Automation.Power")}`,
      });

      for (const itemId of bonus.consumed ?? []) await consumeRuleItem(this.user, { consume: true, itemId });
      const result = await this.#applyRoll(roll, target, this.lastMessage);
      const fainted = result?.hp <= 0;
      if (fainted) knockedOut = true;
      if (matchup === 'immune') {
        await postAutomationMessage(target ?? this.user, [format("SYSTEM.Automation.ImmuneNoEffect", { name: escape(target?.name ?? ""), move: escape(this.move.name) })]);
        continue;
      }
      if (this.isBasicAttack || isHealing || fainted) continue;
      const shielded = getRules(target, "ignoreSecondary")[0];
      if (bonus.removeSecondary) await postAutomationMessage(this.user, [format("SYSTEM.Automation.NoSecondary", { move: escape(this.move.name) })]);
      else if (shielded) await postAutomationMessage(target, [format("SYSTEM.Automation.FeatureBlockedSecondary", { name: escape(target.name), feature: escape(shielded.source) })]);
      else await this.#applySecondaryEffects(target);
      if (target) await this.#applyOnHit(target, isPhysical);
    }

    if (knockedOut && !this.isBasicAttack) {
      for (const rule of getRules(this.user, "onKnockOut")) {
        await postAutomationMessage(this.user, [format("SYSTEM.Automation.FeatureTriggered", { name: escape(this.user.name), feature: escape(rule.source) })]);
        await applyEffects(this.user, rule.effects ?? [], { sourceUuid: this.user.uuid, sourceName: this.user.name });
      }
    }
  }

  async #fieldAvoids(target, { evasion = true } = {}) {
    if (!target || target === this.user) return false;
    const name = escape(target.name);
    if (priorityBlocked(this.user, target, this.move)) {
      await postAutomationMessage(target, [format("SYSTEM.Field.PriorityBlocked", { name, move: escape(this.move.name) })]);
      return true;
    }
    const rule = evasion ? getRules(target, "evasion")[0] : null;
    if (!rule) return false;
    const chance = rule.chance ?? 3;
    const roll = await new Roll("1d6").evaluate();
    await roll.toMessage({
      speaker: ChatMessage.implementation.getSpeaker({ actor: target }),
      flavor: `${this.move.name} (${target.name}) - ${format("SYSTEM.Field.EvasionCheck", { feature: escape(rule.source), chance })}`
    });
    if (roll.total > chance) return false;
    await postAutomationMessage(target, [format("SYSTEM.Field.Evaded", { name, move: escape(this.move.name), feature: escape(rule.source) })]);
    return true;
  }

  async #resolveImmunity(target, rule, die) {
    const name = escape(target.name);
    if (rule.heal) {
      die.advantage = die.advantage || 'normal';
      const roll = await this.toChatMessage(new DamageRoll(getDieString(die), {}, {
        targetId: target.uuid, isHealing: true, attackerUuid: this.user.uuid, moveName: rule.source
      }), { flavor: `${this.move.name} (${target.name}) - ${format("SYSTEM.Automation.Absorbed", { name, feature: escape(rule.source) })}` });
      await this.#applyRoll(roll, target, this.lastMessage);
    }
    else await postAutomationMessage(target, [format("SYSTEM.Automation.FeatureImmune", { name, move: escape(this.move.name), feature: escape(rule.source) })]);
    if (rule.effects?.length) await applyEffects(target, rule.effects, { sourceUuid: target.uuid, sourceName: target.name });
  }

  async #applyOnHit(target, isPhysical) {
    for (const rule of getRules(this.user, "onHit")) {
      if (rule.physical && !isPhysical) continue;
      if (rule.special && isPhysical) continue;
      if (rule.stealHeldItem && !heldItemOf(target)) continue;
      if (rule.chance && await this.#rollTriggerDie(null, target, rule) < rule.chance) continue;
      await postAutomationMessage(this.user, [format("SYSTEM.Automation.FeatureTriggered", { name: escape(this.user.name), feature: escape(rule.source) })]);
      if (rule.targetEffects?.length) await applyEffects(target, rule.targetEffects, { sourceUuid: this.user.uuid, sourceName: this.user.name, fromOther: true });
      if (rule.stealHeldItem) await stealHeldItem(this.user, target);
    }
  }

  async #applyRoll(roll, target, message) {
    if (!target || !game.settings.get(SYSTEM_ID, "autoApplyDamage")) return null;
    const result = roll.isHealing
      ? await healActor(target, roll.total, this.move.name)
      : await applyDamage(target, roll.damageOptions);
    if (result !== undefined) await message?.setFlag(SYSTEM_ID, "damageApplied", true);
    return result;
  }

  async #applySecondaryEffects(target) {
    const system = this.move.system;
    const hit = system.getSplitEffects('hit');
    if (hit.target.length && system.targetsFoe) await this.#rollStatusAgainst(target, hit.target);

    for (const [trigger, minimum] of [['d6', 6], ['d56', 5]]) {
      const { target: onTarget } = system.getSplitEffects(trigger);
      if (!onTarget.length) continue;
      const roll = await this.#rollTriggerDie(trigger, target);
      if (roll < minimum) continue;
      if (target) await applyEffects(target, onTarget, { sourceUuid: this.user.uuid, sourceName: this.user.name, fromOther: true });
      else await postAutomationMessage(this.user, [format("SYSTEM.Automation.ApplyManually", { effects: effectList(onTarget) })]);
    }
  }

  async #rollTriggerDie(trigger, target, rule = null) {
    const roll = await new Roll("1d6").evaluate();
    const what = rule ? format("SYSTEM.Automation.FeatureChance", { feature: escape(rule.source), chance: rule.chance })
      : localize(`SYSTEM.TriggerTypes.${trigger === 'd6' ? 'D6' : 'D56'}`);
    await roll.toMessage({
      speaker: ChatMessage.implementation.getSpeaker({ actor: this.user }),
      flavor: `${this.move.name}${target ? ` (${target.name})` : ""} - ${what}`
    });
    return roll.total;
  }

  async #applyUserEffects() {
    const system = this.move.system;
    const { user: onUser } = system.getSplitEffects('hit');
    if (onUser.length) await applyEffects(this.user, onUser, { sourceUuid: this.user.uuid, sourceName: this.user.name });
    for (const [trigger, minimum] of [['d6', 6], ['d56', 5]]) {
      const { user: chanceOnUser } = system.getSplitEffects(trigger);
      if (!chanceOnUser.length) continue;
      if (await this.#rollTriggerDie(trigger, null) >= minimum) {
        await applyEffects(this.user, chanceOnUser, { sourceUuid: this.user.uuid, sourceName: this.user.name });
      }
    }
    await this.#postManualEffects();
  }

  async #postManualEffects() {
    const system = this.move.system;
    const lines = [];
    const flexible = system.getSplitEffects('flexible');
    if (flexible.user.length || flexible.target.length) {
      lines.push(format("SYSTEM.Automation.FlexibleEffects", { move: escape(this.move.name), effects: effectList([...flexible.user, ...flexible.target]) }));
    }
    const room = system.getSplitEffects('autoApplyToRoom');
    if (room.user.length || room.target.length) {
      lines.push(format("SYSTEM.Automation.RoomEffects", { move: escape(this.move.name), effects: effectList([...room.user, ...room.target]) }));
    }
    await postAutomationMessage(this.user, lines);
  }

  async #rollStatusAgainst(target, landing) {
    const system = this.move.system;
    const statusDie = getStatusDie(this.user, this.move);
    if (!statusDie) return;
    if (system.power == 0) {
      const { sides, modifier } = this.getDialogDie();
      statusDie.sides += sides;
      statusDie.modifier += modifier;
    }
    if (this.dialogState.opportunity && system.isStatus) statusDie.sides = 1;
    if (isHungry(this.user)) statusDie.advantage = 'disadvantage';
    if (!system.isStatus) statusDie.sides += getRules(this.user, "statusCheckDice").reduce((sum, rule) => sum + (rule.dice ?? 1), 0);

    if (system.power == 0 && await this.#fieldAvoids(target, { evasion: false })) return;
    const immunity = target && system.power == 0 ? moveImmunity(target, this.move, effectiveMoveType(this.user, this.move)) : null;
    if (immunity) {
      await postAutomationMessage(target, [format("SYSTEM.Automation.FeatureImmune", { name: escape(target.name), move: escape(this.move.name), feature: escape(immunity.source) })]);
      return;
    }

    if (target && hasCondition(target, 'magicCoat') && system.isStatus) {
      await postAutomationMessage(target, [format("SYSTEM.Automation.MagicCoatReflect", { name: escape(target.name), move: escape(this.move.name) })]);
      target = this.user;
    }

    const autoApply = system.getSplitEffects('autoApplyOnStatus');
    const resistSkill = system.defensiveCheck ?? (system.isPhysical ? 'physicalStatusResistance' : 'specialStatusResistance');
    await this.toChatMessage(new StatusRoll(getDieString(statusDie), {}, {
      effects: [...landing, ...autoApply.target],
      onLandEffects: autoApply.user,
      resistSkill,
      attackerUuid: this.user.uuid,
      targetId: target?.uuid ?? null,
      moveName: this.move.name,
      moveType: effectiveMoveType(this.user, this.move),
      resistBonusDice: this.dialogState.opportunity ? 1 : 0
    }), { // not including adv/mult for status checks
      flavor: `${this.move.name}${target ? ` (${target.name})` : ""} - ${localize("SYSTEM.Automation.Status")}`,
    });
  }

  async #rollStatusEffects() {
    const system = this.move.system;
    const { target: landing } = system.getSplitEffects('hit');

    if (system.targetsFoe) {
      for (const target of this.#targetActors) await this.#rollStatusAgainst(target, landing);
    }
    else await this.#applyFriendlyEffects(landing);
  }

  async #applyFriendlyEffects(landing) {
    if (!landing.length) return;
    const system = this.move.system;
    const targeted = this.#targetActors.filter(_ => _);
    let recipients;
    switch (system.target) {
      case 'self': recipients = [this.user]; break;
      case 'selfOrAlly': recipients = targeted.length ? targeted : [this.user]; break;
      case 'selfAllies': recipients = [this.user, ...targeted.filter(actor => actor !== this.user)]; break;
      default: recipients = targeted;
    }
    if (!recipients.length) await postAutomationMessage(this.user, [format("SYSTEM.Automation.ApplyManually", { effects: effectList(landing) })]);
    for (const recipient of recipients) {
      await applyEffects(recipient, landing, { sourceUuid: this.user.uuid, sourceName: this.user.name });
    }
  }

  async #postDescription() {
    const description = this.move.system.description ? `<p>${escape(this.move.system.description)}</p>` : "";
    const chatData = {
      speaker: ChatMessage.implementation.getSpeaker({ actor: this.user }),
      content: `<p><strong>${escape(this.move.name)}</strong></p>${description}`
    };
    ChatMessage.applyRollMode(chatData, this.messageMode);
    await ChatMessage.create(chatData);
  }
}
