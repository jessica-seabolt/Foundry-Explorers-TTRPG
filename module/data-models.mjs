import { proficiencies, types, typeChart, abilities, skills, sizes, classes,
  specializations, categories, targets, ranges, triggerTypes, effects, tags, 
  itemCategories} from './types.mjs';

const { NumberField, SchemaField, StringField, HTMLField, ArrayField, TypedObjectField, BooleanField } = foundry.data.fields;

export class CharacterDataModel extends foundry.abstract.TypeDataModel {

  static LOCALIZATION_PREFIXES = ["SYSTEM.Models.Character"];

  get tileVisibility() {
    let result = Math.floor(this.abilities.spatk.mod / 2) + 4;
    if (result % 10 === 8) result--; // I have no idea why the visibility table was like this
    if (this.skills.awareness === 'major') result += 2;
    else if (this.skills.awareness === 'minor') result += 1;
    return result;
  }

  get tileMovement() {
    let result = Math.floor(this.abilities.spe.mod / 2) + 1;
    if (this.skills.movement === 'major') result += 4;
    else if (this.skills.movement === 'minor') result += 2;
    return result;
  }

  async _preCreate(data, options, user) {
    const isAllowed = await super._preCreate(data, options, user);
    if (isAllowed === false) return false;

    this.parent.updateSource({
      prototypeToken: {
        actorLink: true,
        disposition: CONST.TOKEN_DISPOSITIONS.NEUTRAL,
        lockRotation: true,
        sight: {
          enabled: true,
          range: 20,
          // range: this.tileVisibility * game.scenes.viewed.grid.distance
          // TODO: add tile visibility into sight when the derived attribute is computed
        }
      }
    });
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
      skills: new SchemaField(skillFields),
      feats: new ArrayField(new StringField({ required: true })),

      blurbText: new StringField({ required: true }),
      featText: new StringField({ required: true }),
    };
  }

  prepareDerivedData() {
    this.hp.mod = Math.floor(Math.ceil(this.hp.max / 5) / 2);
    for (const ability in this.abilities) {
      const abilitySettings = this.abilities[ability];
      abilitySettings.mod = Math.ceil(abilitySettings.raw / 5);
      abilitySettings.value = abilitySettings.raw; // TODO: add stat up/stat down penalties
    }
  }

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

  takeDamage(amount, resistAbility) {
    const totalDamage = Math.max(amount - this.abilities[resistAbility].mod, 0);
    const newHP = Math.max(this.hp.raw - totalDamage, 0);
    this.parent.update({ "system.hp.raw": newHP });
    ChatMessage.create({
      flavor: `${this.parent.name} took ${totalDamage > 0 ? totalDamage : "no"} damage.${newHP === 0 ? `\n${this.parent.name} fainted!`: ""}`
    });
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
      statBonus: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      class: new StringField({ required: true, choices: classes, initial: 'explorer' }),
      specialization: new StringField({ required: true, nullable: true, choices: specializations }),
      nature: new StringField({ required: true }),
      origin: new StringField({ required: true }),
      level: new NumberField({ required: true, integer: true, min: 1, max: 10, initial: 1 }),
      friendship: new SchemaField({
        track: new NumberField({ required: true, integer: true, min: 0, max: 5, initial: 0 }),
        dice: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
        cleared: new NumberField({ required: true, integer: true, min: 0, initial: 0 })
      }),
      tokens: new SchemaField({
        available: new NumberField({ required: true, integer: true, min: 0, initial: 0 })
      })
    };
  }

  prepareDerivedData() {
    super.prepareDerivedData();
    this.friendship.isClearable = this.friendship.track == 5;
    this.tokens.max = this.level + 1;
    this.statFlatTotal = this.level * 60;
    this.statTotal = this.statFlatTotal + this.statBonus;
    this.statMin = this.level * 5;
    this.statSum = Object.values(this.abilities).reduce((a, field) => a + field.raw, 0);
  }
}

export class ItemDataModel extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["SYSTEM.Models.Item"];

  static defineSchema() {
    return {
      description: new StringField({ required: true }),
      category: new StringField({ required: true, choices: itemCategories, initial: 'foods' }),
      price: new NumberField({ required: true, nullable: true, integer: true, min: 0 })
    };
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

  use() {
    if (this.ppLeft == 0) return false;
    this.parent.update({ "system.ppLeft": this.ppLeft-1 });
    return true;
  }
}

export class FeatDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      effect: new StringField({ required: true }),
      prerequisite: new StringField({ required: true, nullable: true }),
      prerequisiteLevel: new NumberField({ required: true, nullable: true, integer: true, min: 1, max: 10 }),
    };
  }
}