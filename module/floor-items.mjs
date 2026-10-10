// Items lying on a dungeon floor: Tiles showing the item, which a Team member picks up by stepping into their space
// during their movement (one item per turn in a battle). Dropping an item on the map puts it on the floor.

import { SYSTEM_ID } from '../constants.mjs';
import { postAutomationMessage } from './conditions.mjs';
import { getRules, heldItemOf } from './features.mjs';
import { teamOf } from './items.mjs';
import { registerSocketHandler, requestFromGM } from './socket.mjs';

export const FLOOR_ITEM_FLAG = "floorItem";
const PLACE_ACTION = "placeFloorItem";
const ITEM_SIZE = 0.66; // of a grid space

/** Tokens that have picked up an item this turn of a battle: combat.id:round:turn -> token ids */
const pickedUpThisTurn = new Map();

export const floorItemOf = tile => tile.flags?.[SYSTEM_ID]?.[FLOOR_ITEM_FLAG] ?? null;

/**
 * Tile data for an item lying in a grid space.
 * @param {object} item       The item's data (from toObject())
 * @param {{x: number, y: number}} center    The center of the grid space
 * @param {number} gridSize
 * @param {object} [options]
 * @param {boolean} [options.forSale]    In a Kecleon Shop: stepping on it shows the price instead of picking it up
 */
export function floorItemTileData(item, center, gridSize, { forSale = false } = {}) {
  const { _id, folder, sort, ownership, ...data } = item;
  const size = gridSize * ITEM_SIZE;
  return {
    texture: { src: data.img },
    x: center.x - size / 2, y: center.y - size / 2, width: size, height: size,
    flags: { [SYSTEM_ID]: { [FLOOR_ITEM_FLAG]: { item: data, forSale } } }
  };
}

/** Puts an item on the floor (GM only). */
async function placeFloorItem(scene, itemData, point) {
  const center = scene.grid.getCenterPoint(scene.grid.getOffset(point));
  return scene.createEmbeddedDocuments("Tile", [floorItemTileData(itemData, center, scene.grid.size)]);
}

/** Can this Pokemon pick items up? Members of a Team, and players' own Pokemon. */
function picksUpItems(actor) {
  return !!actor && (actor.type === "Player" || !!teamOf(actor));
}

/**
 * Picks an item up: into the Team's Treasure Bag if there's room, otherwise into the Pokemon's paws if they're empty.
 * @returns {boolean} Whether it was picked up
 */
async function pickUp(actor, tile) {
  const { item } = floorItemOf(tile);
  const name = foundry.utils.escapeHTML(actor.name);
  const itemName = foundry.utils.escapeHTML(item.name);
  const team = teamOf(actor);
  if (team && team.system.bagCount < team.system.capacity) {
    await team.createEmbeddedDocuments("Item", [item]);
    await tile.delete();
    await postAutomationMessage(actor, [game.i18n.format("SYSTEM.FloorItems.PickedUp", { name, item: itemName, team: foundry.utils.escapeHTML(team.name) })]);
    return true;
  }
  if (!heldItemOf(actor)) {
    const [created] = await actor.createEmbeddedDocuments("Item", [item]);
    await actor.update({ "system.heldItem": created.id });
    await tile.delete();
    await postAutomationMessage(actor, [game.i18n.format("SYSTEM.FloorItems.PickedUpHeld", { name, item: itemName })]);
    return true;
  }
  await postAutomationMessage(actor, [game.i18n.format("SYSTEM.FloorItems.NoRoom", { name, item: itemName })]);
  return false;
}

/** The grid spaces a token's center passed through during a movement, in order; the first is where it started. */
function spacesPassed(tokenDocument, movement) {
  const grid = tokenDocument.parent.grid;
  const points = [movement.origin, ...movement.passed.waypoints].map(position => tokenDocument.getCenterPoint(position));
  const path = points.length > 1 ? grid.getDirectPath(points) : [];
  const seen = new Set();
  return [grid.getOffset(points[0]), ...path].filter(({ i, j }) => !seen.has(`${i},${j}`) && seen.add(`${i},${j}`));
}

const orientation = (a, b, c) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
const segmentsCross = (a, b, c, d) => orientation(a, b, c) !== orientation(a, b, d) && orientation(c, d, a) !== orientation(c, d, b);

/** Is there a wall (or closed door) between two points? Read from the scene's walls, so it works off-canvas too. */
function wallBetween(scene, a, b) {
  return scene.walls.some(wall => {
    if (wall.move === CONST.WALL_MOVEMENT_TYPES.NONE) return false;
    if (wall.door && wall.ds === CONST.WALL_DOOR_STATES.OPEN) return false;
    const [x0, y0, x1, y1] = wall.c;
    return segmentsCross(a, b, { x: x0, y: y0 }, { x: x1, y: y1 });
  });
}

/**
 * Picks up floor items a Team member stepped onto (run by the active GM). Magician picks up items up to 4 tiles from
 * any space along its path (but not through walls), including where it started.
 */
async function onMoveToken(tokenDocument, movement) {
  if (!game.user.isActiveGM) return;
  const actor = tokenDocument.actor;
  const scene = tokenDocument.parent;
  if (!picksUpItems(actor) || !scene) return;
  const grid = scene.grid;
  const items = scene.tiles.filter(tile => floorItemOf(tile)).map(tile => {
    const center = { x: tile.x + tile.width / 2, y: tile.y + tile.height / 2 };
    return { tile, center, offset: grid.getOffset(center), done: false };
  });
  if (!items.length) return;

  // In a battle, one item per turn
  const combat = game.combats.find(combat => combat.scene === scene && combat.started && combat.getCombatantsByToken(tokenDocument).length);
  const turnKey = combat ? `${combat.id}:${combat.round}:${combat.turn}` : null;
  const picked = turnKey ? (pickedUpThisTurn.get(turnKey) ?? new Set()) : null;
  if (picked?.has(tokenDocument.id)) return;

  const range = Math.max(0, ...getRules(actor, "pickupRange").map(rule => rule.tiles ?? 0));
  const spaces = spacesPassed(tokenDocument, movement);
  if (spaces.length < 2) return;
  for (const space of range ? spaces : spaces.slice(1)) {
    const spaceCenter = grid.getCenterPoint(space);
    const inReach = items.filter(entry => !entry.done
      && Math.max(Math.abs(entry.offset.i - space.i), Math.abs(entry.offset.j - space.j)) <= range
      && (!range || !wallBetween(scene, spaceCenter, entry.center)));
    for (const entry of inReach) {
      entry.done = true;
      const floorItem = floorItemOf(entry.tile);
      if (floorItem.forSale) {
        const price = floorItem.item.system?.price ?? 0;
        await postAutomationMessage(actor, [game.i18n.format("SYSTEM.FloorItems.ForSale", {
          name: foundry.utils.escapeHTML(actor.name), item: foundry.utils.escapeHTML(floorItem.item.name), price
        })]);
        continue;
      }
      if (!(await pickUp(actor, entry.tile))) continue;
      if (picked) {
        picked.add(tokenDocument.id);
        pickedUpThisTurn.clear();
        pickedUpThisTurn.set(turnKey, picked);
        return;
      }
    }
  }
}

/**
 * Dropping an Item on the map puts it on the floor. The GM can drop any item; players can drop items their
 * Pokemon or Team carry, which leave the bag.
 */
function onDropCanvasData(board, data) {
  if (data.type !== "Item" || !data.uuid) return;
  const indexed = fromUuidSync(data.uuid);
  if (indexed && indexed.type !== "Item") return;
  dropItem(data).catch(error => {
    console.error(error);
    ui.notifications.error(error.message);
  });
  return false;
}

async function dropItem(data) {
  const item = await fromUuid(data.uuid);
  const scene = canvas.scene;
  if (!item || item.type !== "Item" || !scene) return;
  const owned = item.parent instanceof Actor && item.isOwner;
  if (!game.user.isGM && !owned) {
    ui.notifications.warn("SYSTEM.FloorItems.CantDrop", { localize: true });
    return;
  }
  const itemData = item.toObject();
  const point = { x: data.x, y: data.y };
  if (game.user.isGM) await placeFloorItem(scene, itemData, point);
  else if (!(await requestFromGM(PLACE_ACTION, { sceneId: scene.id, item: itemData, point }))) return;
  if (owned) {
    const holder = item.parent;
    if (holder.system?.heldItem === item.id) await holder.update({ "system.heldItem": null });
    await item.delete();
  }
}

export function registerFloorItemHooks() {
  Hooks.on("moveToken", onMoveToken);
  Hooks.on("dropCanvasData", onDropCanvasData);
  registerSocketHandler(PLACE_ACTION, async ({ sceneId, item, point }) => {
    const scene = game.scenes.get(sceneId);
    if (!scene || item?.type !== "Item") return false;
    await placeFloorItem(scene, item, point);
    return true;
  });
}
