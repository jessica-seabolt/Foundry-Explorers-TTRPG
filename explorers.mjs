import { filePath, toModString, toMoveString, hasEffectCount, SYSTEM_ID, toSkillString } from './constants.mjs';
import { CharacterSheet, PlayerSheet } from './module/actor-sheet.mjs';
import { CharacterDataModel, ItemDataModel, MoveDataModel, PlayerDataModel } from "./module/data-models.mjs";
import { SystemToken } from './module/documents.mjs';
import { DamageRoll, ExplorersDie, ExplorersRoll } from './module/explorers-roll.mjs';
import { ItemSheet } from './module/item-sheet.mjs';
import macros from './module/macros.mjs';
import BaseMessageModel from './module/message-model.mjs';
import { MoveSheet } from './module/move-sheet.mjs';
import { conditions } from './module/types.mjs';

const { Localization } = foundry.helpers;
const { Die } = foundry.dice.terms;
const { Item, Macro } = foundry.documents;
const { Actors, Items } = foundry.documents.collections;

globalThis.explorers = {
  macros,
};

Hooks.once("init", () => {
  // Configure custom Document implementations.
  CONFIG.Token.documentClass = SystemToken;
  // CONFIG.Actor.documentClass = SystemActor;
  // CONFIG.Item.documentClass = SystemItem;

  // Configure System Data Models.
  CONFIG.Actor.dataModels = {
    Character: CharacterDataModel,
    Player: PlayerDataModel
  };
  CONFIG.Item.dataModels = {
    Item: ItemDataModel,
    Move: MoveDataModel
  };
  CONFIG.Dice.rolls = [ExplorersRoll, DamageRoll];
  CONFIG.Dice.terms.d = ExplorersDie;
  CONFIG.ChatMessage.dataModels.base = BaseMessageModel;

  // Configure Sheets.
  Actors.registerSheet(SYSTEM_ID, PlayerSheet, { types: ["Player"], makeDefault: true });
  Actors.registerSheet(SYSTEM_ID, CharacterSheet, { types: ["Character"] });
  Items.registerSheet(SYSTEM_ID, ItemSheet, { types: ["Item"], makeDefault: true });
  Items.registerSheet(SYSTEM_ID, MoveSheet, { types: ["Move"] });
  const templates = ["templates/actor/partials/stat-block.hbs",
    "templates/actor/partials/skill-block.hbs"].map(filePath);
  foundry.applications.handlebars.loadTemplates(templates);
  Handlebars.registerHelper('modString', toModString);
  Handlebars.registerHelper('skillDie', toSkillString);
  Handlebars.registerHelper('moveDie', toMoveString);
  Handlebars.registerHelper('filePath', filePath);
  Handlebars.registerHelper('hasEffectCount', hasEffectCount);
  Handlebars.registerHelper('equals', (a, b) => a === b);
  Handlebars.registerHelper('inSet', (a, b) => a.has(b));

  // Configure trackable attributes.
  CONFIG.Actor.trackableAttributes = {
    Character: {
      bar: ["hp.max"],
      value: ["hp.raw"]
    },
    Player: {
      bar: ["hp.max"],
      value: ["hp.raw"]
    }
  };

  const statusEffects = [];
  for (const condition in conditions) {
    statusEffects.push({ id: condition, name: conditions[condition], img: "./" })
  }
  CONFIG.statusEffects = statusEffects;
});

Hooks.once("i18nInit", () => {
  Localization.localizeDataModel(CharacterDataModel);
  Localization.localizeDataModel(PlayerDataModel);
  Localization.localizeDataModel(ItemDataModel);
  Localization.localizeDataModel(MoveDataModel);
});

Hooks.once("ready", async () => {
  Hooks.on("hotbarDrop", (bar, data, slot) => {
    if (data.type == "Item") {
      assignItemMacro(data, slot);
      return false;
    }
  });
});

async function assignItemMacro(itemData, slot) {
  const item = await getDocumentClass("Item").fromDropData(itemData);
  let command, name = `Display ${item.name}`;
  switch (item.type) {
    case "Move":
      if (item.actor) {
        name = `Roll ${item.name}${item.actor.name ? ` (${item.actor.name})`: ""}`;
        command = `await explorers.macros.openMoveRoll("${item.actor.id}", "${item.id}");`;
      } else {
        command = `await foundry.applications.ui.Hotbar.toggleDocumentSheet("${item.uuid}");`;
      }
      break;
    default:
      command = `await foundry.applications.ui.Hotbar.toggleDocumentSheet("${item.uuid}");`;
  }

  let macro = game.macros.find((m) => (m.name === item.name) && (m.command === command));
  if (!macro) {
    macro = await Macro.create({
      name,
      type: "script",
      img: item.img,
      command
    });
  }
  game.user.assignHotbarMacro(macro, slot);
}

async function renderChatMessageHTML(message, html, context) {
  if (!message.isContentVisible) return;
  // if (typeof message.system.alterMessageHTML === "function") {
  //   await message.system.alterMessageHTML(html);
  // }
  if (typeof message.system.addListeners === "function") {
    await message.system.addListeners(html);
  }
}

Hooks.on("renderChatMessageHTML", renderChatMessageHTML)