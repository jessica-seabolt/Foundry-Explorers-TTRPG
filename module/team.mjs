import { filePath } from '../constants.mjs';
import { postAutomationMessage } from './conditions.mjs';
import { chooseUser, holdItem, throwItem, transferItem, useItem } from './items.mjs';
import { itemCategories } from './types.mjs';

const { NumberField, StringField, ArrayField } = foundry.data.fields;
const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

// Team Ranks: the Reputation needed for each, and the Treasure Bag's size at that Rank
export const TEAM_RANKS = [
  { id: "rookie", reputation: 0, capacity: 8 },
  { id: "normal", reputation: 400, capacity: 16 },
  { id: "bronze", reputation: 1100, capacity: 24 },
  { id: "silver", reputation: 2200, capacity: 36 },
  { id: "gold", reputation: 5400, capacity: 48 },
  { id: "platinum", reputation: 11200, capacity: 48 },
  { id: "diamond", reputation: 20200, capacity: 56 },
  { id: "ace", reputation: 35200, capacity: 56 },
  { id: "ultra", reputation: 50000, capacity: 64 },
  { id: "master", reputation: 70000, capacity: 64 },
  { id: "guildmaster", reputation: 100000, capacity: 72 },
];
const DAYS_WITHOUT_FOOD_LIMIT = 7;

/** A Team: its shared Treasure Bag (the Team actor's items), Poké, Reputation and Rank, members and Reserve List. */
export class TeamDataModel extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["SYSTEM.Models.Team"];

  static defineSchema() {
    return {
      reputation: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      poke: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      members: new ArrayField(new StringField({ required: true })),
      reserve: new ArrayField(new StringField({ required: true })),
      notes: new StringField({ required: true, blank: true }),
    };
  }

  prepareDerivedData() {
    // Rank follows Reputation
    const index = TEAM_RANKS.findLastIndex(rank => this.reputation >= rank.reputation);
    const rank = TEAM_RANKS[Math.max(index, 0)];
    this.rank = rank.id;
    this.capacity = rank.capacity;
    this.nextRank = TEAM_RANKS[index + 1] ?? null;
    this.bagCount = this.parent?.items?.filter(item => item.type === "Item").length ?? 0;
  }

  get memberActors() {
    return this.members.map(uuid => fromUuidSync(uuid)).filter(_ => _);
  }

  get reserveActors() {
    return this.reserve.map(uuid => fromUuidSync(uuid)).filter(_ => _);
  }

  /**
   * A new day: each member's Belly is checked. A member who ate nothing yesterday (and had no big meal covering it)
   * goes hungry: Disadvantage and half damage, -1 to Skill Checks for each day past the second.
   */
  async newDay() {
    const lines = [game.i18n.localize("SYSTEM.Belly.NewDay")];
    for (const member of this.memberActors) {
      const belly = member.system.belly;
      if (!belly) continue;
      const name = foundry.utils.escapeHTML(member.name);
      const update = { "system.belly.eaten": 0 };
      if (belly.fedDays > 0) {
        update["system.belly.fedDays"] = belly.fedDays - 1;
        update["system.belly.hungryDays"] = 0;
        lines.push(game.i18n.format("SYSTEM.Belly.StillFull", { name }));
      }
      else if (belly.eaten > 0) {
        update["system.belly.hungryDays"] = 0;
        lines.push(game.i18n.format(belly.eaten >= belly.needed ? "SYSTEM.Belly.Fed" : "SYSTEM.Belly.HalfFed", { name }));
      }
      else {
        const days = belly.hungryDays + 1;
        update["system.belly.hungryDays"] = days;
        lines.push(game.i18n.format(days >= DAYS_WITHOUT_FOOD_LIMIT ? "SYSTEM.Belly.Starving" : "SYSTEM.Belly.WentHungry", { name, days }));
      }
      await member.update(update);
    }
    await postAutomationMessage(this.parent, lines);
  }
}

export class TeamSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    tag: "form",
    classes: ["explorers-team"],
    form: { submitOnChange: true },
    position: { width: 620, height: 640 },
    actions: {
      useItem: TeamSheet.#onUseItem,
      throwItem: TeamSheet.#onThrowItem,
      giveItem: TeamSheet.#onGiveItem,
      deleteItem: TeamSheet.#onDeleteItem,
      openDocument: TeamSheet.#onOpenDocument,
      removeMember: TeamSheet.#onRemoveMember,
      newDay: TeamSheet.#onNewDay,
    }
  };

  static TABS = {
    primary: {
      tabs: [
        { id: "bag", label: "SYSTEM.Team.Tabs.Bag" },
        { id: "members", label: "SYSTEM.Team.Tabs.Members" },
        { id: "notes", label: "SYSTEM.Team.Tabs.Notes" },
      ],
      initial: "bag",
    }
  };

  static PARTS = {
    header: { template: filePath("templates/team/header.hbs") },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    bag: { template: filePath("templates/team/bag.hbs"), scrollable: [".team-bag"] },
    members: { template: filePath("templates/team/members.hbs"), scrollable: [""] },
    notes: { template: filePath("templates/team/notes.hbs") },
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.document.system;
    context.systemFields = system.schema.fields;
    context.tabs = this._prepareTabs("primary");
    context.rankLabel = game.i18n.localize(`SYSTEM.Team.Ranks.${system.rank}`);
    context.nextRankLabel = system.nextRank ? game.i18n.localize(`SYSTEM.Team.Ranks.${system.nextRank.id}`) : null;
    context.bagFull = system.bagCount > system.capacity;
    context.items = this.document.items.filter(item => item.type === "Item")
      .sort((a, b) => a.system.category.localeCompare(b.system.category) || a.name.localeCompare(b.name))
      .map(item => ({
        id: item.id, name: item.name, img: item.img, description: item.system.description,
        category: game.i18n.localize(itemCategories[item.system.category] ?? ""),
        canUse: item.system.canUse, canThrow: item.system.canThrow
      }));
    const describe = (actor, list) => ({
      uuid: actor.uuid, name: actor.name, img: actor.img, list,
      hp: actor.system.hp ? `${actor.system.hp.raw}/${actor.system.hp.max}` : "",
      belly: actor.system.belly ? game.i18n.format(actor.system.belly.hungry ? "SYSTEM.Belly.HungryDays" : "SYSTEM.Belly.Eaten",
        { eaten: actor.system.belly.eaten, needed: actor.system.belly.needed, days: actor.system.belly.hungryDays }) : "",
      hungry: actor.system.belly?.hungry
    });
    context.members = system.memberActors.map(actor => describe(actor, "members"));
    context.reserve = system.reserveActors.map(actor => describe(actor, "reserve"));
    context.isGM = game.user.isGM;
    return context;
  }

  /** Dropping a Pokemon adds it to the Team, or to the Reserve List if dropped there. */
  async _onDropActor(event, actor) {
    if (!this.isEditable || actor.type === "Team") return;
    const list = event.target.closest("[data-list=reserve]") ? "reserve" : "members";
    const other = list === "members" ? "reserve" : "members";
    const system = this.document.system;
    if (system[list].includes(actor.uuid)) return;
    await this.document.update({
      [`system.${list}`]: [...system[list], actor.uuid],
      [`system.${other}`]: system[other].filter(uuid => uuid !== actor.uuid)
    });
  }

  /** Only plain Items go in the Treasure Bag. */
  async _onDropItem(event, item) {
    if (item.type !== "Item") return;
    // Items dragged from a member's sheet move into the bag rather than being copied
    if (item.actor && item.actor !== this.document && item.actor.isOwner) return transferItem(item, this.document);
    return super._onDropItem(event, item);
  }

  static #onUseItem(event, target) {
    const item = this.document.items.get(target.closest("[data-item-id]").dataset.itemId);
    if (item) useItem(item);
  }

  static #onThrowItem(event, target) {
    const item = this.document.items.get(target.closest("[data-item-id]").dataset.itemId);
    if (item) throwItem(item);
  }

  /** Gives an item from the bag to a member to hold. */
  static async #onGiveItem(event, target) {
    const item = this.document.items.get(target.closest("[data-item-id]").dataset.itemId);
    if (!item) return;
    const member = await chooseUser(this.document);
    if (member) await holdItem(member, item);
  }

  static async #onDeleteItem(event, target) {
    await this.document.items.get(target.closest("[data-item-id]").dataset.itemId)?.delete();
  }

  static async #onOpenDocument(event, target) {
    const { itemId, uuid } = target.closest("[data-item-id], [data-uuid]").dataset;
    const document = itemId ? this.document.items.get(itemId) : await fromUuid(uuid);
    document?.sheet.render({ force: true });
  }

  static async #onRemoveMember(event, target) {
    const { uuid, list } = target.closest("[data-uuid]").dataset;
    await this.document.update({ [`system.${list}`]: this.document.system[list].filter(other => other !== uuid) });
  }

  static async #onNewDay() {
    await this.document.system.newDay();
  }
}
