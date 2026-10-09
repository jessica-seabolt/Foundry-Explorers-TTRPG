import { filePath, getSelectedActors } from '../constants.mjs';
import { abilities, effects, skills } from './types.mjs';

const { Roll, terms: { Die } } = foundry.dice;

// options.dc: The DC set for this roll. Can be undefined.
export class ExplorersRoll extends Roll {
  get success() { return this.options.dc !== null ? this.total >= this.options.dc : null; }

  constructor(formula, data, options={}) {
    super(formula, data, options);
    if (options.dc === undefined) options.dc = null;
  }
}

/** Resolves the actors a chat card button applies to: its target if it has one, otherwise the selected tokens. */
function getCardActors(targetId) {
  const actors = targetId ? [fromUuidSync(targetId)].filter(_ => _) : getSelectedActors();
  if (!actors?.length) ui.notifications.error("SYSTEM.Automation.NoActorSelected", { localize: true });
  return actors ?? [];
}

export class DamageRoll extends ExplorersRoll {
  static CHAT_TEMPLATE = filePath("templates/roll/roll-chat-damage.hbs");

  get resistAbility() { return this.options.resistAbility; } // physical or special defense
  get targetId() { return this.options.targetId; } // target will take damage
  get isHealing() { return !!this.options.isHealing; } // healing moves restore HP instead of dealing damage

  constructor(formula, data, options={}) {
    super(formula, data, options);
    if (options.resistAbility === undefined) options.resistAbility = null;
    if (options.targetId === undefined) options.targetId = null;
  }

  async _prepareChatRenderContext(options) {
    const context = await super._prepareChatRenderContext(options);
    context.resistAbility = this.resistAbility;
    context.resistText = this.resistAbility === 'highest' ? "SYSTEM.Automation.HighestDefense" : abilities[this.resistAbility];
    context.damagePermission = fromUuidSync(this.targetId)?.isOwner ?? true;
    context.damage = this.total;
    context.targetId = this.targetId;
    context.isHealing = this.isHealing;
    return context;
  }

  /** The options to pass to CharacterDataModel#applyDamage for this roll. */
  get damageOptions() {
    return {
      amount: this.total,
      resistAbility: this.resistAbility,
      moveType: this.options.moveType ?? null,
      moveCategory: this.options.moveCategory ?? null,
      attackerUuid: this.options.attackerUuid ?? null,
      tags: this.options.tags ?? [],
      isAttack: true,
      isCritical: this.isCritical,
      label: this.options.moveName ?? null
    };
  }

  /** Whether any die exploded, i.e. the roll scored a Critical Hit. */
  get isCritical() {
    return (this.dice ?? []).some(die => die.results?.some(result => result.exploded));
  }

  /** Applies this roll's damage (or healing) to its target, or to the selected tokens if it has none. */
  applyToTargets() {
    for (const actor of getCardActors(this.targetId)) {
      if (this.isHealing) actor.system.heal?.(this.total, this.options.moveName ?? null);
      else actor.system.applyDamage?.(this.damageOptions);
    }
  }
}

/**
 * The attacker's roll to land a move's Status Conditions or secondary effects.
 * The target makes a Status Check against it from the chat card's Resist button.
 * options.effects: [{effect, effectCount}] applied to the target if its Status Check fails
 * options.onLandEffects: [{effect, effectCount}] applied to the attacker if the effects land
 * options.resistSkill: the skill the target rolls to resist
 * options.attackerUuid, options.targetId, options.moveName, options.moveType
 * options.resistBonusDice: extra dice the target gets on its Status Check (e.g. from an Opportunity Strike)
 */
export class StatusRoll extends ExplorersRoll {
  static CHAT_TEMPLATE = filePath("templates/roll/roll-chat-status.hbs");

  async _prepareChatRenderContext(options) {
    const context = await super._prepareChatRenderContext(options);
    const target = this.options.targetId ? fromUuidSync(this.options.targetId) : null;
    context.resistPermission = target?.isOwner ?? true;
    context.resistText = skills[this.options.resistSkill];
    context.effectNames = (this.options.effects ?? []).map(({ effect, effectCount }) =>
      `${game.i18n.localize(effects[effect] ?? effect)}${effectCount ? ` (${effectCount})` : ""}`).join(", ");
    return context;
  }
}

export class ExplorersDie extends Die {
  async explode(modifier, recursive) {
    const explode = await super.explode(modifier, recursive);
    for (let i=this.number;i<this.results.length;i++) {
      this.results[i].fromExplosion = true;
    }
    return explode;
  }

  async reroll(modifier, recursive) { // adding taking advantage/disadvantage in rerolls
    const reroll = await super.reroll(modifier, recursive);
    let rerollLower;
    if (modifier.includes("<")) rerollLower = true
    else if (modifier.includes(">")) rerollLower = false
    else return reroll;
    for (let i=0,j=this.number;i<this.number;i++) {
      const baseDie = this.results[i];
      if (!baseDie.rerolled) continue;
      const explodedDie = this.results[j];
      if (rerollLower ? explodedDie.result < baseDie.result : explodedDie.result > baseDie.result) {
        baseDie.active = true;
        baseDie.discarded = false;
        baseDie.rerolled = false;
        explodedDie.active = false;
        explodedDie.discarded = true;
        explodedDie.rerolled = true;
      }
      j++;
    }
    return reroll;
  }
}
