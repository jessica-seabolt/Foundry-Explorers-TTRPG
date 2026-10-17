import { SYSTEM_ID, getDieString, getSkillDie, isHungry } from '../constants.mjs';
import { applyDamage, applyEffects, postAutomationMessage } from './conditions.mjs';
import { heldItemOf } from './features.mjs';
import { dropItemAt, floorItemOf, spacesPassed, wallBetween } from './floor-items.mjs';
import { teamOf } from './items.mjs';
import { getRooms } from './rooms.mjs';
import { resolveDocument, rollTableDocument, wildTokenData, worldActorFor } from './dungeon/spawns.mjs';
import { isGrounded } from './weather.mjs';

export const TRAP_FLAG = "trap";
const USER_MOVEMENT = ["dragging", "keyboard"];
const MATCHUP_MULTIPLIERS = { immune: 0, mostlyIneffective: 0.25, notVeryEffective: 0.5, effective: 1, superEffective: 2, extremelyEffective: 4 };

const escape = text => foundry.utils.escapeHTML(text ?? "");
const format = (key, data) => game.i18n.format(key, data);
export const trapOf = tile => tile.flags?.[SYSTEM_ID]?.[TRAP_FLAG] ?? null;

export function trapTileData(item, topLeft, gridSize) {
  const { _id, folder, sort, ownership, ...data } = item;
  return {
    texture: { src: data.img }, x: topLeft.x, y: topLeft.y, width: gridSize, height: gridSize,
    hidden: !data.system?.trap?.visible,
    flags: { [SYSTEM_ID]: { [TRAP_FLAG]: { item: data } } }
  };
}

const tileCenter = tile => ({ x: tile.x + tile.width / 2, y: tile.y + tile.height / 2 });
const sameSpace = (a, b) => a.i === b.i && a.j === b.j;
const distance = (a, b) => Math.max(Math.abs(a.i - b.i), Math.abs(a.j - b.j));

function terrainOf(scene) {
  const terrain = scene.flags?.[SYSTEM_ID]?.dungeon?.terrain;
  return terrain?.cells ? terrain : null;
}

export function isGround(scene, { i, j }) {
  const terrain = terrainOf(scene);
  if (!terrain) {
    const rect = scene.dimensions?.sceneRect;
    const center = scene.grid.getCenterPoint({ i, j });
    return rect ? rect.contains(center.x, center.y) : true;
  }
  if (i < 0 || j < 0 || j >= terrain.width || i >= terrain.height) return false;
  return terrain.cells[j + i * terrain.width] === "1";
}

export function tokenAt(scene, offset, except = null) {
  return scene.tokens.find(token => token !== except && token.getOccupiedGridSpaceOffsets().some(cell => sameSpace(cell, offset))) ?? null;
}

export function openSpacesNear(scene, origin, radius) {
  const grid = scene.grid;
  const from = grid.getCenterPoint(origin);
  const spaces = [];
  for (let i = origin.i - radius; i <= origin.i + radius; i++) {
    for (let j = origin.j - radius; j <= origin.j + radius; j++) {
      const space = { i, j };
      if (sameSpace(space, origin) || !isGround(scene, space) || tokenAt(scene, space)) continue;
      if (wallBetween(scene, from, grid.getCenterPoint(space))) continue;
      spaces.push(space);
    }
  }
  return spaces.sort((a, b) => distance(a, origin) - distance(b, origin) || Math.random() - 0.5);
}

function openSpacesOnFloor(scene) {
  const terrain = terrainOf(scene);
  const spaces = [];
  if (terrain) {
    for (let i = 0; i < terrain.height; i++) for (let j = 0; j < terrain.width; j++) {
      if (terrain.cells[j + i * terrain.width] === "1") spaces.push({ i, j });
    }
  }
  else {
    for (const room of getRooms(scene)) {
      for (const shape of room.shapes.filter(shape => shape.type === "rectangle")) {
        const first = scene.grid.getOffset({ x: shape.x + 1, y: shape.y + 1 });
        const last = scene.grid.getOffset({ x: shape.x + shape.width - 1, y: shape.y + shape.height - 1 });
        for (let i = first.i; i <= last.i; i++) for (let j = first.j; j <= last.j; j++) spaces.push({ i, j });
      }
    }
  }
  return spaces.filter(space => !tokenAt(scene, space));
}

const moveTokenTo = (token, space) => token.update(token.parent.grid.getTopLeftPoint(space), { animate: false });

export const setsOffTraps = actor => !!actor && actor.type !== "Team" && (actor.hasPlayerOwner || !!teamOf(actor));

async function onMoveToken(tokenDocument, movement) {
  if (!game.user.isActiveGM || !USER_MOVEMENT.includes(movement.method)) return;
  const actor = tokenDocument.actor;
  const scene = tokenDocument.parent;
  if (!setsOffTraps(actor) || !scene) return;
  const traps = scene.tiles.filter(tile => trapOf(tile));
  if (!traps.length) return;
  const grid = scene.grid;
  for (const space of spacesPassed(tokenDocument, movement).slice(1)) {
    const tile = traps.find(tile => sameSpace(grid.getOffset(tileCenter(tile)), space));
    if (!tile) continue;
    await triggerTrap(tile, tokenDocument, space);
    return;
  }
}

async function rollAvoid(actor, skills, difficulty, trapName) {
  const options = skills.map(skill => ({ skill, ...getSkillDie(actor, skill) }))
    .sort((a, b) => (b.sides * 3.5 + b.modifier) - (a.sides * 3.5 + a.modifier));
  const best = options[0];
  const roll = await new foundry.dice.Roll(getDieString({ sides: best.sides, modifier: best.modifier, advantage: isHungry(actor) ? 'disadvantage' : 'normal' })).evaluate();
  await roll.toMessage({
    speaker: foundry.documents.ChatMessage.implementation.getSpeaker({ actor }),
    flavor: format("SYSTEM.Traps.AvoidRoll", { skill: game.i18n.localize(`SYSTEM.Skills.${best.skill.charAt(0).toUpperCase()}${best.skill.slice(1)}`), trap: escape(trapName), difficulty })
  });
  return roll.total >= difficulty;
}

export async function triggerTrap(tile, token, space = token.parent.grid.getOffset(tileCenter(tile)), trapItem = trapOf(tile).item) {
  const actor = token.actor;
  const trap = trapItem.system?.trap ?? {};
  if (tile.hidden || !trapOf(tile)?.triggered) await tile.update({ hidden: false, [`flags.${SYSTEM_ID}.${TRAP_FLAG}.triggered`]: true });
  const here = token.parent.grid.getOffset(token.getCenterPoint());
  if (!sameSpace(here, space)) await moveTokenTo(token, space);
  await postAutomationMessage(actor, [format(trap.visible ? "SYSTEM.Traps.SteppedOnTile" : "SYSTEM.Traps.SteppedOn", {
    name: escape(actor.name), trap: escape(trapItem.name), img: trapItem.img
  })]);
  if (trap.avoid?.length && await rollAvoid(actor, trap.avoid, trap.difficulty ?? 10, trapItem.name)) {
    await postAutomationMessage(actor, [format("SYSTEM.Traps.Avoided", { name: escape(actor.name), trap: escape(trapItem.name) })]);
    return;
  }
  const context = { actor, token, scene: token.parent, tile, space, item: trapItem };
  for (const effect of trap.effects ?? []) {
    try {
      await TRAP_EFFECTS[effect.type]?.(effect, context);
    } catch (error) {
      console.error(error);
      ui.notifications.error(error.message);
    }
  }
  if (trapItem.system?.manualNote) {
    await postAutomationMessage(actor, [format("SYSTEM.Items.ManualNote", { item: escape(trapItem.name), note: escape(trapItem.system.manualNote) })]);
  }
}

const say = (actor, key, data = {}) => postAutomationMessage(actor, [format(key, { name: escape(actor.name), ...data })]);

async function replaceItem(item, newName) {
  const replacement = await findItemData(newName);
  if (!replacement) return null;
  const holder = item.parent;
  const wasHeld = holder.system?.heldItem === item.id;
  const [created] = await holder.createEmbeddedDocuments("Item", [replacement]);
  if (wasHeld) await holder.update({ "system.heldItem": created.id });
  await item.delete();
  return created;
}

async function findItemData(name) {
  const pack = game.packs.get(`${SYSTEM_ID}.items`);
  const entry = pack?.index.find(entry => entry.name === name);
  const document = entry ? await pack.getDocument(entry._id) : game.items.find(item => item.name === name);
  if (!document) return null;
  const { _id, folder, ...data } = document.toObject();
  return data;
}

function carriedItems(actor) {
  const held = heldItemOf(actor);
  const bag = teamOf(actor)?.items.filter(item => item.type === "Item") ?? [];
  return [...(held ? [held] : []), ...bag];
}

const pick = (list, count = 1) => [...list].sort(() => Math.random() - 0.5).slice(0, count);

async function summonAround(scene, origin, count) {
  const table = await resolveDocument(scene.flags?.[SYSTEM_ID]?.dungeon?.enemyTable);
  if (!table) return 0;
  const spaces = openSpacesNear(scene, origin, 3);
  const tokens = [];
  for (const space of spaces.slice(0, count)) {
    const actor = await worldActorFor(await rollTableDocument(table));
    if (actor) tokens.push(await wildTokenData(actor, scene.grid.getTopLeftPoint(space)));
  }
  if (tokens.length) await scene.createEmbeddedDocuments("Token", tokens);
  return tokens.length;
}

export const TRAP_EFFECT_TYPES = {
  effects: '{"type":"effects","effects":[{"effect":"poisoned"}],"grounded":false}',
  damage: '{"type":"damage","formula":"3d6","moveType":"fire","radius":1,"matchup":false,"grounded":false}  (or "amount":25)',
  fall: '{"type":"fall","formula":"5d6","skill":"movement","difficulty":10,"condition":"restrained","grounded":true}',
  hunger: '{"type":"hunger","days":2}',
  ppLeech: '{"type":"ppLeech"}', seal: '{"type":"seal"}', trip: '{"type":"trip"}', sticky: '{"type":"sticky"}', grimy: '{"type":"grimy"}',
  transformItem: '{"type":"transformItem","to":"Big Apple","count":1}',
  resetStats: '{"type":"resetStats"}', warp: '{"type":"warp"}', gust: '{"type":"gust","tiles":10,"damage":"2d6"}',
  summon: '{"type":"summon","count":"1d3+1"}', itemsToPokemon: '{"type":"itemsToPokemon","radius":4}',
  gather: '{"type":"gather","grudge":true}', random: '{"type":"random"}'
};

export const TRAP_EFFECTS = {
  async effects(effect, { actor, item }) {
    if (effect.grounded && !isGrounded(actor)) return say(actor, "SYSTEM.Traps.FloatedOver", { trap: escape(item.name) });
    await applyEffects(actor, effect.effects ?? [], { sourceName: item.name });
  },

  async damage(effect, { actor, scene, space, item }) {
    if (effect.grounded && !isGrounded(actor)) return say(actor, "SYSTEM.Traps.FloatedOver", { trap: escape(item.name) });
    let amount = effect.amount ?? 0;
    if (effect.formula) {
      const roll = await new foundry.dice.Roll(effect.formula).evaluate();
      await roll.toMessage({ speaker: foundry.documents.ChatMessage.implementation.getSpeaker({ actor }), flavor: item.name });
      amount = roll.total;
    }
    const radius = effect.radius ?? 0;
    const victims = radius
      ? scene.tokens.filter(token => token.actor && token.getOccupiedGridSpaceOffsets().some(cell => distance(cell, space) <= radius)).map(token => token.actor)
      : [actor];
    for (const victim of victims) {
      const matchup = effect.matchup && effect.moveType ? victim.system.getTypeMatchup?.(effect.moveType) : null;
      const dealt = Math.floor(amount * (matchup ? MATCHUP_MULTIPLIERS[matchup] ?? 1 : 1));
      await applyDamage(victim, { amount: dealt, moveType: effect.moveType ?? null, label: item.name });
    }
  },

  async fall(effect, { actor, item }) {
    if (effect.grounded && !isGrounded(actor)) return say(actor, "SYSTEM.Traps.FloatedOver", { trap: escape(item.name) });
    const landed = await rollAvoid(actor, [effect.skill ?? 'movement'], effect.difficulty ?? 10, item.name);
    const roll = await new foundry.dice.Roll(effect.formula ?? "5d6").evaluate();
    await roll.toMessage({ speaker: foundry.documents.ChatMessage.implementation.getSpeaker({ actor }), flavor: item.name });
    await applyDamage(actor, { amount: landed ? Math.floor(roll.total / 2) : roll.total, label: item.name });
    if (effect.condition) await applyEffects(actor, [{ effect: effect.condition }], { sourceName: item.name });
  },

  async hunger(effect, { actor }) {
    if (!actor.system.belly) return;
    await actor.update({ "system.belly.eaten": 0, "system.belly.fedDays": 0, "system.belly.hungryDays": effect.days ?? 2 });
    await say(actor, "SYSTEM.Traps.Hungry");
  },

  async ppLeech(effect, { actor }) {
    const [move] = pick(actor.items.filter(item => item.type === "Move" && item.system.ppLeft > 0));
    if (!move) return;
    await move.update({ "system.ppLeft": 0 });
    await say(actor, "SYSTEM.Traps.PPLeeched", { move: escape(move.name) });
  },

  async seal(effect, { actor }) {
    const [move] = pick(actor.items.filter(item => item.type === "Move" && !item.getFlag(SYSTEM_ID, "sealed")));
    if (!move) return;
    await move.setFlag(SYSTEM_ID, "sealed", true);
    await say(actor, "SYSTEM.Traps.Sealed", { move: escape(move.name) });
  },

  async trip(effect, { actor, token }) {
    const held = heldItemOf(actor);
    if (held) await dropItemAt(held, actor, token, { away: true });
  },

  async sticky(effect, { actor }) {
    const [item] = pick(carriedItems(actor).filter(item => !item.getFlag(SYSTEM_ID, "sticky")));
    if (!item) return;
    await item.setFlag(SYSTEM_ID, "sticky", true);
    await say(actor, "SYSTEM.Traps.Stuck", { item: escape(item.name) });
  },

  async grimy(effect, { actor }) {
    const roll = await new foundry.dice.Roll("1d6").evaluate();
    const count = Math.ceil(roll.total / 2);
    const isFood = item => item.system.category === 'foods' && item.name !== "Grimy Food";
    const held = heldItemOf(actor);
    const bag = (teamOf(actor)?.items.filter(item => item.type === "Item" && isFood(item)) ?? []);
    const spoiled = [...(held && isFood(held) ? [held] : []), ...pick(bag, count)];
    for (const item of spoiled) await replaceItem(item, "Grimy Food");
    await say(actor, "SYSTEM.Traps.Grimy", { count: spoiled.length });
  },

  async transformItem(effect, { actor }) {
    const candidates = carriedItems(actor).filter(item => item.name !== effect.to);
    for (const item of pick(candidates, effect.count ?? 1)) {
      const old = item.name;
      if (await replaceItem(item, effect.to)) await say(actor, "SYSTEM.Traps.Transformed", { item: escape(old), to: escape(effect.to) });
    }
  },

  async resetStats(effect, { actor }) {
    const changes = actor.system.statChanges ?? {};
    await actor.update(Object.fromEntries(Object.keys(changes).map(stat => [`system.statChanges.${stat}`, 0])));
    await say(actor, "SYSTEM.Traps.StatsReset");
  },

  async warp(effect, { actor, token, scene }) {
    const [space] = pick(openSpacesOnFloor(scene));
    if (!space) return say(actor, "SYSTEM.Traps.WarpManual");
    await moveTokenTo(token, space);
    await say(actor, "SYSTEM.Traps.Warped");
  },

  async gust(effect, { actor, token, scene, space }) {
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
    const [di, dj] = directions[Math.floor(Math.random() * directions.length)];
    let at = space, hit = null, blocked = false;
    for (let step = 0; step < (effect.tiles ?? 10); step++) {
      const next = { i: at.i + di, j: at.j + dj };
      if (!isGround(scene, next) || wallBetween(scene, scene.grid.getCenterPoint(at), scene.grid.getCenterPoint(next))) { blocked = true; break; }
      hit = tokenAt(scene, next, token);
      if (hit) { blocked = true; break; }
      at = next;
    }
    if (!sameSpace(at, space)) await moveTokenTo(token, at);
    await say(actor, "SYSTEM.Traps.BlownAway");
    if (!blocked) return;
    const roll = await new foundry.dice.Roll(effect.damage ?? "2d6").evaluate();
    await roll.toMessage({ speaker: foundry.documents.ChatMessage.implementation.getSpeaker({ actor }), flavor: format("SYSTEM.Traps.Impact", { trap: "Gust Trap" }) });
    await applyDamage(actor, { amount: roll.total, label: "Gust Trap" });
    if (hit?.actor) await applyDamage(hit.actor, { amount: roll.total, label: "Gust Trap" });
  },

  async summon(effect, { actor, scene, space }) {
    const roll = await new foundry.dice.Roll(effect.count ?? "1d3+1").evaluate();
    const count = await summonAround(scene, space, roll.total);
    await say(actor, "SYSTEM.Traps.Summoned", { count });
  },

  async itemsToPokemon(effect, { actor, scene, space }) {
    const grid = scene.grid;
    const items = scene.tiles.filter(tile => floorItemOf(tile) && distance(grid.getOffset(tileCenter(tile)), space) <= (effect.radius ?? 4));
    const table = await resolveDocument(scene.flags?.[SYSTEM_ID]?.dungeon?.enemyTable);
    if (!table) return say(actor, "SYSTEM.Traps.NoPokemonTable");
    const tokens = [];
    for (const tile of items) {
      const pokemon = await worldActorFor(await rollTableDocument(table));
      if (!pokemon) continue;
      tokens.push(await wildTokenData(pokemon, grid.getTopLeftPoint(grid.getOffset(tileCenter(tile)))));
      await tile.delete();
    }
    if (tokens.length) await scene.createEmbeddedDocuments("Token", tokens);
    await say(actor, "SYSTEM.Traps.ItemsBecamePokemon", { count: tokens.length });
  },

  async gather(effect, { actor, token, scene, space }) {
    const wild = scene.tokens.filter(other => other !== token && other.actor && !other.actor.hasPlayerOwner && !teamOf(other.actor)
      && !other.actor.statuses.has("fainted"));
    const spaces = openSpacesNear(scene, space, 3);
    let moved = 0;
    for (const other of wild) {
      const target = spaces.shift();
      if (!target) break;
      await moveTokenTo(other, target);
      moved++;
    }
    await say(actor, effect.grudge ? "SYSTEM.Traps.Grudge" : "SYSTEM.Traps.Gathered", { count: moved });
  },

  async random(effect, { actor, token, tile, space }) {
    const pack = game.packs.get(`${SYSTEM_ID}.traps`);
    const choices = (pack?.index ?? []).filter(entry => !["Random Trap", "Wonder Tile"].includes(entry.name));
    const [entry] = pick(choices);
    if (!entry) return;
    const trap = (await pack.getDocument(entry._id)).toObject();
    delete trap._id;
    await tile.update({ "texture.src": trap.img, [`flags.${SYSTEM_ID}.${TRAP_FLAG}.item`]: trap });
    await say(actor, "SYSTEM.Traps.BecameTrap", { trap: escape(trap.name) });
    await triggerTrap(tile, token, space, trap);
  }
};

export async function syncTrapVisibility(scene) {
  if (!game.user.isActiveGM || !scene?.tiles) return;
  const eyedrop = scene.tokens.some(token => setsOffTraps(token.actor) && token.actor.statuses.has("eyedrop"));
  const updates = scene.tiles.filter(tile => trapOf(tile)).flatMap(tile => {
    const { item, triggered } = trapOf(tile);
    const shown = !!item?.system?.trap?.visible || !!triggered || eyedrop;
    return tile.hidden === !shown ? [] : [{ _id: tile.id, hidden: !shown }];
  });
  if (updates.length) await scene.updateEmbeddedDocuments("Tile", updates);
}

function scenesOf(actor) {
  if (actor.token?.parent) return [actor.token.parent];
  return [...new Set(actor.getDependentTokens?.().map(token => token.parent) ?? [])];
}

function onEyedropChanged(effect) {
  if (!effect.statuses?.has("eyedrop") || !(effect.parent instanceof Actor)) return;
  for (const scene of scenesOf(effect.parent)) syncTrapVisibility(scene);
}

export function registerTrapHooks() {
  Hooks.on("moveToken", onMoveToken);
  Hooks.on("createActiveEffect", onEyedropChanged);
  Hooks.on("deleteActiveEffect", onEyedropChanged);
  Hooks.on("createToken", token => syncTrapVisibility(token.parent));
  Hooks.on("deleteToken", token => syncTrapVisibility(token.parent));
}
