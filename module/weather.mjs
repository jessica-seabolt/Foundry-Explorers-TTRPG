import { SYSTEM_ID } from '../constants.mjs';
import { AFFLICTIONS, getRules, hasRule } from './features.mjs';
import { roomOfToken } from './rooms.mjs';
import { setHudItem } from './hud.mjs';
import { registerSocketHandler, requestFromGM } from './socket.mjs';
import { terrains, typeChart, weathers } from './types.mjs';

const FIELD_FLAG = "field";
const FIELD_ACTION = "changeField";
export const TERRAIN_ROUNDS = 5;
const TIE_REROLLS = 20;

const PERMANENT = new Set(["extremelyHarshSunlight", "heavyRain", "strongWinds"]);
const FAMILY = { extremelyHarshSunlight: "harshSunlight", heavyRain: "rain" };
const SCENE_WEATHER = { rain: "rain", heavyRain: "rainStorm", snowstorm: "blizzard", fog: "fog" };
const ICONS = {
  harshSunlight: "fa-sun", extremelyHarshSunlight: "fa-sun", rain: "fa-cloud-rain", heavyRain: "fa-cloud-showers-heavy",
  sandstorm: "fa-wind", snowstorm: "fa-snowflake", fog: "fa-smog", strongWinds: "fa-wind",
  electricTerrain: "fa-bolt", grassyTerrain: "fa-seedling", mistyTerrain: "fa-cloud", psychicTerrain: "fa-brain"
};
const SHELTERED_TYPES = { sandstorm: ["rock", "steel", "ground"], snowstorm: ["ice"] };
const VISIBILITY_PENALTY = { sandstorm: 1, snowstorm: 1, fog: 2 };
const WEATHER_MOVE_TYPES = { harshSunlight: "fire", rain: "water", snowstorm: "ice", sandstorm: "rock" };
const TERRAIN_MOVE_TYPES = { electricTerrain: "electric", grassyTerrain: "grass", mistyTerrain: "fairy", psychicTerrain: "psychic" };
const TERRAIN_BOOSTS = { electricTerrain: "electric", grassyTerrain: "grass", psychicTerrain: "psychic" };
const MATCHUPS = ['immune', 'mostlyIneffective', 'notVeryEffective', 'effective', 'superEffective', 'extremelyEffective'];

const MOVES = {
  "Weather Ball": { weatherType: true },
  "Terrain Pulse": { terrainType: true },
  "Blizzard": { weather: "snowstorm" },
  "Thunder": { weather: "rain" },
  "Psyblade": { terrain: "electricTerrain" },
  "Moonlight": { heal: { other: -1 } },
  "Synthesis": { heal: { harshSunlight: 2, other: -1 } },
  "Shore Up": { heal: { sandstorm: 2 } },
  "Solar Beam": { noCharge: "harshSunlight" },
  "Solar Blade": { noCharge: "harshSunlight" },
  "Electroshot": { noCharge: "rain" }
};

const localize = key => game.i18n.localize(key);
const format = (key, data) => game.i18n.format(key, data);
const escape = text => foundry.utils.escapeHTML(text ?? "");
const asArray = value => value == null ? [] : Array.isArray(value) ? value : [value];
export const fieldLabel = key => localize(weathers[key] ?? terrains[key] ?? key);
export const familyOf = weather => FAMILY[weather] ?? weather;

export function fieldOf(scene) {
  const field = scene?.getFlag?.(SYSTEM_ID, FIELD_FLAG) ?? {};
  return { weather: field.weather ?? null, locked: !!field.locked, terrains: field.terrains ?? [] };
}

export function tokenOf(actor) {
  if (!actor) return null;
  if (actor.token) return actor.token;
  try {
    return actor.getActiveTokens?.(false, true)?.[0] ?? null;
  } catch {
    return null;
  }
}

export function weatherFor(actor) {
  const weather = fieldOf(tokenOf(actor)?.parent).weather;
  if (!weather) return null;
  const ignored = getRules(actor, "ignoreWeather").some(rule => !rule.weathers || asArray(rule.weathers).some(key => key === weather || key === familyOf(weather)));
  return ignored ? null : weather;
}

export function weatherIs(actor, wanted) {
  const weather = weatherFor(actor);
  if (!weather) return false;
  return asArray(wanted).some(key => key === "any" || key === weather || key === familyOf(weather));
}

export function isGrounded(actor) {
  if ([actor?.system?.type1, actor?.system?.type2].includes("flying") || actor?.statuses?.has("levitating")) return false;
  return !getRules(actor, "typeImmunity").some(rule => rule.moveType === "ground");
}

export function terrainAt(token) {
  const list = fieldOf(token?.parent).terrains;
  if (!list.length) return null;
  const room = roomOfToken(token)?.id ?? null;
  return list.find(entry => entry.room && entry.room === room) ?? list.find(entry => !entry.room) ?? null;
}

export function terrainFor(actor) {
  const token = tokenOf(actor);
  if (!token || !isGrounded(actor)) return null;
  return terrainAt(token)?.terrain ?? null;
}

export function fieldMatches(actor, rule) {
  if (rule.whenWeather && !weatherIs(actor, rule.whenWeather)) return false;
  if (rule.whenTerrain && !asArray(rule.whenTerrain).includes(terrainFor(actor))) return false;
  return true;
}

// The weather, if it hurts or hinders this Pokémon.
export function harshWeatherFor(actor) {
  const weather = weatherFor(actor);
  if (!weather) return null;
  const types = [actor.system?.type1, actor.system?.type2];
  if ((SHELTERED_TYPES[weather] ?? []).some(type => types.includes(type))) return null;
  if (weather === "sandstorm" && hasRule(actor, "magicGuard")) return null;
  if (getRules(actor, "weatherImmunity").some(rule => !rule.weathers || asArray(rule.weathers).includes(weather))) return null;
  return weather;
}

export const awarenessHindered = actor => harshWeatherFor(actor) in VISIBILITY_PENALTY;
export const visibilityPenalty = actor => VISIBILITY_PENALTY[harshWeatherFor(actor)] ?? 0;
export const movementPenalty = actor => harshWeatherFor(actor) === "snowstorm" ? 1 : 0;

export function fieldStatBonus(actor, stat) {
  const weather = weatherFor(actor);
  const types = [actor.system?.type1, actor.system?.type2];
  if (weather === "sandstorm" && stat === "spdef" && types.includes("rock")) return 6;
  if (weather === "snowstorm" && stat === "def" && types.includes("ice")) return 6;
  return 0;
}

export const statMultiplier = (actor, stat) => getRules(actor, "statMultiplier")
  .filter(rule => asArray(rule.stat).includes(stat)).reduce((product, rule) => product * (rule.multiplier ?? 2), 1);

export function fieldMoveType(actor, move, type) {
  const special = MOVES[move?.name];
  if (special?.weatherType) return WEATHER_MOVE_TYPES[familyOf(weatherFor(actor))] ?? type;
  if (special?.terrainType) return TERRAIN_MOVE_TYPES[terrainFor(actor)] ?? type;
  return type;
}

export function fieldPower(user, move, { target = null, moveType = null, isHealing = false } = {}) {
  const result = { amount: 0, multiplier: 1, sources: [], halved: [] };
  const weather = weatherFor(user);
  const family = familyOf(weather);
  const terrain = terrainFor(user);
  const special = MOVES[move.name] ?? {};
  const add = (amount, source) => {
    result.amount += amount;
    result.sources.push(source);
  };
  if (isHealing) {
    const change = weather && special.heal ? special.heal[weather] ?? special.heal[family] ?? special.heal.other ?? 0 : 0;
    if (change) add(change, fieldLabel(weather));
    return result;
  }
  if (family === "harshSunlight" || family === "rain") {
    const boosted = family === "harshSunlight" ? "fire" : "water";
    const weakened = family === "harshSunlight" ? "water" : "fire";
    if (moveType === boosted) add(1, fieldLabel(weather));
    if (moveType === weakened) {
      if (PERMANENT.has(weather)) {
        result.multiplier = 0;
        result.halved.push(fieldLabel(weather));
      }
      else add(-1, fieldLabel(weather));
    }
  }
  if (terrain && TERRAIN_BOOSTS[terrain] === moveType) add(1, fieldLabel(terrain));
  if (special.weather && weatherIs(user, special.weather)) add(1, fieldLabel(weather));
  if (special.terrain && terrain === special.terrain) add(1, fieldLabel(terrain));
  if (special.weatherType && WEATHER_MOVE_TYPES[family]) add(1, fieldLabel(weather));
  if (special.terrainType && terrain) add(1, fieldLabel(terrain));
  if (target && moveType === "dragon" && terrainFor(target) === "mistyTerrain") {
    result.multiplier *= 0.5;
    result.halved.push(fieldLabel("mistyTerrain"));
  }
  return result;
}

export function noChargeWeather(actor, move) {
  const wanted = MOVES[move?.name]?.noCharge;
  return wanted && weatherIs(actor, wanted) ? weatherFor(actor) : null;
}

// Strong Winds take away the Flying-type weaknesses.
export function fieldMatchup(target, moveType, matchup) {
  if (!target || weatherFor(target) !== "strongWinds") return matchup;
  const types = [target.system?.type1, target.system?.type2].filter(Boolean);
  const chart = typeChart[moveType];
  if (!chart || !types.includes("flying") || !chart.se.includes("flying")) return matchup;
  let result = 3;
  for (const type of types) {
    if (chart.immune.includes(type)) return matchup;
    if (chart.se.includes(type) && type !== "flying") result++;
    else if (chart.nve.includes(type)) result--;
  }
  return MATCHUPS[result];
}

export function priorityBlocked(user, target, move) {
  return !!target && target !== user && !!move.system.hasTag?.('priority') && terrainFor(target) === "psychicTerrain";
}

export function fieldBlocksCondition(actor, condition) {
  const weather = weatherFor(actor);
  if (condition === "frozen" && familyOf(weather) === "harshSunlight") return weather;
  if (condition === "burned" && familyOf(weather) === "rain") return weather;
  const terrain = terrainFor(actor);
  if (terrain === "electricTerrain" && (condition === "asleep" || condition === "yawning")) return terrain;
  if (terrain === "mistyTerrain" && AFFLICTIONS.has(condition)) return terrain;
  return null;
}

async function announce(lines, speaker = null) {
  lines = lines.filter(Boolean);
  if (!lines.length) return;
  await foundry.documents.ChatMessage.implementation.create({
    speaker: speaker ?? { alias: localize("SYSTEM.Field.Title") },
    content: lines.map(line => `<p>${line}</p>`).join("")
  });
}

function sceneWeatherUpdate(scene, weather) {
  const wanted = SCENE_WEATHER[weather] ?? "";
  const ours = Object.values(SCENE_WEATHER);
  if (wanted && !CONFIG.weatherEffects?.[wanted]) return {};
  if (!wanted && !ours.includes(scene.weather)) return {};
  return scene.weather === wanted ? {} : { weather: wanted };
}

export const newField = weather => ({ weather: weather || null, locked: false, terrains: [] });
export const weatherVisual = weather => CONFIG.weatherEffects?.[SCENE_WEATHER[weather]] ? SCENE_WEATHER[weather] : "";

async function applyFieldChange(scene, change) {
  const field = fieldOf(scene);
  const lines = [];
  let changed = false;
  if ("weather" in change) {
    const weather = change.weather === "clearWeather" ? null : change.weather;
    if (!change.force && field.weather !== weather && (field.locked || PERMANENT.has(field.weather))) {
      lines.push(field.weather ? format("SYSTEM.Field.WeatherUnchangeable", { weather: fieldLabel(field.weather) }) : localize("SYSTEM.Field.WeatherLocked"));
    }
    else {
      if (field.weather !== weather) lines.push(weather ? format("SYSTEM.Field.WeatherSet", { weather: fieldLabel(weather) }) : localize("SYSTEM.Field.WeatherCleared"));
      field.weather = weather;
      if ("locked" in change) field.locked = !!change.locked;
      changed = true;
    }
  }
  if ("terrain" in change) {
    const room = change.room ?? null;
    const terrain = change.terrain === "clearTerrain" ? null : change.terrain;
    const removed = field.terrains.filter(entry => !room || entry.room === room);
    field.terrains = field.terrains.filter(entry => room && entry.room !== room);
    if (terrain) {
      field.terrains.push({ terrain, room, rounds: change.rounds ?? null });
      lines.push(format(change.rounds ? "SYSTEM.Field.TerrainSetRounds" : "SYSTEM.Field.TerrainSet", { terrain: fieldLabel(terrain), rounds: change.rounds }));
    }
    else if (removed.length) lines.push(format("SYSTEM.Field.TerrainCleared", { terrain: removed.map(entry => fieldLabel(entry.terrain)).join(", ") }));
    else lines.push(localize("SYSTEM.Field.NoTerrain"));
    changed = true;
  }
  if (changed) await scene.update({ [`flags.${SYSTEM_ID}.${FIELD_FLAG}`]: field, ...sceneWeatherUpdate(scene, field.weather) });
  await announce(lines);
  return changed;
}

export async function changeField(scene, change) {
  if (!scene) return false;
  if (game.user.isGM) return applyFieldChange(scene, change);
  return !!await requestFromGM(FIELD_ACTION, { sceneUuid: scene.uuid, change });
}

const terrainRounds = actor => Math.max(TERRAIN_ROUNDS, ...getRules(actor, "terrainRounds").map(rule => rule.rounds ?? TERRAIN_ROUNDS));

export async function applyFieldEffect(actor, effect, { locked, rounds = null, fromMove = false } = {}) {
  const token = tokenOf(actor);
  const scene = token?.parent ?? canvas?.scene;
  if (weathers[effect]) return changeField(scene, { weather: effect, ...(locked === undefined ? {} : { locked }) });
  if (!terrains[effect]) return false;
  const room = token ? roomOfToken(token)?.id ?? null : null;
  return changeField(scene, { terrain: effect, room, rounds: effect === "clearTerrain" ? null : rounds ?? (fromMove ? terrainRounds(actor) : TERRAIN_ROUNDS) });
}

export const isFieldEffect = effect => !!(weathers[effect] || terrains[effect]);

async function rollOff(claims) {
  let contenders = claims;
  for (let attempt = 0; attempt < TIE_REROLLS && contenders.length > 1; attempt++) {
    const results = [];
    for (const claim of contenders) results.push({ claim, total: (await new foundry.dice.Roll("2d6").evaluate()).total });
    await announce([format("SYSTEM.Field.TieRolled", {
      results: results.map(({ claim, total }) => `${escape(claim.actor.name)} (${fieldLabel(claim.value)}): ${total}`).join(", ")
    })]);
    const best = Math.max(...results.map(result => result.total));
    contenders = results.filter(result => result.total === best).map(result => result.claim);
  }
  return contenders[0];
}

export async function startBattleField(combatants) {
  const groups = new Map();
  for (const combatant of combatants) {
    const actor = combatant.actor;
    if (!actor || combatant.isDefeated) continue;
    for (const rule of getRules(actor, "onBattleStart")) {
      const token = combatant.token ?? tokenOf(actor);
      const kind = rule.weather ? "weather" : rule.terrain ? "terrain" : null;
      if (!kind || !token) continue;
      const room = kind === "terrain" ? roomOfToken(token)?.id ?? null : null;
      const key = `${token.parent.id}.${kind}.${room}`;
      (groups.get(key) ?? groups.set(key, []).get(key)).push({ actor, scene: token.parent, kind, room, value: rule[kind], source: rule.source });
    }
  }
  for (const claims of groups.values()) {
    const winner = new Set(claims.map(claim => claim.value)).size > 1 ? await rollOff(claims) : claims[0];
    await announce([format("SYSTEM.Automation.FeatureTriggered", { name: escape(winner.actor.name), feature: escape(winner.source) })],
      foundry.documents.ChatMessage.implementation.getSpeaker({ actor: winner.actor }));
    if (winner.kind === "weather") await changeField(winner.scene, { weather: winner.value });
    else await changeField(winner.scene, { terrain: winner.value, room: winner.room, rounds: TERRAIN_ROUNDS });
  }
}

export async function tickTerrains(scene) {
  const field = fieldOf(scene);
  if (!field.terrains.some(entry => typeof entry.rounds === "number")) return;
  const ended = [];
  field.terrains = field.terrains.flatMap(entry => {
    if (typeof entry.rounds !== "number") return [entry];
    if (entry.rounds <= 1) {
      ended.push(entry);
      return [];
    }
    return [{ ...entry, rounds: entry.rounds - 1 }];
  });
  await scene.update({ [`flags.${SYSTEM_ID}.${FIELD_FLAG}`]: field });
  await announce(ended.map(entry => format("SYSTEM.Field.TerrainEnded", { terrain: fieldLabel(entry.terrain) })));
}

export async function openFieldDialog(scene = canvas?.scene) {
  if (!scene) return false;
  const field = fieldOf(scene);
  const option = (value, label, selected) => `<option value="${value}" ${selected ? "selected" : ""}>${escape(label)}</option>`;
  const weatherOptions = [option("", localize("SYSTEM.Weathers.ClearWeather"), !field.weather),
    ...Object.keys(weathers).filter(key => key !== "clearWeather").map(key => option(key, fieldLabel(key), field.weather === key))].join("");
  const terrainOptions = [option("keep", localize("SYSTEM.Field.Keep"), true), option("clearTerrain", localize("SYSTEM.Terrains.ClearTerrain"), false),
    ...Object.keys(terrains).filter(key => key !== "clearTerrain").map(key => option(key, fieldLabel(key), false))].join("");
  const token = canvas?.tokens?.controlled[0]?.document;
  const room = token ? roomOfToken(token) : null;
  const current = field.terrains.map(entry => {
    const where = entry.room ? scene.regions.get(entry.room)?.name ?? "?" : localize("SYSTEM.Field.WholeFloor");
    return `<li>${fieldLabel(entry.terrain)} (${escape(where)}${typeof entry.rounds === "number" ? `, ${format("SYSTEM.Field.RoundsLeft", { rounds: entry.rounds })}` : ""})</li>`;
  }).join("");
  const content = `
    <div class="form-group"><label>${localize("SYSTEM.Field.Weather")}</label><div class="form-fields"><select name="weather">${weatherOptions}</select></div></div>
    <div class="form-group"><label>${localize("SYSTEM.Field.Locked")}</label><div class="form-fields"><input type="checkbox" name="locked" ${field.locked ? "checked" : ""}></div></div>
    <div class="form-group"><label>${localize("SYSTEM.Field.Terrain")}</label><div class="form-fields"><select name="terrain">${terrainOptions}</select></div></div>
    <div class="form-group"><label>${localize("SYSTEM.Field.Where")}</label><div class="form-fields"><select name="where">
      ${option("", localize("SYSTEM.Field.WholeFloor"), !room)}${room ? option(room.id, format("SYSTEM.Field.Room", { room: room.name }), true) : ""}
    </select></div></div>
    <div class="form-group"><label>${localize("SYSTEM.Field.Rounds")}</label><div class="form-fields"><input type="number" name="rounds" min="1" placeholder="∞"></div></div>
    ${current ? `<p>${localize("SYSTEM.Field.Current")}</p><ul>${current}</ul>` : ""}`;
  const data = await foundry.applications.api.DialogV2.prompt({
    window: { title: "SYSTEM.Field.Title" },
    content,
    ok: { label: "SYSTEM.Field.Apply", callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object },
    rejectClose: false
  });
  if (!data) return false;
  const change = {};
  if ((data.weather || null) !== field.weather || !!data.locked !== field.locked) Object.assign(change, { weather: data.weather || null, locked: !!data.locked, force: true });
  if (data.terrain !== "keep") Object.assign(change, { terrain: data.terrain, room: data.where || null, rounds: Number(data.rounds) || null });
  return Object.keys(change).length ? changeField(scene, change) : false;
}

function renderIndicator() {
  const scene = canvas?.scene;
  if (!scene) return setHudItem("explorers-field", null);
  const field = fieldOf(scene);
  const parts = [];
  if (field.weather) parts.push(`<span><i class="fa-solid ${ICONS[field.weather]}"></i> ${fieldLabel(field.weather)}${field.locked ? ` <i class="fa-solid fa-lock"></i>` : ""}</span>`);
  for (const entry of field.terrains) {
    const where = entry.room ? scene.regions.get(entry.room)?.name : null;
    const rounds = typeof entry.rounds === "number" ? ` (${entry.rounds})` : "";
    parts.push(`<span><i class="fa-solid ${ICONS[entry.terrain]}"></i> ${fieldLabel(entry.terrain)}${where ? `: ${escape(where)}` : ""}${rounds}</span>`);
  }
  setHudItem("explorers-field", parts.join(""), { order: 1 });
}

function refreshActors(scene) {
  for (const token of scene.tokens) {
    const actor = token.actor;
    if (!actor) continue;
    actor.reset();
    if (actor.sheet?.rendered) actor.sheet.render();
  }
}

function onGetSceneControlButtons(controls) {
  if (!game.user.isGM || !controls.tokens) return;
  controls.tokens.tools.explorersField = {
    name: "explorersField",
    title: "SYSTEM.Field.Title",
    icon: "fa-solid fa-cloud-sun-rain",
    order: Object.keys(controls.tokens.tools).length,
    button: true,
    onChange: () => openFieldDialog()
  };
}

export function registerFieldHooks() {
  registerSocketHandler(FIELD_ACTION, async ({ sceneUuid, change }) => {
    const scene = await fromUuid(sceneUuid);
    return scene ? applyFieldChange(scene, change) : false;
  });
  Hooks.on("getSceneControlButtons", onGetSceneControlButtons);
  Hooks.on("canvasReady", () => {
    refreshActors(canvas.scene);
    renderIndicator();
  });
  Hooks.on("updateScene", (scene, changes) => {
    if (!foundry.utils.hasProperty(changes, `flags.${SYSTEM_ID}.${FIELD_FLAG}`)) return;
    refreshActors(scene);
    if (scene !== canvas?.scene) return;
    renderIndicator();
    canvas.perception.update({ initializeVision: true });
  });
  Hooks.on("moveToken", tokenDocument => {
    if (!fieldOf(tokenDocument.parent).terrains.length) return;
    tokenDocument.actor?.reset();
    if (tokenDocument.actor?.sheet?.rendered) tokenDocument.actor.sheet.render();
  });
}
