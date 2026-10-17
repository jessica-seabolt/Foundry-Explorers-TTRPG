import { SYSTEM_ID } from '../constants.mjs';
import { suggestAdventureToken } from './adventure-tokens.mjs';
import { FAINTED_STATUS, postAutomationMessage } from './conditions.mjs';
import { getRules, heldItemOf } from './features.mjs';
import { teamOf } from './items.mjs';
import { registerSocketHandler, requestFromGM } from './socket.mjs';

export const FLOOR_ITEM_FLAG = "floorItem";
const PLACE_ACTION = "placeFloorItem";
const ITEM_SIZE = 0.66;

const pickedUpThisTurn = new Map();

export const floorItemOf = tile => tile.flags?.[SYSTEM_ID]?.[FLOOR_ITEM_FLAG] ?? null;

export function floorItemTileData(item, center, gridSize, { forSale = false } = {}) {
  const { _id, folder, sort, ownership, ...data } = item;
  const size = gridSize * ITEM_SIZE;
  return {
    texture: { src: data.img },
    x: center.x - size / 2, y: center.y - size / 2, width: size, height: size,
    flags: { [SYSTEM_ID]: { [FLOOR_ITEM_FLAG]: { item: data, forSale } } }
  };
}

async function placeFloorItem(scene, itemData, point) {
  const center = scene.grid.getCenterPoint(scene.grid.getOffset(point));
  return scene.createEmbeddedDocuments("Tile", [floorItemTileData(itemData, center, scene.grid.size)]);
}

const picksUpItems = actor => !!actor && actor.type !== "Team";

async function announce(actor, text) {
  if (actor.hasPlayerOwner) return postAutomationMessage(actor, [text]);
  const ChatMessage = foundry.documents.ChatMessage.implementation;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }), content: `<p>${text}</p>`, whisper: ChatMessage.getWhisperRecipients("GM")
  });
}

async function pickUp(actor, tile) {
  const itemName = floorItemOf(tile)?.item?.name ?? "";
  const found = await pickUpItem(actor, tile);
  if (found) await suggestAdventureToken(actor, "foundItem", itemName);
  return found;
}

async function pickUpItem(actor, tile) {
  const { item } = floorItemOf(tile);
  const name = foundry.utils.escapeHTML(actor.name);
  const itemName = foundry.utils.escapeHTML(item.name);
  const team = teamOf(actor);
  if (team && team.system.bagCount < team.system.capacity) {
    await team.createEmbeddedDocuments("Item", [item]);
    await tile.delete();
    await announce(actor, game.i18n.format("SYSTEM.FloorItems.PickedUp", { name, item: itemName, team: foundry.utils.escapeHTML(team.name) }));
    return true;
  }
  if (!heldItemOf(actor)) {
    const [created] = await actor.createEmbeddedDocuments("Item", [item]);
    await actor.update({ "system.heldItem": created.id });
    await tile.delete();
    await announce(actor, game.i18n.format("SYSTEM.FloorItems.PickedUpHeld", { name, item: itemName }));
    return true;
  }
  if (actor.hasPlayerOwner) await announce(actor, game.i18n.format("SYSTEM.FloorItems.NoRoom", { name, item: itemName }));
  return false;
}

function freeSpaceNear(scene, center, { away = false } = {}) {
  const grid = scene.grid;
  const here = grid.getOffset(center);
  const occupied = new Set(scene.tiles.filter(tile => floorItemOf(tile)).map(tile => {
    const offset = grid.getOffset({ x: tile.x + tile.width / 2, y: tile.y + tile.height / 2 });
    return `${offset.i},${offset.j}`;
  }));
  const around = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
  const offsets = away ? around.sort(() => Math.random() - 0.5) : [[0, 0], ...around];
  const nearby = offsets.map(([di, dj]) => ({ i: here.i + di, j: here.j + dj }));
  return nearby.find(offset => !occupied.has(`${offset.i},${offset.j}`)
    && !wallBetween(scene, center, grid.getCenterPoint(offset))) ?? null;
}

async function requestPlacement(scene, itemData, point) {
  if (game.user.isGM) {
    await placeFloorItem(scene, itemData, point);
    return true;
  }
  return !!(await requestFromGM(PLACE_ACTION, { sceneId: scene.id, item: itemData, point }));
}

async function removeFromHolder(item) {
  const holder = item.parent;
  if (holder?.system?.heldItem === item.id) await holder.update({ "system.heldItem": null });
  await item.delete();
}

export async function dropItemAt(item, pokemon, token = null, { away = false } = {}) {
  token ??= pokemon.token ?? pokemon.getDependentTokens?.({ scenes: globalThis.canvas?.scene ?? game.scenes.active })?.[0];
  const scene = token?.parent;
  if (!item || !scene) {
    if (item) ui.notifications.warn(game.i18n.format("SYSTEM.FloorItems.NotOnScene", { name: foundry.utils.escapeHTML(pokemon.name) }));
    return null;
  }
  const center = token.getCenterPoint();
  const spot = freeSpaceNear(scene, center, { away });
  if (!spot) {
    ui.notifications.warn(game.i18n.format("SYSTEM.FloorItems.NoSpace", { name: foundry.utils.escapeHTML(pokemon.name) }));
    return null;
  }
  const itemData = item.toObject();
  if (!(await requestPlacement(scene, itemData, scene.grid.getCenterPoint(spot)))) return null;
  await removeFromHolder(item);
  await postAutomationMessage(pokemon, [game.i18n.format("SYSTEM.FloorItems.Dropped", {
    name: foundry.utils.escapeHTML(pokemon.name), item: foundry.utils.escapeHTML(itemData.name)
  })]);
  return spot;
}

export async function dropHeldItem(actor) {
  const item = heldItemOf(actor);
  return item ? dropItemAt(item, actor) : null;
}

function onFainted(effect) {
  if (!game.user.isActiveGM || !effect.statuses?.has(FAINTED_STATUS)) return;
  const actor = effect.parent;
  if (!(actor instanceof Actor) || actor.hasPlayerOwner) return;
  dropHeldItem(actor).catch(error => console.error(error));
}

export function spacesPassed(tokenDocument, movement) {
  const grid = tokenDocument.parent.grid;
  const points = [movement.origin, ...movement.passed.waypoints].map(position => tokenDocument.getCenterPoint(position));
  const path = points.length > 1 ? grid.getDirectPath(points) : [];
  const seen = new Set();
  return [grid.getOffset(points[0]), ...path].filter(({ i, j }) => !seen.has(`${i},${j}`) && seen.add(`${i},${j}`));
}

const orientation = (a, b, c) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
const segmentsCross = (a, b, c, d) => orientation(a, b, c) !== orientation(a, b, d) && orientation(c, d, a) !== orientation(c, d, b);

export function wallBetween(scene, a, b) {
  return scene.walls.some(wall => {
    if (wall.move === CONST.WALL_MOVEMENT_TYPES.NONE) return false;
    if (wall.door && wall.ds === CONST.WALL_DOOR_STATES.OPEN) return false;
    const [x0, y0, x1, y1] = wall.c;
    return segmentsCross(a, b, { x: x0, y: y0 }, { x: x1, y: y1 });
  });
}

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

  const combat = game.combats.find(combat => combat.scene === scene && combat.started && combat.getCombatantsByToken(tokenDocument).length);
  const turnKey = combat ? `${combat.id}:${combat.round}:${combat.turn}` : null;
  const picked = turnKey ? (pickedUpThisTurn.get(turnKey) ?? new Set()) : null;
  if (picked?.has(tokenDocument.id)) return;

  const range = Math.max(0, ...getRules(actor, "pickupRange").map(rule => rule.tiles ?? 0));
  let spaces = spacesPassed(tokenDocument, movement);
  if (spaces.length < 2) return;
  if (actor.hasPlayerOwner || teamOf(actor)) {
    const trapAt = scene.tiles.filter(tile => tile.flags?.[SYSTEM_ID]?.trap).map(tile => grid.getOffset({ x: tile.x + tile.width / 2, y: tile.y + tile.height / 2 }));
    const stop = spaces.findIndex((space, index) => index > 0 && trapAt.some(trap => trap.i === space.i && trap.j === space.j));
    if (stop > 0) spaces = spaces.slice(0, stop + 1);
  }
  for (const space of range ? spaces : spaces.slice(1)) {
    const spaceCenter = grid.getCenterPoint(space);
    const inReach = items.filter(entry => !entry.done
      && Math.max(Math.abs(entry.offset.i - space.i), Math.abs(entry.offset.j - space.j)) <= range
      && (!range || !wallBetween(scene, spaceCenter, entry.center)));
    for (const entry of inReach) {
      entry.done = true;
      const floorItem = floorItemOf(entry.tile);
      if (floorItem.forSale) {
        if (!actor.hasPlayerOwner) continue;
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
  if (!(await requestPlacement(scene, item.toObject(), { x: data.x, y: data.y }))) return;
  if (owned) await removeFromHolder(item);
}

export function registerFloorItemHooks() {
  Hooks.on("moveToken", onMoveToken);
  Hooks.on("dropCanvasData", onDropCanvasData);
  Hooks.on("createActiveEffect", onFainted);
  registerSocketHandler(PLACE_ACTION, async ({ sceneId, item, point }) => {
    const scene = game.scenes.get(sceneId);
    if (!scene || item?.type !== "Item") return false;
    await placeFloorItem(scene, item, point);
    return true;
  });
}
