import { SYSTEM_ID } from '../constants.mjs';
import { FAINTED_STATUS, applyDamage, cureConditions, healActor, postAutomationMessage } from './conditions.mjs';
import { DamageRoll, StatusRoll } from './explorers-roll.mjs';
import { floorItemOf } from './floor-items.mjs';
import { setHudItem } from './hud.mjs';
import { getRooms } from './rooms.mjs';
import { isGround, openSpacesOnFloor, setsOffTraps, syncTrapVisibility, tokenAt, trapOf, trapTileData } from './traps.mjs';
import { effects, statConditions, stateConditions } from './types.mjs';
import { openFieldDialog } from './weather.mjs';
import { resolveDocument, rollTableDocument, wildTokenData, worldActorFor } from './dungeon/spawns.mjs';

const TOKENS_SETTING = "dungeonTokens";
const UNLIMITED_LEVEL = 10;
const MONSTER_HOUSE_POKEMON = 6;
const MONSTER_HOUSE_COLOR = "#d0453a";

const localize = key => game.i18n.localize(key);
const format = (key, data) => game.i18n.format(key, data);
const escape = text => foundry.utils.escapeHTML(text ?? "");

// "each" costs are per unit; the rest are a flat price.
export const SPENDS = {
  raiseRoll: { cost: 1, each: true, manualOnly: true },
  field: { cost: 2 },
  trap: { cost: 2, each: true },
  strengthenTrap: { cost: 2, each: true },
  monsterHouse: { cost: 4 },
  extraPokemon: { cost: 1, each: true },
  evolveBoss: { cost: 4, each: true },
  bossMove: { cost: 3, each: true },
  bossRareQuality: { cost: 3, each: true },
  minions: { cost: 1, each: true },
  megaEvolve: { cost: 4 }
};

export function registerDungeonTokenSettings() {
  game.settings.register(SYSTEM_ID, TOKENS_SETTING, {
    scope: "world", config: false, type: Number, default: 0, onChange: () => renderCounter()
  });
}

export function teamLevel() {
  const teams = game.actors.filter(actor => actor.type === "Team");
  const members = teams.length ? teams.flatMap(team => team.system.memberActors ?? []) : game.actors.filter(actor => actor.hasPlayerOwner);
  return Math.max(1, ...members.map(actor => actor.system?.level ?? 0));
}

export const tokenLimit = () => teamLevel() >= UNLIMITED_LEVEL ? Infinity : teamLevel() + 1;
export const currentTokens = () => game.settings.get(SYSTEM_ID, TOKENS_SETTING) ?? 0;
const setTokens = value => game.settings.set(SYSTEM_ID, TOKENS_SETTING, Math.max(0, Math.floor(value)));

async function announce(publicLine, gmLine = null) {
  const ChatMessage = foundry.documents.ChatMessage.implementation;
  const speaker = { alias: localize("SYSTEM.DungeonTokens.Title") };
  if (publicLine) await ChatMessage.create({ speaker, content: `<p>${publicLine}</p>` });
  if (gmLine) await ChatMessage.create({ speaker, content: `<p>${gmLine}</p>`, whisper: ChatMessage.getWhisperRecipients("GM").map(user => user.id) });
}

export async function gainTokens(amount, detail = "") {
  if (!game.user.isGM || amount <= 0) return 0;
  const before = currentTokens();
  const after = Math.max(before, Math.min(tokenLimit(), before + amount));
  await setTokens(after);
  const gained = after - before;
  await announce(format(gained < amount ? "SYSTEM.DungeonTokens.GainedCapped" : "SYSTEM.DungeonTokens.Gained", { count: gained, earned: amount, detail }));
  return gained;
}

export async function spendTokens(cost, detail) {
  if (!game.user.isGM) return false;
  if (cost > currentTokens()) {
    ui.notifications.warn(format("SYSTEM.DungeonTokens.NotEnough", { cost, have: currentTokens() }));
    return false;
  }
  await setTokens(currentTokens() - cost);
  await announce(format("SYSTEM.DungeonTokens.Spent", { count: cost }), format("SYSTEM.DungeonTokens.SpentOn", { count: cost, detail }));
  return true;
}

const isDown = actor => actor.statuses?.has(FAINTED_STATUS) || (actor.system?.hp && actor.system.hp.raw <= 0);

export function leftovers(scene, leaving = []) {
  const foes = scene.tokens.filter(token => !leaving.includes(token) && token.actor && token.actor.type !== "Team"
    && !setsOffTraps(token.actor) && token.disposition !== CONST.TOKEN_DISPOSITIONS.FRIENDLY && !isDown(token.actor)).length;
  const items = scene.tiles.filter(tile => floorItemOf(tile) && !floorItemOf(tile).forSale).length;
  return { foes, items, total: foes + items };
}

function renderCounter() {
  const scene = canvas?.scene;
  const visible = game.user.isGM || !!scene?.flags?.[SYSTEM_ID]?.dungeon;
  if (!visible) return setHudItem("explorers-dungeon-tokens", null);
  const limit = tokenLimit();
  const html = `<span><i class="fa-solid fa-gem"></i> ${format("SYSTEM.DungeonTokens.Counter", { count: currentTokens(), limit: limit === Infinity ? "∞" : limit })}</span>`;
  setHudItem("explorers-dungeon-tokens", html, {
    order: 0,
    tooltip: game.user.isGM ? localize("SYSTEM.DungeonTokens.Tooltip") : localize("SYSTEM.DungeonTokens.PlayerTooltip"),
    onClick: game.user.isGM ? () => openSpendDialog() : null,
    onContextMenu: game.user.isGM ? () => openAdjustDialog() : null
  });
}

async function openAdjustDialog() {
  const limit = tokenLimit();
  const allowance = limit === Infinity ? null : limit * 2;
  const content = `<div class="form-group"><label>${localize("SYSTEM.DungeonTokens.Title")}</label>
    <div class="form-fields"><input type="number" name="count" min="0" value="${currentTokens()}" autofocus></div></div>
    ${allowance ? `<p class="hint">${format("SYSTEM.DungeonTokens.AllowanceHint", { count: allowance })}</p>` : ""}`;
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: "SYSTEM.DungeonTokens.Title" },
    content,
    buttons: [
      { action: "set", label: "SYSTEM.DungeonTokens.Set", default: true, callback: (event, button) => Number(button.form.elements.count.value) },
      ...(allowance ? [{ action: "allowance", label: "SYSTEM.DungeonTokens.Allowance", callback: () => allowance }] : [])
    ],
    rejectClose: false
  });
  if (typeof result === "number" && Number.isFinite(result)) await setTokens(result);
}

function roomCells(scene, region) {
  const cells = [];
  for (const shape of region.shapes.filter(shape => shape.type === "rectangle")) {
    const first = scene.grid.getOffset({ x: shape.x + 1, y: shape.y + 1 });
    const last = scene.grid.getOffset({ x: shape.x + shape.width - 1, y: shape.y + shape.height - 1 });
    for (let i = first.i; i <= last.i; i++) for (let j = first.j; j <= last.j; j++) cells.push({ i, j });
  }
  return cells;
}

function blockedByTile(scene) {
  const taken = new Set(scene.tiles.filter(tile => trapOf(tile) || floorItemOf(tile) || tile.flags?.[SYSTEM_ID]?.dungeonMarker === "stairs")
    .map(tile => { const { i, j } = scene.grid.getOffset({ x: tile.x + tile.width / 2, y: tile.y + tile.height / 2 }); return `${i},${j}`; }));
  return space => taken.has(`${space.i},${space.j}`);
}

const shuffle = list => {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
};

async function floorTable(scene, key) {
  const uuid = scene.flags?.[SYSTEM_ID]?.dungeon?.[key];
  const table = uuid ? await resolveDocument(uuid) : null;
  if (!table) ui.notifications.warn(format("SYSTEM.DungeonTokens.NoTable", { floor: escape(scene.name) }));
  return table;
}

export async function addTraps(scene, count) {
  const table = await floorTable(scene, "trapTable");
  if (!table) return 0;
  const blocked = blockedByTile(scene);
  const spaces = shuffle(openSpacesOnFloor(scene).filter(space => !blocked(space)));
  const tiles = [];
  for (const space of spaces.slice(0, count)) {
    const trap = await rollTableDocument(table);
    if (trap?.type === "Item") tiles.push(trapTileData(trap.toObject(), scene.grid.getTopLeftPoint(space), scene.grid.size));
  }
  if (tiles.length) await scene.createEmbeddedDocuments("Tile", tiles);
  await syncTrapVisibility(scene);
  return tiles.length;
}

export async function spawnInRoom(scene, region, count) {
  const table = await floorTable(scene, "enemyTable");
  if (!table) return [];
  const blocked = blockedByTile(scene);
  const spaces = shuffle(roomCells(scene, region).filter(space => isGround(scene, space) && !tokenAt(scene, space) && !blocked(space)));
  const data = [];
  for (const space of spaces.slice(0, count)) {
    const actor = await worldActorFor(await rollTableDocument(table));
    if (actor) data.push(await wildTokenData(actor, scene.grid.getTopLeftPoint(space)));
  }
  const tokens = data.length ? await scene.createEmbeddedDocuments("Token", data) : [];
  const combat = game.combats.find(combat => combat.scene?.id === scene.id && combat.started);
  if (combat && tokens.length) await combat.createEmbeddedDocuments("Combatant", tokens.map(token => ({ tokenId: token.id, sceneId: scene.id, actorId: token.actorId })));
  return tokens;
}

async function makeMonsterHouse(scene, region) {
  const number = region.name.match(/\d+/)?.[0] ?? "";
  await region.update({ name: format("SYSTEM.Dungeon.MonsterHouse", { number }), color: MONSTER_HOUSE_COLOR });
}

export async function openSpendDialog(scene = canvas?.scene) {
  const have = currentTokens();
  const rooms = scene ? getRooms(scene) : [];
  const selectedRoom = rooms.find(room => canvas?.tokens?.controlled.some(token => room.testPoint({ ...token.center, elevation: token.document.elevation })));
  const rows = Object.entries(SPENDS).filter(([, spend]) => !spend.manualOnly).map(([key, spend], index) => `
    <label class="dungeon-token-spend">
      <input type="radio" name="spend" value="${key}" ${index === 0 ? "checked" : ""}>
      <span>${localize(`SYSTEM.DungeonTokens.Spends.${key}`)}</span>
      <span class="cost">${format(spend.each ? "SYSTEM.DungeonTokens.CostEach" : "SYSTEM.DungeonTokens.Cost", { cost: spend.cost })}</span>
    </label>`).join("");
  const roomOptions = rooms.map(room => `<option value="${room.id}" ${room === selectedRoom ? "selected" : ""}>${escape(room.name)}</option>`).join("");
  const content = `<p>${format("SYSTEM.DungeonTokens.Have", { count: have })}</p>
    <div class="dungeon-token-spends">${rows}</div>
    <div class="form-group"><label>${localize("SYSTEM.DungeonTokens.HowMany")}</label><div class="form-fields"><input type="number" name="count" min="1" placeholder="1"></div></div>
    ${rooms.length ? `<div class="form-group"><label>${localize("SYSTEM.DungeonTokens.Room")}</label><div class="form-fields"><select name="room">${roomOptions}</select></div></div>` : ""}
    <p class="hint">${localize("SYSTEM.DungeonTokens.HowManyHint")}</p>
    <p class="hint">${localize("SYSTEM.DungeonTokens.RaiseHint")}</p>`;
  const data = await foundry.applications.api.DialogV2.prompt({
    window: { title: "SYSTEM.DungeonTokens.Title" },
    content,
    ok: { label: "SYSTEM.DungeonTokens.Spend", callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object },
    rejectClose: false
  });
  if (!data?.spend) return;
  const count = Number(data.count) > 0 ? Math.floor(Number(data.count)) : null;
  await performSpend(scene, data.spend, count, rooms.find(room => room.id === data.room) ?? null);
}

export async function performSpend(scene, key, count = null, room = null) {
  const spend = SPENDS[key];
  const spawnCount = count ?? MONSTER_HOUSE_POKEMON;
  count ??= 1;
  const label = localize(`SYSTEM.DungeonTokens.Spends.${key}`);
  const cost = spend.each ? spend.cost * count : spend.cost;
  if (cost > currentTokens()) return ui.notifications.warn(format("SYSTEM.DungeonTokens.NotEnough", { cost, have: currentTokens() }));
  switch (key) {
    case "field":
      if (await openFieldDialog(scene)) await spendTokens(cost, label);
      return;
    case "trap": {
      const placed = await addTraps(scene, count);
      if (placed) await spendTokens(spend.cost * placed, format("SYSTEM.DungeonTokens.Placed", { label, count: placed }));
      return;
    }
    case "monsterHouse":
    case "extraPokemon": {
      if (!room) return ui.notifications.warn(localize("SYSTEM.DungeonTokens.NoRoom"));
      const spawned = await spawnInRoom(scene, room, key === "monsterHouse" ? spawnCount : count);
      if (!spawned.length) return;
      if (key === "monsterHouse") await makeMonsterHouse(scene, room);
      await spendTokens(key === "monsterHouse" ? cost : spend.cost * spawned.length,
        format("SYSTEM.DungeonTokens.Spawned", { label, count: spawned.length, room: escape(room.name) }));
      return;
    }
    default:
      await spendTokens(cost, spend.each ? format("SYSTEM.DungeonTokens.Placed", { label, count }) : label);
  }
}

function speakerActor(message) {
  return foundry.documents.ChatMessage.implementation.getSpeakerActor(message.speaker);
}

const explodeAt = die => {
  const modifier = die.modifiers.find(modifier => modifier.startsWith("x"));
  if (!modifier) return null;
  const match = modifier.match(/^x(?:>=?(\d+))?/);
  return match?.[1] ? Number(match[1]) : die.faces;
};

// Our formulas are "Nd6...+mod", optionally wrapped as "floor((...) * multiplier)".
export function rollTotal(roll) {
  const sum = roll.dice.reduce((total, die) => total + die.results.filter(result => result.active).reduce((t, result) => t + result.result, 0), 0);
  const multiplier = roll.formula.match(/\* ([\d.]+)\)$/);
  const modifier = roll.formula.match(/([+-]\s*\d+)\)?(?: \* [\d.]+\))?$/);
  const base = sum + (modifier ? Number(modifier[1].replace(/\s/g, "")) : 0);
  return multiplier ? Math.floor(base * Number(multiplier[1])) : base;
}

export async function raiseDice(roll, raises) {
  const dice = roll.dice;
  for (const { die, result, amount } of raises) {
    const term = dice[die];
    const face = term.results[result];
    if (!face?.active) continue;
    face.result = Math.min(term.faces, face.result + amount);
    const threshold = explodeAt(term);
    let current = face;
    while (threshold && current.result >= threshold && !current.exploded) {
      current.exploded = true;
      const extra = (await new foundry.dice.Roll(`1d${term.faces}`).evaluate()).total;
      current = { result: extra, active: true, fromExplosion: true };
      term.results.push(current);
    }
  }
  roll._total = rollTotal(roll);
  return roll;
}

const SUCCESS_SPAN = /<br><span style="color:(?:green|red);font-weight:bold;">[^<]*<\/span>$/;

function canRaise(message) {
  if (!game.user.isGM || !message.rolls.length || currentTokens() < 1) return false;
  const actor = speakerActor(message);
  if (!actor || actor.type === "Team" || setsOffTraps(actor)) return false;
  if (message.rolls.some(roll => roll instanceof StatusRoll) && message.getFlag(SYSTEM_ID, "statusResolved")) return false;
  return message.rolls.some(roll => roll.dice.some(die => die.results.some(result => result.active && result.result < die.faces)));
}

export async function openRaiseDialog(message) {
  const faces = [];
  message.rolls.forEach((roll, rollIndex) => roll.dice.forEach((die, dieIndex) => die.results.forEach((result, resultIndex) => {
    if (result.active && result.result < die.faces) faces.push({ rollIndex, dieIndex, resultIndex, value: result.result, max: die.faces });
  })));
  const inputs = faces.map((face, index) => `<label class="dungeon-token-die">
      <span>${face.value}</span> <i class="fa-solid fa-arrow-right"></i>
      <input type="number" name="face${index}" min="${face.value}" max="${face.max}" value="${face.value}">
    </label>`).join("");
  const data = await foundry.applications.api.DialogV2.prompt({
    window: { title: "SYSTEM.DungeonTokens.RaiseTitle" },
    content: `<p>${format("SYSTEM.DungeonTokens.RaisePrompt", { count: currentTokens() })}</p><div class="dungeon-token-dice">${inputs}</div>`,
    ok: { label: "SYSTEM.DungeonTokens.Raise", callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object },
    rejectClose: false
  });
  if (!data) return;
  const raises = faces.map((face, index) => ({ ...face, amount: Math.clamp(Math.floor(Number(data[`face${index}`]) || face.value), face.value, face.max) - face.value }))
    .filter(face => face.amount > 0);
  const cost = raises.reduce((sum, face) => sum + face.amount, 0);
  if (!cost) return;
  if (cost > currentTokens()) return ui.notifications.warn(format("SYSTEM.DungeonTokens.NotEnough", { cost, have: currentTokens() }));
  await raiseMessageRolls(message, raises, cost);
}

export async function raiseMessageRolls(message, raises, cost) {
  const rolls = message.rolls;
  const before = rolls.map(roll => roll.total);
  for (const [rollIndex, roll] of rolls.entries()) {
    await raiseDice(roll, raises.filter(face => face.rollIndex === rollIndex).map(face => ({ die: face.dieIndex, result: face.resultIndex, amount: face.amount })));
  }
  const update = { rolls };
  const roll = rolls[0];
  if (roll.options?.dc != null && message.flavor && SUCCESS_SPAN.test(message.flavor)) {
    const success = roll.total >= roll.options.dc;
    update.flavor = message.flavor.replace(SUCCESS_SPAN,
      `<br><span style="color:${success ? "green" : "red"};font-weight:bold;">${localize(success ? "SYSTEM.Dice.Success" : "SYSTEM.Dice.Failure")}</span>`);
  }
  await message.update(update);
  const name = escape(speakerActor(message)?.name);
  if (!await spendTokens(cost, format("SYSTEM.DungeonTokens.Raised", { name, from: before[0], to: roll.total }))) return;
  await raiseConsequences(message, roll, before[0]);
}

async function raiseConsequences(message, roll, before) {
  const target = roll.options?.targetId ? fromUuidSync(roll.options.targetId) : null;
  if (roll instanceof DamageRoll && target && message.getFlag(SYSTEM_ID, "damageApplied")) {
    if (roll.isHealing) return healActor(target, roll.total - before, localize("SYSTEM.DungeonTokens.Title"));
    const resist = roll.resistAbility ? target.system.getResistMod?.(roll.resistAbility) ?? 0 : 0;
    const extra = Math.max(roll.total - resist, 0) - Math.max(before - resist, 0);
    if (extra > 0) await applyDamage(target, { amount: extra, label: localize("SYSTEM.DungeonTokens.Title"), fromMove: true });
    return;
  }
  const resist = message.getFlag(SYSTEM_ID, "resist");
  if (!resist || before >= roll.options.dc || roll.total < roll.options.dc) return;
  const actor = fromUuidSync(resist.actorUuid);
  if (!actor) return;
  const isCondition = effect => stateConditions[effect] && !statConditions[effect];
  const conditions = (resist.effects ?? []).map(entry => entry.effect).filter(isCondition);
  const others = (resist.effects ?? []).filter(entry => !isCondition(entry.effect));
  await postAutomationMessage(actor, [format("SYSTEM.DungeonTokens.ResistedAfterAll", { name: escape(actor.name), move: escape(resist.moveName) })]);
  if (conditions.length) await cureConditions(actor, conditions);
  if (others.length) await postAutomationMessage(actor, [format("SYSTEM.DungeonTokens.UndoByHand", { effects: others.map(entry => localize(effects[entry.effect] ?? entry.effect)).join(", ") })]);
}

export function registerDungeonTokenHooks() {
  Hooks.on("canvasReady", renderCounter);
  Hooks.on("updateActor", (actor, changes) => {
    if (foundry.utils.hasProperty(changes, "system.level")) renderCounter();
  });
  Hooks.on("getChatMessageContextOptions", (app, options) => {
    options.push({
      name: "SYSTEM.DungeonTokens.RaiseTitle",
      icon: '<i class="fa-solid fa-gem"></i>',
      condition: li => canRaise(game.messages.get(li.dataset.messageId)),
      callback: li => openRaiseDialog(game.messages.get(li.dataset.messageId))
    });
  });
}
