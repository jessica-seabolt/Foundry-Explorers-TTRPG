import { proficiencies, types, typeChart, abilities, skills, sizes, classes,
  specializations, categories, targets, ranges, triggerTypes, effects, tags, 
  itemCategories, statKeys} from './types.mjs';
import { FAINTED_STATUS, applyDamage, applyEffects, consumeRuleItem, healActor, postAutomationMessage, removeCondition, syncPermanentConditions, syncStatChangeIcons } from './conditions.mjs';
import { SYSTEM_ID } from '../constants.mjs';
import { auraOfNature, classData, effectiveProficiencies, featureCategories, getRules, hasCondition, hasRule, heldItemOf, hpPerLevelBonus, statModifierBonus, visibilityBonus } from './features.mjs';
import { stealHeldItem } from './items.mjs';
import { fieldStatBonus, isFieldEffect, movementPenalty, statMultiplier } from './weather.mjs';

const sizeToTiles = { tiny: 1, small: 1, medium: 1, large: 2, huge: 3 };

const { NumberField, SchemaField, StringField, HTMLField, ArrayField, TypedObjectField, BooleanField, ObjectField } = foundry.data.fields;

export class CharacterDataModel extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["SYSTEM.Models.Character"];

  get tileVisibility() {
    let result = Math.floor(this.abilities.spatk.baseMod / 2) + 4;
    if (result % 10 === 8) result--; // I have no idea why the visibility table was like this
    const awareness = this.proficiency?.awareness ?? this.skills.awareness;
    if (awareness === 'major') result += 2;
    else if (awareness === 'minor') result += 1;
    return result + visibilityBonus(this.parent);
  }

  get tileMovement() {
    const statuses = this.parent?.statuses ?? new Set();
    if (['frozen', 'restrained', 'trapped', 'asleep'].some(status => statuses.has(status))) return 0;
    let result = Math.floor(this.abilities.spe.mod / 2) + 1;
    const movement = this.proficiency?.movement ?? this.skills.movement;
    if (movement === 'major') result += 4;
    else if (movement === 'minor') result += 2;
    if (statuses.has('paralyzed')) result -= 1;
    result -= movementPenalty(this.parent);
    return Math.max(result, 0);
  }

  get sightRange() {
    return this.tileVisibility * (game.system.grid?.distance ?? 5);
  }

  async _preCreate(data, options, user) {
    const isAllowed = await super._preCreate(data, options, user);
    if (isAllowed === false) return false;

    const tiles = sizeToTiles[this.size] ?? 1;
    this.parent.updateSource({
      prototypeToken: {
// Wild Pokemon from compendiums stay unlinked.
        actorLink: data.prototypeToken?.actorLink ?? true,
        disposition: data.prototypeToken?.disposition ?? CONST.TOKEN_DISPOSITIONS.NEUTRAL,
        lockRotation: true,
        width: tiles,
        height: tiles,
        sight: {
          enabled: true,
          range: this.sightRange
        }
      }
    });
  }

  async _preUpdate(changes, options, user) {
    const allowed = await super._preUpdate(changes, options, user);
    if (allowed === false) return false;
    const newSize = changes.system?.size;
    if (newSize && newSize !== this.size) {
      const tiles = sizeToTiles[newSize] ?? 1;
      foundry.utils.setProperty(changes, "prototypeToken.width", tiles);
      foundry.utils.setProperty(changes, "prototypeToken.height", tiles);
      options[SYSTEM_ID] = { ...options[SYSTEM_ID], resizeTokens: tiles };
    }
  }

  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    if (userId !== game.user.id) return;
    if (changed.system?.statChanges) syncStatChangeIcons(this.parent);
    if (changed.system && "heldItem" in changed.system) this.onFeaturesChanged();
    else this.syncTokens({ resizeTiles: options[SYSTEM_ID]?.resizeTokens });
  }

  async syncTokens({ resizeTiles = null } = {}) {
    const actor = this.parent;
    const sightRange = this.sightRange;
    const seeInvisible = hasCondition(actor, 'eyedrop');
    const wantedModes = modes => {
      const others = (modes ?? []).filter(mode => mode.id !== 'seeInvisibility');
      return seeInvisible ? [...others, { id: 'seeInvisibility', enabled: true, range: sightRange }] : others;
    };
    const tokenUpdate = (source, isPrototype) => {
      const update = {};
      const prefix = isPrototype ? "prototypeToken." : "";
      if (source.sight.range !== sightRange) update[`${prefix}sight.range`] = sightRange;
      const modes = wantedModes(source.detectionModes);
      if (JSON.stringify(modes) !== JSON.stringify(source.detectionModes ?? [])) update[`${prefix}detectionModes`] = modes;
      if (resizeTiles && !isPrototype) Object.assign(update, { width: resizeTiles, height: resizeTiles });
      return update;
    };
    if (!actor.isToken && actor.isOwner) {
      const update = tokenUpdate(actor._source.prototypeToken, true);
      if (!foundry.utils.isEmpty(update)) await actor.update(update);
    }
    for (const token of actor.getActiveTokens(false, true)) {
      if (!token.isOwner) continue;
      const update = tokenUpdate(token._source, false);
      if (!foundry.utils.isEmpty(update)) await token.update(update);
    }
  }

  async onFeaturesChanged() {
    await syncPermanentConditions(this.parent);
    await this.syncTokens();
  }

  static defineSchema() {
    const skillFields = {};
    for (const skill in skills) {
      skillFields[skill] = new StringField({ required: true, choices: proficiencies, initial: 'untrained' });
    }
    const abilityFields = {};
    for (const ability in abilities) {
      if (ability === "hp") continue; // Not using HP here, it has a separate field
      abilityFields[ability] = new SchemaField({ raw: new NumberField({ required: true, integer: true, initial: 5 }) });
    }
    return {
      species: new StringField({ required: true }),
      type1: new StringField({ required: true, choices: types, initial: 'normal' }),
      type2: new StringField({ required: true, nullable: true, choices: types }),
      poke: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      heldItem: new StringField({ required: true, nullable: true, initial: null }),
      size: new StringField({ required: true, choices: sizes, initial: 'medium' }),
      hp: new SchemaField({
        raw: new NumberField({ required: true, integer: true, min: 0, initial: 25 }),
        max: new NumberField({ required: true, integer: true, min: 1, initial: 25 })
      }),
      abilities: new SchemaField(abilityFields),
      statChanges: new SchemaField(Object.fromEntries(statKeys.map(stat =>
        [stat, new NumberField({ required: true, integer: true, min: -10, max: 10, initial: 0 })]))),
      skills: new SchemaField(skillFields),
      feats: new ArrayField(new StringField({ required: true })),

      blurbText: new StringField({ required: true }),
      featText: new StringField({ required: true }),
    };
  }

  prepareDerivedData() {
    this._prepareMaxHp();
    this.hp.mod = Math.floor(Math.ceil(this.hp.max / 5) / 2);
    this.proficiency = effectiveProficiencies(this.parent, this.skills, this.class);
    const statuses = this.parent?.statuses ?? new Set();
    for (const ability in this.abilities) {
      const abilitySettings = this.abilities[ability];
      abilitySettings.value = abilitySettings.raw * statMultiplier(this.parent, ability);
      abilitySettings.baseMod = Math.ceil(abilitySettings.value / 5);
      let change = this.statChanges[ability] ?? 0;
      if (ability === 'atk' && statuses.has('burned')) change -= 2;
      change += statModifierBonus(this.parent, ability) + fieldStatBonus(this.parent, ability);
      abilitySettings.change = change;
      abilitySettings.mod = Math.max(abilitySettings.baseMod + change, 0);
    }
  }

  _prepareMaxHp() {}

  getTypeMatchup(attackType) {
    let result = 3;
    const attackChart = typeChart[attackType];
    for (const defendType of [this.type1, this.type2]) {
      if (defendType === null) continue;
      if (attackChart.se.includes(defendType)) result += 1;
      else if (attackChart.nve.includes(defendType)) result -= 1;
      else if (attackChart.immune.includes(defendType)) return 'immune';
    }
    return ['immune', 'mostlyIneffective', 'notVeryEffective', 'effective', 'superEffective', 'extremelyEffective'][result];
  }

  getResistMod(resistAbility, { ignoreStatChanges = false } = {}) {
    const mod = stat => ignoreStatChanges ? this.abilities[stat]?.baseMod ?? 0 : this.abilities[stat]?.mod ?? 0;
    if (resistAbility === 'highest') return Math.max(mod('def'), mod('spdef'));
    return mod(resistAbility);
  }

  async applyDamage({ amount, resistAbility = null, moveType = null, moveCategory = null, attackerUuid = null, tags = [],
    isAttack = false, isCritical = false, fromMove = false, matchup = null, label = null }) {
    const actor = this.parent;
    const name = foundry.utils.escapeHTML(actor.name);
    const format = (key, data) => game.i18n.format(key, { name, ...data });
    const statuses = actor.statuses;
    const unchanged = { damage: 0, hp: this.hp.raw };
    if (isAttack && statuses.has('invulnerable')) {
      await postAutomationMessage(actor, [format("SYSTEM.Automation.InvulnerableNoDamage")]);
      return unchanged;
    }
    if (isAttack && statuses.has('frozen') && moveType && moveType !== 'fire') {
      await postAutomationMessage(actor, [format("SYSTEM.Automation.FrozenNoDamage")]);
      return unchanged;
    }
    const magicGuard = getRules(actor, "magicGuard")[0];
    if (!isAttack && !fromMove && magicGuard) {
      await postAutomationMessage(actor, [format("SYSTEM.Automation.FeatureBlockedDamage", { feature: foundry.utils.escapeHTML(magicGuard.source) })]);
      return unchanged;
    }

    const attacker = attackerUuid ? fromUuidSync(attackerUuid) : null;
    const lines = [];
    const ignoreStatChanges = isAttack && hasRule(attacker, "ignoreTargetStatChanges");
    let damage = Math.max(amount - (resistAbility ? this.getResistMod(resistAbility, { ignoreStatChanges }) : 0), 0);

    const wasFullHp = this.hp.raw >= this.hp.max;
    if (isAttack) {
      for (const rule of getRules(actor, "damageTaken")) {
        if (rule.physical && moveCategory !== 'physical') continue;
        if (rule.special && moveCategory !== 'special') continue;
        if (rule.moveTypes && !rule.moveTypes.includes(moveType)) continue;
        if (rule.tag && !tags.includes(rule.tag)) continue;
        if (rule.whenFullHp && !wasFullHp) continue;
        if (rule.superEffective && !['superEffective', 'extremelyEffective'].includes(matchup)) continue;
        damage = Math.floor(damage * (rule.multiplier ?? 1));
        lines.push(format("SYSTEM.Automation.FeatureChangedDamage", { feature: foundry.utils.escapeHTML(rule.source) }));
        await consumeRuleItem(actor, rule);
      }
    }
    if (isAttack && statuses.has('guarding')) {
      damage = Math.floor(damage / 2);
      lines.push(format("SYSTEM.Automation.GuardHalved"));
    }

    if (damage >= this.hp.raw && this.hp.raw > 0) {
      for (const rule of getRules(actor, "endure")) {
        if (rule.fromFullHp && !(wasFullHp && isAttack)) continue;
        const key = `endure.${rule.key ?? "default"}`;
        if (rule.once && actor.getFlag(SYSTEM_ID, key)) continue;
        if (rule.chance) {
          const roll = await new foundry.dice.Roll("1d6").evaluate();
          await roll.toMessage({
            speaker: foundry.documents.ChatMessage.implementation.getSpeaker({ actor }),
            flavor: game.i18n.format("SYSTEM.Automation.FeatureChance", { feature: foundry.utils.escapeHTML(rule.source), chance: rule.chance })
          });
          if (roll.total < rule.chance) continue;
        }
        damage = this.hp.raw - 1;
        if (rule.once) await actor.setFlag(SYSTEM_ID, key, true);
        lines.push(format("SYSTEM.Automation.Endured", { feature: foundry.utils.escapeHTML(rule.source) }));
        break;
      }
    }

    const newHP = Math.max(this.hp.raw - damage, 0);
    await actor.update({ "system.hp.raw": newHP });
    lines.unshift(label
      ? format("SYSTEM.Automation.TookDamageFrom", { damage, label: foundry.utils.escapeHTML(label) })
      : format("SYSTEM.Automation.TookDamage", { damage }));

    if (newHP === 0 && damage > 0) {
      lines.push(format("SYSTEM.Automation.Fainted"));
      await actor.toggleStatusEffect(FAINTED_STATUS, { active: true, overlay: true });
    }
    if (isAttack && statuses.has('frozen') && moveType === 'fire') {
      await removeCondition(actor, 'frozen');
      lines.push(format("SYSTEM.Automation.Thawed"));
    }
    if (isAttack && statuses.has('asleep')) {
      await removeCondition(actor, 'asleep');
      lines.push(format("SYSTEM.Automation.WokeUp"));
    }
    await postAutomationMessage(actor, lines);

    if (isAttack && attacker && damage > 0) {
      const half = Math.floor(damage / 2);
      const reflected = (resistAbility === 'def' && statuses.has('counter')) ? "SYSTEM.Conditions.Counter"
        : (resistAbility === 'spdef' && statuses.has('mirrorCoat')) ? "SYSTEM.Conditions.MirrorCoat" : null;
      if (reflected) await applyDamage(attacker, { amount: half, label: game.i18n.localize(reflected), fromMove: true });
      if (tags.includes('recoil') && !hasRule(attacker, "noRecoil")) {
        await applyDamage(attacker, { amount: half, label: game.i18n.localize("SYSTEM.Tags.Recoil") });
      }
      if (tags.includes('healHalf')) {
        const ooze = getRules(actor, "liquidOoze")[0];
        if (ooze) await applyDamage(attacker, { amount: half, label: ooze.source, fromMove: true });
        else await healActor(attacker, half, game.i18n.localize("SYSTEM.Tags.HealHalf"));
      }
    }

    if (newHP > 0) {
      if (isAttack) await this._onDamaged({ attacker, damage, moveType, moveCategory, tags, isCritical });
      for (const rule of getRules(actor, "onHpBelow")) {
        const threshold = this.hp.max * (rule.fraction ?? 0.5);
        if (this.hp.raw + damage >= threshold && newHP < threshold) {
          await postAutomationMessage(actor, [format("SYSTEM.Automation.FeatureTriggered", { feature: foundry.utils.escapeHTML(rule.source) })]);
          if (rule.effects?.length) await applyEffects(actor, rule.effects, { sourceUuid: actor.uuid, sourceName: actor.name });
          if (rule.heal) {
            const heal = rule.heal.full ? this.hp.max : rule.heal.percent ? Math.floor(this.hp.max * rule.heal.percent / 100) : rule.heal.amount ?? 0;
            await this.heal(heal, rule.source);
          }
          await consumeRuleItem(actor, rule);
        }
      }
    }
    return { damage, hp: newHP };
  }

  async _onDamaged({ attacker, damage, moveType, moveCategory, tags, isCritical }) {
    const actor = this.parent;
    const name = foundry.utils.escapeHTML(actor.name);
    for (const rule of getRules(actor, "onDamaged")) {
      if (rule.physical && !rule.special && moveCategory !== 'physical') continue;
      if (rule.special && !rule.physical && moveCategory !== 'special') continue;
      if (rule.moveTypes && !rule.moveTypes.includes(moveType)) continue;
      if (rule.tag && !tags.includes(rule.tag)) continue;
      if (rule.critical && !isCritical) continue;
      if (rule.damaged && damage <= 0) continue;
      if (rule.stealAttackerItem && !heldItemOf(attacker)) continue;
      if (rule.chance) {
        const roll = await new foundry.dice.Roll("1d6").evaluate();
        await roll.toMessage({
          speaker: foundry.documents.ChatMessage.implementation.getSpeaker({ actor }),
          flavor: game.i18n.format("SYSTEM.Automation.FeatureChance", { feature: foundry.utils.escapeHTML(rule.source), chance: rule.chance })
        });
        if (roll.total < rule.chance) continue;
      }
      await postAutomationMessage(actor, [game.i18n.format("SYSTEM.Automation.FeatureTriggered", { name, feature: foundry.utils.escapeHTML(rule.source) })]);
      if (rule.effects?.length) await applyEffects(actor, rule.effects, { sourceUuid: actor.uuid, sourceName: actor.name });
      if (!attacker) continue;
      if (rule.attackerEffects?.length) {
        await applyEffects(attacker, rule.attackerEffects, { sourceUuid: actor.uuid, sourceName: actor.name, fromOther: true });
      }
      if (rule.attackerDamage) {
        const roll = await new foundry.dice.Roll(rule.attackerDamage).evaluate();
        await roll.toMessage({ speaker: foundry.documents.ChatMessage.implementation.getSpeaker({ actor }), flavor: rule.source });
        await applyDamage(attacker, { amount: roll.total, label: rule.source, fromMove: true });
      }
      if (rule.stealAttackerItem) await stealHeldItem(actor, attacker);
    }
    for (const rule of getRules(actor, "onDamaged").filter(rule => rule.itemId)) {
      if (rule.moveTypes && !rule.moveTypes.includes(moveType)) continue;
      if (rule.selfDamage) {
        const roll = await new foundry.dice.Roll(rule.selfDamage).evaluate();
        await roll.toMessage({ speaker: foundry.documents.ChatMessage.implementation.getSpeaker({ actor }), flavor: rule.source });
        await this.applyDamage({ amount: roll.total, moveType: rule.selfDamageType ?? null, label: rule.source, fromMove: true });
      }
      await consumeRuleItem(actor, rule);
    }
  }

  takeDamage(amount, resistAbility) {
    return this.applyDamage({ amount, resistAbility, isAttack: true });
  }

  async heal(amount, label = null) {
    const actor = this.parent;
    const newHP = Math.min(this.hp.raw + amount, this.hp.max);
    const healed = Math.max(newHP - this.hp.raw, 0);
    await actor.update({ "system.hp.raw": newHP });
    if (newHP > 0) await actor.toggleStatusEffect(FAINTED_STATUS, { active: false });
    if (newHP >= this.hp.max) await this.clearEndure({ battleOnly: false, includeBattle: false });
    await postAutomationMessage(actor, [game.i18n.format(label ? "SYSTEM.Automation.HealedFrom" : "SYSTEM.Automation.Healed",
      { name: foundry.utils.escapeHTML(actor.name), amount: healed, label: foundry.utils.escapeHTML(label ?? "") })]);
    return healed;
  }

  async clearEndure({ battleOnly = false, includeBattle = true } = {}) {
    const actor = this.parent;
    for (const rule of getRules(actor, "endure")) {
      if (!rule.once) continue;
      if (battleOnly && !rule.perBattle) continue;
      if (!includeBattle && rule.perBattle) continue;
      const key = `endure.${rule.key ?? "default"}`;
      if (actor.getFlag(SYSTEM_ID, key)) await actor.unsetFlag(SYSTEM_ID, key);
    }
  }

  get restFraction() {
    return 1;
  }

  async rest() {
    const actor = this.parent;
    const name = foundry.utils.escapeHTML(actor.name);
    const fraction = this.restFraction;
    if (fraction <= 0) {
      await postAutomationMessage(actor, [game.i18n.format("SYSTEM.Belly.TooHungryToRest", { name })]);
      return;
    }
    await actor.update({ "system.hp.raw": Math.min(this.hp.max, this.hp.raw + Math.floor(this.hp.max * fraction)) });
    const moveUpdates = actor.items.filter(item => item.type === 'Move')
      .map(move => ({
        _id: move.id, "system.ppLeft": Math.min(move.system.pp, move.system.ppLeft + Math.floor(move.system.pp * fraction)),
        [`flags.${SYSTEM_ID}.-=sealed`]: null
      }));
    if (moveUpdates.length) await actor.updateEmbeddedDocuments("Item", moveUpdates);
    await actor.toggleStatusEffect(FAINTED_STATUS, { active: false });
    await this.clearEndure();
    await postAutomationMessage(actor, [game.i18n.format(fraction < 1 ? "SYSTEM.Belly.RestedHalf" : "SYSTEM.Automation.Rested", { name })]);
  }

  async newFloor() {
    const actor = this.parent;
    await actor.update(Object.fromEntries(statKeys.map(stat => [`system.statChanges.${stat}`, 0])));
    await postAutomationMessage(actor, [game.i18n.format("SYSTEM.Automation.NewFloor", { name: foundry.utils.escapeHTML(actor.name) })]);
  }
}

export class PlayerDataModel extends CharacterDataModel {
  static LOCALIZATION_PREFIXES = super.LOCALIZATION_PREFIXES.concat("SYSTEM.Models.Player");

  async _preCreate(data, options, user) {
    const isAllowed = await super._preCreate(data, options, user);
    if (isAllowed === false) return false;

    this.parent.updateSource({
      prototypeToken: {
        disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY
      }
    });
  }

  static defineSchema() {
    return {
      ...super.defineSchema(),
      hp: new SchemaField({
        raw: new NumberField({ required: true, integer: true, min: 0, initial: 25 }),
        max: new NumberField({ required: true, integer: true, min: 1, initial: 25 }),
        bonus: new NumberField({ required: true, integer: true, initial: 0 })
      }),
      statBonus: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      class: new StringField({ required: true, choices: classes, initial: 'explorer' }),
      specialization: new StringField({ required: true, nullable: true, choices: specializations }),
      nature: new StringField({ required: true }),
      aura: new StringField({ required: true, blank: true }),
      origin: new StringField({ required: true }),
      level: new NumberField({ required: true, integer: true, min: 1, max: 10, initial: 1 }),
      friendship: new SchemaField({
        track: new NumberField({ required: true, integer: true, min: 0, max: 5, initial: 0 }),
        dice: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
        cleared: new NumberField({ required: true, integer: true, min: 0, initial: 0 })
      }),
      tokens: new SchemaField({
        available: new NumberField({ required: true, integer: true, min: 0, initial: 0 })
      }),
      belly: new SchemaField({
        eaten: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
        fedDays: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
        hungryDays: new NumberField({ required: true, integer: true, min: 0, initial: 0 })
      })
    };
  }

  get bellyNeeded() {
    return getRules(this.parent, "bellyNeed").reduce((need, rule) => need * (rule.multiplier ?? 1), 2);
  }

  get restFraction() {
    const needed = this.bellyNeeded;
    if (this.belly.fedDays > 0 || this.belly.eaten >= needed) return 1;
    return this.belly.eaten * 2 >= needed ? 0.5 : 0;
  }

  _prepareMaxHp() {
    const data = classData[this.class];
    if (!data) return;
    this.hp.classMax = data.baseHp + data.hpPerLevel * (this.level - 1) + hpPerLevelBonus(this.parent) * this.level;
    this.hp.max = Math.max(this.hp.classMax + (this.hp.bonus ?? 0), 1);
  }

  async _preUpdate(changes, options, user) {
    const allowed = await super._preUpdate(changes, options, user);
    if (allowed === false) return false;
    const level = changes.system?.level ?? this.level;
    const dice = changes.system?.friendship?.dice ?? (changes.system?.level ? this.friendship.dice : null);
    if (dice != null && dice > level) foundry.utils.setProperty(changes, "system.friendship.dice", level);
    const tokens = changes.system?.tokens?.available ?? (changes.system?.level ? this.tokens.available : null);
    if (tokens != null && tokens > level + 1) foundry.utils.setProperty(changes, "system.tokens.available", level + 1);
  }

  prepareDerivedData() {
    this.auraColor = this.aura || auraOfNature(this.nature) || "";
    super.prepareDerivedData();
    this.belly.hungry = this.belly.hungryDays >= 1;
    this.belly.skillPenalty = Math.max(this.belly.hungryDays - 2, 0);
    this.belly.needed = this.bellyNeeded;
    this.friendship.isClearable = this.friendship.track == 5;
    this.friendship.max = this.level;
    this.tokens.max = this.level + 1;
    this.statFlatTotal = this.level * 60;
    this.statTotal = this.statFlatTotal + this.statBonus;
    this.statMin = this.level * 5;
    this.statSum = Object.values(this.abilities).reduce((a, field) => a + field.raw, 0);
  }
}

const USABLE_CATEGORIES = new Set(['foods', 'berries', 'gummies', 'seeds', 'medicines', 'orbs', 'evolutionItems', 'formChangingItems', 'tmsAndHms']);

export class ItemDataModel extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["SYSTEM.Models.Item"];

  static defineSchema() {
    return {
      description: new StringField({ required: true }),
      category: new StringField({ required: true, choices: itemCategories, initial: 'foods' }),
      price: new NumberField({ required: true, nullable: true, integer: true, min: 0 }),
      rules: new ArrayField(new ObjectField()),
      onUse: new ArrayField(new ObjectField()),
      target: new StringField({ required: true, nullable: true, blank: false, choices: targets, initial: null }),
      range: new StringField({ required: true, nullable: true, blank: false, choices: ranges, initial: null }),
      rangeCount: new NumberField({ required: true, nullable: true, integer: true, min: 1, initial: null }),
      throwMode: new StringField({ required: true, choices: { none: "SYSTEM.Items.Throw.None", straight: "SYSTEM.Items.Throw.Straight", arc: "SYSTEM.Items.Throw.Arc" }, initial: 'none' }),
      throwDamage: new StringField({ required: true, blank: true }),
      throwType: new StringField({ required: true, nullable: true, blank: false, choices: types, initial: null }),
      consumable: new BooleanField({ required: true, initial: true }),
      becomes: new StringField({ required: true, blank: true }),
      manualNote: new StringField({ required: true, blank: true }),
      trap: new SchemaField({
        avoid: new ArrayField(new StringField({ required: true, choices: { endurance: "SYSTEM.Skills.Endurance", strength: "SYSTEM.Skills.Strength", movement: "SYSTEM.Skills.Movement" } })),
        difficulty: new NumberField({ required: true, integer: true, min: 0, initial: 10 }),
        visible: new BooleanField({ required: true, initial: false }),
        effects: new ArrayField(new ObjectField())
      }),
    };
  }

  get isTrap() {
    return this.category === 'traps';
  }

  get canUse() {
    return this.onUse.length > 0 || !!this.target || USABLE_CATEGORIES.has(this.category);
  }

  get canThrow() {
    return this.throwMode !== 'none';
  }

  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if (allowed === false) return false;
    const team = this.parent.actor;
    if (team?.type === "Team" && team.system.bagCount >= team.system.capacity) {
      ui.notifications.warn(game.i18n.format("SYSTEM.Team.BagFull", { capacity: team.system.capacity }));
    }
  }
}

export class MoveDataModel extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["SYSTEM.Models.Move"];

  static defineSchema() {
    return {
      description: new StringField({ required: true }),
      type: new StringField({ required: true, choices: types, initial: 'normal' }),
      category: new StringField({ required: true, choices: categories, initial: 'physical' }),
      power: new NumberField({ required: true, integer: true, min: 0, initial: 1 }),
      ppLeft: new NumberField({ required: true, integer: true, min: 0, initial: 0 }), // TODO: if pp is updated, ppLeft should be updated?
      pp: new NumberField({ required: true, integer: true, min: 0, initial: 20 }),
      effects: new TypedObjectField(new SchemaField({
        triggerType: new StringField({ required: true, choices: triggerTypes, initial: 'hit' }),
        appliedEffects: new TypedObjectField(new SchemaField({
          affectsUser: new BooleanField({ required: true, initial: false }),
          effect: new StringField({ required: true, choices: effects, initial: 'atkUp' }),
          effectCount: new NumberField({ integer: true })
        }))
      })),
      offensiveCheck: new StringField({ required: true, choices: skills, nullable: true }),
      defensiveCheck: new StringField({ required: true, choices: skills, nullable: true }),
      tags: new TypedObjectField(new StringField({ required: true, choices: tags, initial: 'priority' })),
      target: new StringField({ required: true, nullable: true, choices: targets, initial: 'foe' }),
      range: new StringField({ required: true, nullable: true, choices: ranges, initial: 'front' }),
      rangeCount: new NumberField({ required: true, nullable: true, integer: true, min: 1 }),
      level: new NumberField({ required: true, integer: true, min: 1, max: 5, initial: 1 })
    };
  }

  prepareDerivedData() {
    this.isPhysical = this.category === 'physical' || this.category === 'physicalStatus';
    this.isStatus = this.category === 'physicalStatus' || this.category === 'specialStatus';
    this.withRangeLevel = ['away', 'ahead', 'range'].includes(this.range);
  }

  static validateJoint(data) {
    if (data.withRangeLevel === (data.rangeCount === null)) {
      throw new Error("Attribute \"rangeCount\" is either being specified when it shouldn't, or not being specified when it should.");
    }
    // TODO: check if applied effects not in the value set have a number, and vice versa
    // if (data.effects.some(effect => ['statUp', 'statDown'].includes(effect.effect) === !effect.ability)) {
    //   throw new Error("Attribute \"ability\" and \"count\" should only be specified for Stat Up/Stat Down.");
    // }
    if ((data.range === null) !== (data.target === 'self')) {
      throw new Error("You can only have no range if you are targeting yourself.");
    }
    if ((data.target === null) !== (data.range === 'special')) {
      throw new Error("You can only have no target if your move is special.");
    }
  }

  getTriggerTypes() {
    return new Set(Object.values(this.effects).map(effect => effect.triggerType));
  }

  getTriggerEffects(triggerType) {
    const typeValue = Object.values(this.effects).find(effect => effect.triggerType == triggerType);
    if (!typeValue) return null;
    return new Set(Object.values(typeValue.appliedEffects));
  }

  hasTag(tag) {
    return Object.values(this.tags).includes(tag);
  }

  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if (allowed === false) return false;
    const actor = this.parent.actor;
    if (actor && actor.items.filter(item => item.type === 'Move').length >= 4) {
      ui.notifications.warn(game.i18n.format("SYSTEM.Features.TooManyMoves", { name: actor.name }));
    }
  }

  use(cost = 1) {
    if (this.ppLeft == 0) return false;
    this.parent.update({ "system.ppLeft": Math.max(this.ppLeft - cost, 0) });
    return true;
  }

  getSplitEffects(triggerType) {
    const result = { target: [], user: [] };
    for (const trigger of Object.values(this.effects)) {
      if (trigger.triggerType !== triggerType) continue;
      for (const applied of Object.values(trigger.appliedEffects)) {
        if (isFieldEffect(applied.effect)) continue;
        result[applied.affectsUser ? 'user' : 'target'].push({ effect: applied.effect, effectCount: applied.effectCount ?? null });
      }
    }
    return result;
  }

  getFieldEffects(triggerType = 'hit') {
    return Object.values(this.effects).filter(trigger => trigger.triggerType === triggerType)
      .flatMap(trigger => Object.values(trigger.appliedEffects).map(applied => applied.effect).filter(isFieldEffect));
  }

  get targetsFoe() {
    return ['foe', 'foes'].includes(this.target);
  }
}

export class FeatureDataModel extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["SYSTEM.Models.Feature"];

  static defineSchema() {
    return {
      description: new StringField({ required: true }),
      category: new StringField({ required: true, choices: featureCategories, initial: 'rareQuality' }),
      class: new StringField({ required: true, nullable: true, blank: false, choices: classes, initial: null }),
      specialization: new StringField({ required: true, nullable: true, blank: false, choices: specializations, initial: null }),
      level: new NumberField({ required: true, nullable: true, integer: true, min: 1, max: 10, initial: null }),
      prerequisite: new StringField({ required: true, blank: true }),
      prerequisiteLevel: new NumberField({ required: true, nullable: true, integer: true, min: 1, max: 10, initial: null }),
      rules: new ArrayField(new ObjectField()),
      manualNote: new StringField({ required: true, blank: true }),
    };
  }

  get isAutomated() {
    return this.rules.length > 0;
  }
}
