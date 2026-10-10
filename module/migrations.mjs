// One-time updates to a world's existing documents when the system changes, run by the active GM on load.

import { SYSTEM_ID } from '../constants.mjs';

const MIGRATION_SETTING = "migrationVersion";
const DEFAULT_ITEM_IMG = "icons/svg/item-bag.svg";

/** Each migration runs once per world, in order. */
const MIGRATIONS = [
  { version: 1, run: migrateItemIconsAndStealing }
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

/** Every actor in the world, including the ones in Scenes' unlinked tokens. */
function allActors() {
  const unlinked = game.scenes.contents.flatMap(scene => scene.tokens.contents.filter(token => !token.actorLink && token.actor).map(token => token.actor));
  return [...game.actors, ...unlinked];
}

/** Applies updates to world Items and every actor's Items: build(item) returns the changes for one item, or null. */
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

/**
 * Items still showing the default bag icon get their own from the Items compendium (matched by name), and Features
 * that gained automation (Magician, Sticky Hold and Pickpocket stealing Held Items) get their new rules.
 */
async function migrateItemIconsAndStealing() {
  const items = await game.packs.get(`${SYSTEM_ID}.items`)?.getIndex({ fields: ["img"] });
  const icons = new Map((items ?? []).map(entry => [entry.name, entry.img]));
  let count = await updateItems(item => {
    if (item.type !== "Item" || item.img !== DEFAULT_ITEM_IMG) return null;
    const img = icons.get(item.name);
    return img && img !== DEFAULT_ITEM_IMG ? { img } : null;
  });

  const features = await game.packs.get(`${SYSTEM_ID}.features`)?.getIndex({ fields: ["system.rules", "system.manualNote"] });
  const updated = new Map((features ?? []).filter(entry => ["Magician", "Sticky Hold", "Pickpocket"].includes(entry.name))
    .map(entry => [entry.name, entry.system]));
  count += await updateItems(item => {
    const source = item.type === "Feature" && updated.get(item.name);
    if (!source || JSON.stringify(item.system.rules) === JSON.stringify(source.rules)) return null;
    return { "system.rules": source.rules, "system.manualNote": source.manualNote ?? "" };
  });
  return count;
}
