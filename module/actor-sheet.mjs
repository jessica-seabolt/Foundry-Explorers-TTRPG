import { filePath, toFormGroup } from '../constants.mjs';
import { MoveRollDialog, SkillRollDialog } from './roll-dialog.mjs';
import { abilities, classes, proficiencies, specializations, categories, types, skills, effects, itemCategories, sizes, statKeys, statConditions } from './types.mjs'
import { SYSTEM_ID } from '../constants.mjs';
import { MINOR_SKILL_CHOICES, auraColors, auraOfNature, classData, featureCategories, natures } from './features.mjs';
import { holdItem, teamOf, throwItem, transferItem, useItem } from './items.mjs';
import { heldItemOf } from './features.mjs';
import { checkAction, recordAction, takeSimpleAction } from './turns.mjs';
import { dropItemAt } from './floor-items.mjs';

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

export class CharacterSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    tag: "form",
    form: {
      submitOnChange: true
    },
    actions: {
      clearTrack: CharacterSheet.clearTrack,
      rollDie: CharacterSheet.rollDie,
      rollMoveDie: CharacterSheet.rollMoveDie,
      removeItem: CharacterSheet.removeItem,
      basicAttack: CharacterSheet.basicAttack,
      guard: CharacterSheet.guard,
      dash: CharacterSheet.dash,
      dropItem: CharacterSheet.dropItem,
      escape: CharacterSheet.escape,
      rest: CharacterSheet.rest,
      newFloor: CharacterSheet.newFloor,
      openItem: CharacterSheet.openItem,
      useItem: CharacterSheet.useItem,
      throwItem: CharacterSheet.throwItem,
      returnItem: CharacterSheet.returnItem,
      moveLooseItems: CharacterSheet.moveLooseItems,
      openTeam: CharacterSheet.openTeam
    }
  }

  static TABS = {
    primary: {
      tabs: [
        { id: "stats", label: "SYSTEM.Tabs.Stats", group: "primary" },
        { id: "about", label: "SYSTEM.Tabs.About", group: "primary" },
        { id: "moves", label: "SYSTEM.Tabs.Moves", group: "primary" },
        { id: "feats", label: "SYSTEM.Tabs.Feats", group: "primary" },
      ],
      initial: "stats",
      labelPrefix: "",
    }
  };

  static PARTS = {
    header: { template: filePath("templates/actor/actor-sheet.hbs") },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    stats: { template: filePath("templates/actor/sections/stats.hbs"), scrollable: [""] },
    about: { template: filePath("templates/actor/sections/about.hbs") },
    moves: { template: filePath("templates/actor/sections/moves.hbs"), scrollable: [".move-grid"] },
    feats: { template: filePath("templates/actor/sections/feats.hbs") },
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.moves = this.actor.items.filter(item => item.type === "Move");
    const held = heldItemOf(this.actor);
    context.heldItem = held ? {
      id: held.id, name: held.name, img: held.img, description: held.system.description,
      canUse: held.system.canUse, canThrow: held.system.canThrow, sticky: !!held.getFlag(SYSTEM_ID, "sticky")
    } : null;
    context.looseItems = this.actor.items.filter(item => item.type === "Item" && item.id !== held?.id)
      .map(item => ({ id: item.id, name: item.name, img: item.img }));
    context.featureGroups = Object.entries(featureCategories).map(([category, label]) => ({
      label,
      features: this.actor.items.filter(item => item.type === "Feature" && item.system.category === category)
        .sort((a, b) => (a.system.level ?? 0) - (b.system.level ?? 0) || a.name.localeCompare(b.name))
        .map(item => ({
          id: item.id, name: item.name, img: item.img, level: item.system.level,
          description: item.system.description, automated: item.system.isAutomated, manualNote: item.system.manualNote
        }))
    })).filter(group => group.features.length);
    const system = this.document.system;
    context.skillGrants = Object.fromEntries(Object.keys(skills)
      .filter(skill => system.proficiency?.[skill] && system.proficiency[skill] !== system.skills[skill])
      .map(skill => [skill, game.i18n.format("SYSTEM.Features.SkillGranted", { proficiency: game.i18n.localize(`SYSTEM.Features.Proficiency.${system.proficiency[skill]}`) })]));
    const classInfo = classData[system.class];
    if (classInfo) {
      const skillNames = list => list.map(skill => game.i18n.localize(skills[skill])).join(", ");
      context.classSummary = game.i18n.format("SYSTEM.Features.ClassSummary", {
        hp: classInfo.baseHp, perLevel: classInfo.hpPerLevel, major: skillNames(classInfo.majorSkills), minor: skillNames(classInfo.minorSkillOptions), count: MINOR_SKILL_CHOICES
      });
      context.maxHpHint = game.i18n.format("SYSTEM.Features.MaxHpHint", { hp: classInfo.baseHp, perLevel: classInfo.hpPerLevel });
      context.minorSkillCount = Object.values(system.skills).filter(value => value === 'minor').length;
      context.minorSkillLimit = MINOR_SKILL_CHOICES;
      context.minorSkillsOver = context.minorSkillCount > MINOR_SKILL_CHOICES;
    }
    context.natureOptions = Object.keys(natures).map(nature => `${nature[0].toUpperCase()}${nature.slice(1)}`);
    context.natureAura = auraOfNature(system.nature ?? "");
    context.auraHex = auraColors[system.auraColor] ?? (system.auraColor?.startsWith?.("#") ? system.auraColor : null);
    context.types = toFormGroup(types);
    context.classes = toFormGroup(classes);
    context.specializations = toFormGroup(specializations);
    context.abilities = abilities;
    context.proficiencies = proficiencies;
    context.typesRecord = types;
    context.categories = categories;
    context.itemCategories = itemCategories;
    context.skills = skills;
    context.effects = effects;
    context.sizes = toFormGroup(sizes);
    context.systemFields = this.document.system.schema.fields;
    context.tabs = this._prepareTabs("primary");
    context.statChangeRows = statKeys.map(stat => ({
      stat,
      value: this.document.system.statChanges[stat],
      label: abilities[stat]
    }));
    context.tileMovement = this.document.system.tileMovement;
    context.tileVisibility = this.document.system.tileVisibility;
    context.isGuarding = this.actor.statuses.has('guarding');
    context.team = teamOf(this.actor);
    const belly = this.document.system.belly;
    if (belly) context.belly = {
      hungry: belly.hungry,
      label: belly.hungry ? game.i18n.format("SYSTEM.Belly.HungryDays", { days: belly.hungryDays })
        : belly.fedDays > 0 ? game.i18n.format("SYSTEM.Belly.FullDays", { days: belly.fedDays })
        : game.i18n.format("SYSTEM.Belly.Eaten", { eaten: belly.eaten, needed: belly.needed })
    };
    context.statChips = statKeys.filter(stat => this.document.system.statChanges[stat])
      .map(stat => {
        const value = this.document.system.statChanges[stat];
        return { label: game.i18n.localize(abilities[stat]), value: value > 0 ? `+${value}` : `${value}`, up: value > 0 };
      });
    context.conditionChips = this.actor.effects.filter(effect => effect.active && effect.statuses.size
      && ![...effect.statuses].some(status => statConditions[status]))
      .map(effect => ({
        id: effect.id,
        name: effect.name,
        img: effect.img,
        detail: CharacterSheet.conditionDetail(effect),
        tooltip: game.i18n.localize(this.isEditable ? "SYSTEM.Misc.ConditionRemoveHint" : "")
      }));
    return context;
  }

  static conditionDetail(effect) {
    const flags = effect.flags?.[SYSTEM_ID] ?? {};
    const format = (key, data) => game.i18n.format(key, data);
    if (typeof flags.remaining === "number") return format("SYSTEM.Misc.TurnsLeft", { count: flags.remaining });
    if (typeof flags.rounds === "number") return format("SYSTEM.Misc.RoundsLeft", { count: flags.rounds });
    if (typeof flags.duration === "number") return format("SYSTEM.Misc.RoundsLeft", { count: Math.max(flags.duration - (flags.turns ?? 0), 0) });
    if (effect.statuses.has("badlyPoisoned")) return `${(flags.turns ?? 0) + 1}d6`;
    return null;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    if (!this.isEditable) return;
    for (const chip of this.element.querySelectorAll(".condition-chip[data-effect-id]")) {
      chip.addEventListener("contextmenu", event => {
        event.preventDefault();
        this.actor.effects.get(chip.dataset.effectId)?.delete();
      });
    }
  }

  _onChangeForm(config, event) {
    super._onChangeForm(config, event);
    const inputName = event.target.dataset.name;
    if (inputName === 'ppLeft') this.editPP(event, event.target);
  }

  static clearTrack() {
    const friendship = this.document.system.friendship;
    if (!friendship.isClearable) return;
    this.document.update({
      system: {
        friendship: {
          track: 0,
          dice: friendship.dice + 1,
          cleared: friendship.cleared + 1,
        }
      }
    });
  }

  static async rollDie(event, target) {
    new SkillRollDialog({ user: this.actor, skill: target.dataset.skill }).render({ force: true });
  }

  static async rollMoveDie(event, target) {
    const move = this.actor.items.get(target.dataset.id);
    new MoveRollDialog({ user: this.actor, move }).render({ force: true });
  }

  static basicAttack() {
    MoveRollDialog.basicAttack(this.actor).render({ force: true });
  }

  static async guard() {
    const starting = !this.actor.statuses.has('guarding');
    if (starting && !checkAction(this.actor, "guard").allowed) return;
    await this.actor.toggleStatusEffect('guarding');
    if (starting) await recordAction(this.actor, "guard");
  }

  static async dropItem(event, target) {
    const item = this.actor.items.get(target.dataset.id);
    if (item) await dropItemAt(item, this.actor);
  }

  static async dash() {
    await takeSimpleAction(this.actor, "dash");
  }

  static async escape() {
    await takeSimpleAction(this.actor, "escape");
  }

  static async rest() {
    await this.actor.system.rest();
  }

  static async newFloor() {
    await this.actor.system.newFloor();
  }

  static useItem(event, target) {
    const item = this.actor.items.get(target.dataset.id);
    if (item) useItem(item, { user: this.actor });
  }

  static throwItem(event, target) {
    const item = this.actor.items.get(target.dataset.id);
    if (item) throwItem(item, { user: this.actor });
  }

  static async returnItem(event, target) {
    const item = this.actor.items.get(target.dataset.id);
    const team = teamOf(this.actor);
    if (item && team) await transferItem(item, team);
  }

  static async moveLooseItems() {
    const team = teamOf(this.actor);
    if (!team) return;
    for (const item of this.actor.items.filter(item => item.type === "Item" && item.id !== this.actor.system.heldItem)) {
      await transferItem(item, team);
    }
  }

  async _onDropItem(event, item) {
    if (item.type !== "Item") return super._onDropItem(event, item);
    if (!this.actor.isOwner) return;
    await holdItem(this.actor, item);
  }

  static openTeam() {
    teamOf(this.actor)?.sheet.render({ force: true });
  }

  static openItem(event, target) {
    this.actor.items.get(target.dataset.id)?.sheet.render({ force: true });
  }

  static async removeItem(event, target) {
    const id = target.dataset.id;
    this.actor.items.get(id).delete();
    this.render();
  }

  async editPP(event, target) {
    const id = target.dataset.id;
    const item = this.actor.items.get(id);
    await item.update({ "system.ppLeft": Number(target.value) });
  }

}

export class PlayerSheet extends CharacterSheet {
  static PARTS = {
    ...super.PARTS,
    tracks: { template: filePath("templates/actor/sections/tracks.hbs") }
  }

  static TABS = {
    ...super.TABS,
    primary: {
      ...super.TABS.primary,
      tabs: [
        ...super.TABS.primary.tabs,
        { id: "tracks", label: "SYSTEM.Tabs.Tracks", group: "primary" },
      ],
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.isPlayerSheet = true;
    return context;
  }
}