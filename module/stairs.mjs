import { SYSTEM_ID } from '../constants.mjs';
import { gainGmAdventureToken } from './adventure-tokens.mjs';
import { gainTokens, leftovers } from './dungeon-tokens.mjs';
import { isGround, openSpacesNear, setsOffTraps, tokenAt, trapOf } from './traps.mjs';

const USER_MOVEMENT = ["dragging", "keyboard"];
const LANDING_RADIUS = 3;
const prompting = new Set();

const localize = key => game.i18n.localize(key);
const format = (key, data) => game.i18n.format(key, data);
const escape = text => foundry.utils.escapeHTML(text ?? "");
const tileCenter = tile => ({ x: tile.x + tile.width / 2, y: tile.y + tile.height / 2 });
const sameSpace = (a, b) => a.i === b.i && a.j === b.j;

export const isStairs = tile => tile.flags?.[SYSTEM_ID]?.dungeonMarker === "stairs";

// Older floors only have their number in the name, like "BF3" or "B3F".
export function floorNumber(scene) {
  const stored = scene.flags?.[SYSTEM_ID]?.dungeon?.floor;
  if (Number.isFinite(stored)) return stored;
  const numbers = scene.name.match(/\d+/g);
  return numbers ? Number(numbers.at(-1)) : null;
}

export function nextFloor(scene) {
  const current = floorNumber(scene);
  if (!scene.folder || current === null) return null;
  return scene.folder.contents
    .filter(other => other !== scene && other.flags?.[SYSTEM_ID]?.dungeon && floorNumber(other) > current)
    .sort((a, b) => floorNumber(a) - floorNumber(b))[0] ?? null;
}

const comesAlong = token => !!token.actor && token.actor.type !== "Team"
  && (setsOffTraps(token.actor) || token.disposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY);

function startSpace(scene) {
  const grid = scene.grid;
  if (scene.initial?.x != null) return grid.getOffset({ x: scene.initial.x, y: scene.initial.y });
  const marker = scene.tiles.find(tile => tile.flags?.[SYSTEM_ID]?.dungeonMarker === "start");
  if (marker) return grid.getOffset(tileCenter(marker));
  const stairs = scene.tiles.find(isStairs);
  if (stairs) return grid.getOffset(tileCenter(stairs));
  return grid.getOffset({ x: scene.dimensions.sceneRect.center.x, y: scene.dimensions.sceneRect.center.y });
}

function landingSpaces(scene, count) {
  const origin = startSpace(scene);
  const blocked = scene.tiles.filter(tile => trapOf(tile) || isStairs(tile)).map(tile => scene.grid.getOffset(tileCenter(tile)));
  const free = space => isGround(scene, space) && !tokenAt(scene, space) && !blocked.some(other => sameSpace(other, space));
  const spaces = [origin, ...openSpacesNear(scene, origin, LANDING_RADIUS)].filter(free);
  while (spaces.length < count) spaces.push(origin);
  return spaces;
}

export async function takeStairs(from, to, tokens) {
  const spaces = landingSpaces(to, tokens.length);
  const data = tokens.map((token, index) => {
    const { _id, _movementHistory, ...rest } = token.toObject();
    return { ...rest, ...to.grid.getTopLeftPoint(spaces[index]) };
  });
  for (const combat of game.combats.filter(combat => combat.scene?.id === from.id)) await combat.delete();
  await to.createEmbeddedDocuments("Token", data);
  await from.deleteEmbeddedDocuments("Token", tokens.map(token => token.id));
  await to.activate();
  await foundry.documents.ChatMessage.implementation.create({
    speaker: { alias: localize("SYSTEM.Stairs.Title") },
    content: `<p>${format("SYSTEM.Stairs.Arrived", { floor: escape(to.name) })}</p>`
  });
}

async function promptStairs(tokenDocument) {
  const from = tokenDocument.parent;
  const to = nextFloor(from);
  const name = escape(tokenDocument.name);
  if (!to) {
    ui.notifications.info(format("SYSTEM.Stairs.NoNextFloor", { name, floor: escape(from.name) }));
    return;
  }
  const candidates = from.tokens.filter(token => token.actor && token.actor.type !== "Team");
  const rows = candidates.map(token => `<label class="checkbox"><input type="checkbox" name="${token.id}" ${comesAlong(token) ? "checked" : ""}> ${escape(token.name)}</label>`).join("");
  const battle = game.combats.some(combat => combat.scene?.id === from.id) ? `<p>${localize("SYSTEM.Stairs.EndsBattle")}</p>` : "";
  const left = leftovers(from, candidates.filter(comesAlong));
  const earned = left.total ? `<p>${format("SYSTEM.Stairs.Leftovers", left)}</p>` : "";
  const chosen = await foundry.applications.api.DialogV2.wait({
    window: { title: "SYSTEM.Stairs.Title" },
    content: `<p>${format("SYSTEM.Stairs.Prompt", { name, floor: escape(to.name) })}</p>${battle}${earned}<p>${localize("SYSTEM.Stairs.WhoGoes")}</p><div class="stairs-tokens">${rows}</div>`,
    buttons: [
      { action: "go", label: format("SYSTEM.Stairs.Go", { floor: to.name }), icon: "fa-solid fa-stairs", default: true,
        callback: (event, button) => candidates.filter(token => button.form.elements[token.id]?.checked) },
      { action: "stay", label: "SYSTEM.Stairs.Stay", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!Array.isArray(chosen) || !chosen.length) return;
  const { foes, items, total } = leftovers(from, chosen);
  await takeStairs(from, to, chosen);
  await gainTokens(total, format("SYSTEM.DungeonTokens.LeftBehind", { foes, items }));
  await gainGmAdventureToken();
}

async function onMoveToken(tokenDocument, movement) {
  if (!game.user.isActiveGM || !USER_MOVEMENT.includes(movement.method) || movement.pending?.waypoints?.length) return;
  const scene = tokenDocument.parent;
  if (!scene || prompting.has(scene.id) || !setsOffTraps(tokenDocument.actor)) return;
  const stairs = scene.tiles.filter(isStairs);
  if (!stairs.length) return;
  const space = scene.grid.getOffset(tokenDocument.getCenterPoint(movement.destination));
  if (!stairs.some(tile => sameSpace(scene.grid.getOffset(tileCenter(tile)), space))) return;
  prompting.add(scene.id);
  await foundry.documents.ChatMessage.implementation.create({
    speaker: foundry.documents.ChatMessage.implementation.getSpeaker({ token: tokenDocument }),
    content: `<p>${format("SYSTEM.Stairs.Found", { name: escape(tokenDocument.name) })}</p>`
  });
  try {
    await promptStairs(tokenDocument);
  } finally {
    prompting.delete(scene.id);
  }
}

export function registerStairsHooks() {
  Hooks.on("moveToken", onMoveToken);
}
