import { filePath, getSkillDie, getMoveDie, getStatusDie, getDieString } from '../constants.mjs';
import { DamageRoll, ExplorersRoll } from './explorers-roll.mjs';
import { advantage, effects, skills, typeMatchups } from './types.mjs';

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;
const { ChatMessage } = foundry.documents;
const { Roll } = foundry.dice;

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
      extraDie: 0,
      extraModifier: 0,
      multiplier: 1,
      advantage: 'normal',
      highCrit: false,
      dc: null
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
      if (typeof this.dialogState[inputName] == 'number' || inputName === 'dc') {
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
    const dcFlavor = roll.success === null ? "" :
      roll.success ? '<br><span style="color:green;font-weight:bold;">Success</span>' : '<br><span style="color:red;font-weight:bold;">Failure</span>';
    chatData = {
      ...chatData,
      rolls: [roll],
      speaker: ChatMessage.implementation.getSpeaker({ actor: this.user }),
    }
    chatData.flavor = `${chatData.flavor}${dcFlavor}`;
    ChatMessage.applyRollMode(chatData, this.messageMode);
    ChatMessage.create(chatData)
  }
}

export class SkillRollDialog extends RollDialog {
  static DEFAULT_OPTIONS = {
    actions: {
      roll: SkillRollDialog.#rollSkill
    }
  }

  get title() {
    const skillDie = getSkillDie(this.user, this.skill);
    if (!skillDie) return this.move.name;
    const { sides, modifier } = skillDie;
    return `${this.user.name}: ${game.i18n.localize(skills[this.skill])} (Base ${sides}d6x+${modifier})`;
  }

  constructor(options={}) {
    const { userId, skill } = options;
    const user = options.user ?? game.actors.get(userId);
    if (!user) throw new Error("No user given.");
    if (!skill) throw new Error("No skill given.");
    super(options);
    this.user = user;
    this.skill = skill;
  }

  static async #rollSkill() {
    const die = this.getDialogDie();
    const { sides, modifier } = getSkillDie(this.user, this.skill);
    die.sides += sides;
    die.modifier += modifier;
    const targetRolls = game.user.targets.size > 0 ? game.user.targets.map(target => target.actor.system) : [null];
    for (const target of targetRolls) {
      this.toChatMessage(new ExplorersRoll(getDieString(die), {}, { dc: this.getDC() }), {
        flavor: `${game.i18n.localize(skills[this.skill])}${target ? ` (${target.parent.name})` : ""}`,
      });
    }
  }
}

export class SavingThrowDialog extends SkillRollDialog {
  constructor(options={}) {
    const { dc, effects } = options;
    if (!dc) throw new Error("No DC given.");
    super(options);
  }
}

export class MoveRollDialog extends RollDialog {
  static DEFAULT_OPTIONS = {
    actions: {
      roll: MoveRollDialog.#rollDamage,
      rollStatus: MoveRollDialog.#rollStatus
    }
  }

  get title() {
    const moveDie = getMoveDie(this.user, this.move);
    if (!moveDie) return this.move.name;
    const { sides, modifier } = moveDie;
    return `${this.user.name}: ${this.move.name} (Base ${sides}d6x+${modifier})`;
  }

  constructor(options={}) {
    const { userId, moveId } = options;
    const user = options.user ?? game.actors.get(userId);
    const move = options.move ?? user.items.get(moveId) ?? game.items.get(moveId);
    if (!user) throw new Error("No user given.");
    if (!move) throw new Error("No move given.");
    const { sides, modifier } = getMoveDie(user, move);
    options.sides = sides;
    options.modifier = modifier;
    super(options);

    this.user = user;
    this.move = move;
    this.dialogState.advantage = ''; // Allowed a default option
    this.dialogState.typeMatchup = '';
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.typeMatchups = typeMatchups;
    context.triggers = this.move.system.getTriggerTypes();
    context.hasPower = this.move.system.power > 0;
    context.isMove = true;
    return context;
  }

  static async #rollDamage() {
    if (this.move.actor.id == this.user.id) { // TODO: make sure this.user is owned by the person running the command
      const isUsed = this.move.system.use();
      if (!isUsed) {
        ui.notifications.error("You're out of PP!");
        return;
      }
    }
    const userSystem = this.user.system;
    const die = this.getDialogDie();
    let { sides, modifier } = getMoveDie(this.user, this.move);
    die.sides += sides;
    die.modifier += modifier;
    const targetRolls = game.user.targets.size > 0 ? game.user.targets.map(target => target.actor.system) : [null];
    for (const target of targetRolls) {
      let matchup = this.dialogState.typeMatchup;
      if (matchup === '' && target) {
        matchup = target.getTypeMatchup(this.move.system.type);
      }
      let additionString = "";
      switch (matchup) {
        case 'mostlyIneffective':
          die.multiplier *= 0.5;
          die.sides -= 1;
          additionString += `<span style=\"color:red;font-weight:bold;\">-${game.i18n.localize(typeMatchups[matchup])}</span><br>`;
          break;
        case 'notVeryEffective':
          die.sides -= 1;
          additionString += `<span style=\"color:red;font-weight:bold;\">-${game.i18n.localize(typeMatchups[matchup])}</span><br>`;
          break;
        case 'superEffective':
          die.sides += 1;
          additionString += `<span style=\"color:green;font-weight:bold;\">+${game.i18n.localize(typeMatchups[matchup])}</span><br>`;
          break;
        case 'extremelyEffective':
          die.multiplier *= 2;
          die.sides += 1;
          additionString += `<span style=\"color:green;font-weight:bold;\">+${game.i18n.localize(typeMatchups[matchup])}</span><br>`;
          break;
        case 'immune':
          die.multiplier = 0;
          additionString += `<span style=\"color:red;font-weight:bold;\">-${game.i18n.localize(typeMatchups[matchup])}</span><br>`;
          break;
      }
      if (die.advantage === '') {
        if (userSystem.type1 == this.move.system.type || userSystem.type2 == this.move.system.type) {
          die.advantage = 'advantage';
          additionString += "<span style=\"color:green;font-weight:bold;\">+STAB</span><br>";
        } else die.advantage = 'normal';
      };

      const resistAbility = this.move.system.isPhysical ? 'def' : 'spdef';
      this.toChatMessage(new DamageRoll(getDieString(die), {}, { dc: this.getDC(), resistAbility, targetId: target.parent.uuid }), {
        flavor: `${additionString}${this.move.name}${target ? ` (${target.parent.name})` : ""} - Power`,
      });
    }
  }

  static async #rollStatus() {
    const statusDie = getStatusDie(this.user, this.move);
    if (this.move.system.power == 0) {
      const { sides, modifier } = this.getDialogDie();
      statusDie.sides += sides;
      statusDie.modifier += modifier;
    }
    const targetRolls = game.user.targets.size > 0 ? game.user.targets.map(target => target.actor.system) : [null];
    for (const target of targetRolls) {
      const hitEffects = [];
      this.move.system.getTriggerEffects('hit').forEach(effect => {
        hitEffects.push(game.i18n.localize(effects[effect.effect]))
      });

      this.toChatMessage(new ExplorersRoll(getDieString(statusDie), {}, { dc: this.getDC() }), { // not including adv/mult for status checks
        flavor: `${this.move.name}${target ? ` (${target.parent.name})` : ""} - Status (${hitEffects.join()})`,
      });
    }
  }
} 