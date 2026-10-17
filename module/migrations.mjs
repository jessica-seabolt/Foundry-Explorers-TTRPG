import { SYSTEM_ID } from '../constants.mjs';

const MIGRATION_SETTING = "migrationVersion";
const DEFAULT_ITEM_IMG = "icons/svg/item-bag.svg";

const MIGRATIONS = [
  { version: 1, run: migrateItemIconsAndStealing },
  { version: 2, run: unnumberWildPokemon },
  { version: 3, run: () => refreshFeatureRules(["Rapid-Fire Cannon"]) },
  { version: 4, run: () => refreshMoveEffects(["Leech Seed", "Ingrain"]) },
  { version: 5, run: refreshWeatherRules }
];

const WEATHER_FEATURES = [
  "Air Lock", "Chlorophyll", "Drizzle", "Drought", "Dry Skin", "Electric Surge", "Flower Gift", "Grass Pelt", "Grassy Surge",
  "Hydration", "Ice Body", "Leaf Guard", "Misty Surge", "Overcoat", "Protected from the Elements", "Protosynthesis",
  "Psychic Surge", "Rain Dish", "Sand Force", "Sand Rush", "Sand Stream", "Sand Veil", "Slush Rush", "Snow Cloak",
  "Snow Warning", "Solar Powered", "Surge Surfer", "Swift Swim"
];
const WEATHER_ITEMS = [
  "Rainy Orb", "Sandy Orb", "Snowy Orb", "Sunny Orb", "Weather Lock Orb", "Weather Band", "Utility Umbrella", "Terrain Extender"
];

export function registerMigrationSettings() {
  game.settings.register(SYSTEM_ID, MIGRATION_SETTING, { scope: "world", config: false, type: Number, default: 0 });
}

export async function runMigrations() {
  if (!game.user.isActiveGM) return;
  const current = game.settings.get(SYSTEM_ID, MIGRATION_SETTING);
  for (const migration of MIGRATIONS.filter(migration => migration.version > current)) {
    try {
      const changed = await migration.run();
      await game.settings.set(SYSTEM_ID, MIGRATION_SETTING, migration.version);
      if (changed) ui.notifications.info(game.i18n.format("SYSTEM.Migration.Done", { count: changed }));
    } catch (error) {
      console.error(error);
      ui.notifications.error(game.i18n.format("SYSTEM.Migration.Failed", { error: error.message }));
      return;
    }
  }
}

function allActors() {
  const unlinked = game.scenes.contents.flatMap(scene => scene.tokens.contents.filter(token => !token.actorLink && token.actor).map(token => token.actor));
  return [...game.actors, ...unlinked];
}

async function updateItems(build) {
  let count = 0;
  const worldUpdates = game.items.contents.map(item => build(item) && { _id: item.id, ...build(item) }).filter(Boolean);
  if (worldUpdates.length) await foundry.documents.Item.implementation.updateDocuments(worldUpdates);
  count += worldUpdates.length;
  for (const actor of allActors()) {
    const updates = actor.items.contents.map(item => build(item) && { _id: item.id, ...build(item) }).filter(Boolean);
    if (!updates.length) continue;
    await actor.updateEmbeddedDocuments("Item", updates);
    count += updates.length;
  }
  return count;
}

async function migrateItemIconsAndStealing() {
  const items = await game.packs.get(`${SYSTEM_ID}.items`)?.getIndex({ fields: ["img"] });
  const icons = new Map((items ?? []).map(entry => [entry.name, entry.img]));
  let count = await updateItems(item => {
    if (item.type !== "Item" || item.img !== DEFAULT_ITEM_IMG) return null;
    const img = icons.get(item.name);
    return img && img !== DEFAULT_ITEM_IMG ? { img } : null;
  });

  return count + await refreshFeatureRules(["Magician", "Sticky Hold", "Pickpocket"]);
}

async function refreshFeatureRules(names) {
  const features = await game.packs.get(`${SYSTEM_ID}.features`)?.getIndex({ fields: ["system.rules", "system.manualNote"] });
  const updated = new Map((features ?? []).filter(entry => names.includes(entry.name)).map(entry => [entry.name, entry.system]));
  return updateItems(item => {
    const source = item.type === "Feature" && updated.get(item.name);
    if (!source || JSON.stringify(item.system.rules) === JSON.stringify(source.rules)) return null;
    return { "system.rules": source.rules, "system.manualNote": source.manualNote ?? "" };
  });
}

async function refreshWeatherRules() {
  return await refreshFeatureRules(WEATHER_FEATURES) + await refreshItemRules(WEATHER_ITEMS) + await refreshMoveEffects(["Snowscape"]);
}

async function refreshItemRules(names) {
  const items = await game.packs.get(`${SYSTEM_ID}.items`)?.getIndex({ fields: ["system.rules", "system.onUse", "system.manualNote"] });
  const updated = new Map((items ?? []).filter(entry => names.includes(entry.name)).map(entry => [entry.name, entry.system]));
  return updateItems(item => {
    const source = item.type === "Item" && updated.get(item.name);
    if (!source) return null;
    if (JSON.stringify(item.system.rules) === JSON.stringify(source.rules) && JSON.stringify(item.system.onUse) === JSON.stringify(source.onUse)) return null;
    return { "system.rules": source.rules, "system.onUse": source.onUse, "system.manualNote": source.manualNote ?? "" };
  });
}

async function refreshMoveEffects(names) {
  const moves = await game.packs.get(`${SYSTEM_ID}.moves`)?.getIndex({ fields: ["system.effects"] });
  const updated = new Map((moves ?? []).filter(entry => names.includes(entry.name)).map(entry => [entry.name, entry.system.effects]));
  return updateItems(item => {
    const effects = item.type === "Move" && updated.get(item.name);
    if (!effects || JSON.stringify(item.system.effects) === JSON.stringify(effects)) return null;
// == replaces the object instead of merging into it.
    return { "system.==effects": effects };
  });
}

async function unnumberWildPokemon() {
  let count = 0;
  const wild = game.actors.filter(actor => actor.prototypeToken?.appendNumber
    && actor._stats?.compendiumSource?.startsWith(`Compendium.${SYSTEM_ID}.enemies.`));
  for (const actor of wild) await actor.update({ "prototypeToken.appendNumber": false });
  count += wild.length;
  const wildIds = new Set(wild.map(actor => actor.id));
  for (const scene of game.scenes.contents) {
    const updates = scene.tokens.contents.flatMap(token => {
      const base = token.actor?.prototypeToken?.name;
      if (!wildIds.has(token.actorId) || !base) return [];
      const numbered = token.name.match(/^(.*) \d+$/);
      return numbered && numbered[1] === base ? [{ _id: token.id, name: base }] : [];
    });
    if (updates.length) await scene.updateEmbeddedDocuments("Token", updates);
    count += updates.length;
  }
  return count;
}
