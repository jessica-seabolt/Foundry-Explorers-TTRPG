import { filePath, toFormGroup } from '../constants.mjs';
import { MoveRollDialog, SkillRollDialog } from './roll-dialog.mjs';
import { abilities, classes, proficiencies, specializations, categories, types, skills, effects, itemCategories, sizes } from './types.mjs'

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
      removeItem: CharacterSheet.removeItem
    }
  }

  static TABS = {
    primary: {
      tabs: [
        { id: "stats", label: "SYSTEM.Tabs.Stats", group: "primary" },
        { id: "about", label: "SYSTEM.Tabs.About", group: "primary" },
        { id: "moves", label: "SYSTEM.Tabs.Moves", group: "primary" },
        { id: "items", label: "SYSTEM.Tabs.Items", group: "primary" },
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
    items: { template: filePath("templates/actor/sections/items.hbs"), scrollable: [".item-list"] },
    feats: { template: filePath("templates/actor/sections/feats.hbs") },
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.moves = this.actor.items.filter(item => item.type === "Move");
    context.items = this.actor.items.filter(item => item.type !== "Move");
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
    context.heldItemName = this.actor.items.get(this.document.system.heldItem ?? "")?.name
    return context;
  }

  _onChangeForm(config, event) {
    super._onChangeForm(config, event);
    const inputName = event.target.dataset.name;
    if (inputName === 'ppLeft') this.editPP(event, event.target);
    if (inputName === 'heldItem') this.setHeldItem(event, event.target);
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

  async setHeldItem(event, target) {
    await this.document.update({
      system: {
        heldItem: target.checked ? target.dataset.id : null
      }
    });
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