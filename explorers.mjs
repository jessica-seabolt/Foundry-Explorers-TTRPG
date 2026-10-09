import { filePath, toModString, toMoveString, hasEffectCount, SYSTEM_ID, toSkillString } from './constants.mjs';
import { CharacterSheet, PlayerSheet } from './module/actor-sheet.mjs';
import { ExplorersCombat, addTieChoiceListeners, registerCombatHooks } from './module/combat.mjs';
import { FAINTED_STATUS, buildStatusEffects } from './module/conditions.mjs';
import { CharacterDataModel, FeatureDataModel, ItemDataModel, MoveDataModel, PlayerDataModel } from "./module/data-models.mjs";
import { FeatureSheet } from './module/feature-sheet.mjs';
import { SystemToken } from './module/documents.mjs';
import { DamageRoll, ExplorersDie, ExplorersRoll, StatusRoll } from './module/explorers-roll.mjs';
import { ItemSheet } from './module/item-sheet.mjs';
import macros from './module/macros.mjs';
import BaseMessageModel from './module/message-model.mjs';
import { registerStatusCheckHooks } from './module/roll-dialog.mjs';
import { MoveSheet } from './module/move-sheet.mjs';
import { initSocket } from './module/socket.mjs';
import { ROOM_BEHAVIOR, RoomRegionBehaviorType } from './module/rooms.mjs';
import { ExplorersVisionSource, registerVisionHooks } from './module/vision.mjs';

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
  CONFIG.Combat.documentClass = ExplorersCombat;
  CONFIG.Combat.initiative = { formula: "@abilities.spe.value", decimals: 0 };
  // CONFIG.Actor.documentClass = SystemActor;
  // CONFIG.Item.documentClass = SystemItem;

  // Configure System Data Models.
  CONFIG.Actor.dataModels = {
    Character: CharacterDataModel,
    Player: PlayerDataModel
  };
  CONFIG.Item.dataModels = {
    Item: ItemDataModel,
    Move: MoveDataModel,
    Feature: FeatureDataModel
  };
  CONFIG.Dice.rolls = [ExplorersRoll, DamageRoll, StatusRoll];
  CONFIG.Dice.terms.d = ExplorersDie;
  CONFIG.ChatMessage.dataModels.base = BaseMessageModel;

  // Configure Sheets.
  Actors.registerSheet(SYSTEM_ID, PlayerSheet, { types: ["Player"], makeDefault: true });
  Actors.registerSheet(SYSTEM_ID, CharacterSheet, { types: ["Character"] });
  Items.registerSheet(SYSTEM_ID, ItemSheet, { types: ["Item"], makeDefault: true });
  Items.registerSheet(SYSTEM_ID, MoveSheet, { types: ["Move"] });
  Items.registerSheet(SYSTEM_ID, FeatureSheet, { types: ["Feature"] });
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

  CONFIG.statusEffects = buildStatusEffects();
  CONFIG.specialStatusEffects.DEFEATED = FAINTED_STATUS;

  // Dungeon Rooms are Regions with the Room behavior, and token vision follows the Visibility rules
  CONFIG.RegionBehavior.dataModels[ROOM_BEHAVIOR] = RoomRegionBehaviorType;
  CONFIG.RegionBehavior.typeIcons[ROOM_BEHAVIOR] = "fa-solid fa-dungeon";
  CONFIG.Canvas.visionSourceClass = ExplorersVisionSource;
  registerSettings();
});

function registerSettings() {
  const refreshVision = () => canvas?.ready && canvas.perception.update({ initializeVision: true });
  game.settings.register(SYSTEM_ID, "autoTargeting", {
    name: "SYSTEM.Settings.AutoTargeting.Name",
    hint: "SYSTEM.Settings.AutoTargeting.Hint",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(SYSTEM_ID, "autoApplyDamage", {
    name: "SYSTEM.Settings.AutoApplyDamage.Name",
    hint: "SYSTEM.Settings.AutoApplyDamage.Hint",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(SYSTEM_ID, "autoRollNpcStatusChecks", {
    name: "SYSTEM.Settings.AutoRollNpcStatusChecks.Name",
    hint: "SYSTEM.Settings.AutoRollNpcStatusChecks.Hint",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(SYSTEM_ID, "dungeonVisibility", {
    name: "SYSTEM.Settings.DungeonVisibility.Name",
    hint: "SYSTEM.Settings.DungeonVisibility.Hint",
    scope: "world", config: true, type: Boolean, default: true, onChange: refreshVision
  });
  game.settings.register(SYSTEM_ID, "revealWallTiles", {
    name: "SYSTEM.Settings.RevealWallTiles.Name",
    hint: "SYSTEM.Settings.RevealWallTiles.Hint",
    scope: "world", config: true, type: Boolean, default: true, onChange: refreshVision
  });
}

Hooks.once("i18nInit", () => {
  Localization.localizeDataModel(CharacterDataModel);
  Localization.localizeDataModel(PlayerDataModel);
  Localization.localizeDataModel(ItemDataModel);
  Localization.localizeDataModel(MoveDataModel);
  Localization.localizeDataModel(FeatureDataModel);
});

Hooks.once("ready", async () => {
  initSocket();
  // Bring permanent Conditions and token vision up to date for actors whose Features predate this
  if (game.user.isActiveGM) {
    for (const actor of game.actors) {
      if (actor.items.some(item => item.type === "Feature")) await actor.system.onFeaturesChanged?.();
    }
  }
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
  addTieChoiceListeners(message, html);
  // if (typeof message.system.alterMessageHTML === "function") {
  //   await message.system.alterMessageHTML(html);
  // }
  if (typeof message.system.addListeners === "function") {
    await message.system.addListeners(html);
  }
}

Hooks.on("renderChatMessageHTML", renderChatMessageHTML)
registerCombatHooks();
registerVisionHooks();
registerStatusCheckHooks();

// Adding, removing or editing a Feature can change Visibility, permanent Conditions and so on
function onFeatureChanged(item, userId) {
  if (item.type !== "Feature" || !item.actor || userId !== game.user.id) return;
  item.actor.system.onFeaturesChanged?.();
}
Hooks.on("createItem", (item, options, userId) => onFeatureChanged(item, userId));
Hooks.on("deleteItem", (item, options, userId) => onFeatureChanged(item, userId));
Hooks.on("updateItem", (item, changes, options, userId) => {
  if (changes.system?.rules) onFeatureChanged(item, userId);
});
// Eyedrop added or removed by hand also changes what the token can detect
function onEyedropChanged(effect, userId) {
  if (userId !== game.user.id || !effect.statuses?.has("eyedrop") || !(effect.parent instanceof Actor)) return;
  effect.parent.system.syncTokens?.();
}
Hooks.on("createActiveEffect", (effect, options, userId) => onEyedropChanged(effect, userId));
Hooks.on("deleteActiveEffect", (effect, options, userId) => onEyedropChanged(effect, userId));