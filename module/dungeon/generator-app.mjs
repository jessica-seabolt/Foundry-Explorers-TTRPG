// The GM's "Generate Dungeon Floor" window: generates a floor, previews it with a tileset, and builds a Scene
// with the map image, walls, Room regions and markers.

import { SYSTEM_ID, filePath } from '../../constants.mjs';
import { floorItemTileData } from '../floor-items.mjs';
import { ROOM_BEHAVIOR } from '../rooms.mjs';
import { FLOOR_LAYOUTS, cropBounds, generateFloor, markersIn, normalizeSettings, roomShapes, wallSegments } from './floor.mjs';
import { renderFloor } from './render.mjs';
import { readObjectSheet } from './objects.mjs';
import { parseTileset } from './tileset.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export const GENERATOR_SETTING = "dungeonGenerator";
const UPLOAD_FOLDER = "dungeons";
const SCALES = [3, 4, 5];

/** Scene markers: which option includes them, their icon, and whether players can see them. */
const MARKERS = {
  stairs: { group: "stairs", icon: "icons/svg/down.svg", tint: "#ffffff", size: 0.8, hidden: false },
  hiddenStairs: { group: "stairs", icon: "icons/svg/door-secret-outline.svg", tint: "#c8a2ff", size: 0.6, hidden: true },
  item: { group: "items", icon: "icons/svg/item-bag.svg", tint: "#ffd84a", size: 0.6, hidden: true },
  buriedItem: { group: "items", icon: "icons/svg/chest.svg", tint: "#c9a36b", size: 0.6, hidden: true },
  trap: { group: "traps", icon: "icons/svg/trap.svg", tint: "#ff5a5a", size: 0.6, hidden: true },
  pokemon: { group: "pokemon", icon: "icons/svg/pawprint.svg", tint: "#ff9f40", size: 0.6, hidden: true },
  start: { group: "pokemon", icon: "icons/svg/wingfoot.svg", tint: "#7fd4ff", size: 0.6, hidden: true }
};
const MARKER_GROUPS = ["stairs", "items", "traps", "pokemon"];

const STAIRS_SPRITES = { down: "stairsDown", up: "stairsUp" };

/** The system's default table of items found lying around dungeons. */
export const DUNGEON_ITEMS_TABLE = "Compendium.explorers.tables.RollTable.DungeonItemsTbl1";

const DEFAULT_CONFIG = {
  name: "", tileset: "", objects: "", stairs: "down", scale: 3, itemTable: DUNGEON_ITEMS_TABLE,
  markers: { stairs: true, items: true, traps: true, pokemon: true }, settings: {}
};

/** The generator's last-used options, kept per GM. */
export function registerDungeonGeneratorSettings() {
  game.settings.register(SYSTEM_ID, GENERATOR_SETTING, { scope: "client", config: false, type: Object, default: DEFAULT_CONFIG });
}

/** Adds the button to the Scenes sidebar. */
export function addDungeonGeneratorButton(app, html) {
  if (!game.user.isGM) return;
  const element = html instanceof HTMLElement ? html : html[0];
  const actions = element.querySelector(".header-actions");
  if (!actions || actions.querySelector("[data-action=generateDungeon]")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.action = "generateDungeon";
  button.innerHTML = `<i class="fa-solid fa-dungeon"></i> ${game.i18n.localize("SYSTEM.Dungeon.Generate")}`;
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    DungeonGenerator.open();
  });
  actions.append(button);
}

const sheetCache = new Map();

/** Loads a sheet and reads it with a parser (cached by path and parser). */
async function loadSheet(src, parse) {
  const key = `${parse.name}:${src}`;
  if (!sheetCache.has(key)) {
    sheetCache.set(key, (async () => {
      const element = await loadImage(src);
      const surface = document.createElement("canvas");
      surface.width = element.width;
      surface.height = element.height;
      const context = surface.getContext("2d", { willReadFrequently: true });
      context.drawImage(element, 0, 0);
      return parse(context.getImageData(0, 0, surface.width, surface.height));
    })());
  }
  try {
    return await sheetCache.get(key);
  } catch (error) {
    sheetCache.delete(key);
    throw error;
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Couldn't load ${src}`));
    image.src = src;
  });
}

/** Draws raw pixels onto a canvas, scaled up without smoothing so pixel art stays crisp. */
function toCanvas(rendered, scale = 1) {
  const native = document.createElement("canvas");
  native.width = rendered.width;
  native.height = rendered.height;
  native.getContext("2d").putImageData(new ImageData(rendered.data, rendered.width, rendered.height), 0, 0);
  if (scale === 1) return native;
  const surface = document.createElement("canvas");
  surface.width = rendered.width * scale;
  surface.height = rendered.height * scale;
  const context = surface.getContext("2d");
  context.imageSmoothingEnabled = false;
  context.drawImage(native, 0, 0, surface.width, surface.height);
  return surface;
}

export class DungeonGenerator extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "explorers-dungeon-generator",
    tag: "form",
    classes: ["explorers-dungeon"],
    window: { title: "SYSTEM.Dungeon.Title", icon: "fa-solid fa-dungeon", resizable: true },
    position: { width: 900, height: 680 },
    form: { handler: DungeonGenerator.#onChange, submitOnChange: true, closeOnSubmit: false },
    actions: {
      reroll: DungeonGenerator.#onReroll,
      importSettings: DungeonGenerator.#onImport,
      resetSettings: DungeonGenerator.#onReset,
      createScene: DungeonGenerator.#onCreateScene
    }
  };

  static PARTS = {
    options: { template: filePath("templates/dungeon/options.hbs"), scrollable: [""] },
    preview: { template: filePath("templates/dungeon/preview.hbs") }
  };

  static open() {
    const existing = foundry.applications.instances.get(this.DEFAULT_OPTIONS.id);
    if (existing) return existing.render({ force: true });
    return new this().render({ force: true });
  }

  constructor(options) {
    super(options);
    const saved = game.settings.get(SYSTEM_ID, GENERATOR_SETTING);
    this.config = foundry.utils.mergeObject(foundry.utils.deepClone(DEFAULT_CONFIG), saved, { inplace: false });
    this.config.settings = normalizeSettings(this.config.settings);
    this.config.name ||= game.i18n.localize("SYSTEM.Dungeon.DefaultName");
    this.tileset = null;
    this.loadedTileset = "";
    this.tilesetError = null;
    this.objects = null;
    this.loadedObjects = "";
    this.objectsError = null;
    this.busy = false;
    this.#generate();
  }

  /** A new floor from the current settings. */
  #generate() {
    this.floor = generateFloor(this.config.settings);
    this.bounds = cropBounds(this.floor);
    this.#draw();
  }

  /** Draws the floor with the current tileset (alternate tiles are picked again each time). */
  #draw() {
    this.mapImage = renderFloor(this.floor, this.bounds, this.tileset);
  }

  /** Loads the chosen tileset, if it changed, and redraws the floor with it. */
  async #loadTileset() {
    if (this.loadedTileset === this.config.tileset) return;
    this.loadedTileset = this.config.tileset;
    this.tileset = null;
    this.tilesetError = null;
    this.#draw();
    if (!this.config.tileset) return;
    try {
      this.tileset = await loadSheet(this.config.tileset, parseTileset);
      this.#draw();
    } catch (error) {
      console.error(error);
      this.tilesetError = game.i18n.format("SYSTEM.Dungeon.TilesetError", { error: error.message });
    }
  }

  /** Loads the chosen object sheet (for the stairs), if it changed. */
  async #loadObjects() {
    if (this.loadedObjects === this.config.objects) return;
    this.loadedObjects = this.config.objects;
    this.objects = null;
    this.objectsError = null;
    if (!this.config.objects) return;
    try {
      this.objects = await loadSheet(this.config.objects, readObjectSheet);
    } catch (error) {
      console.error(error);
      this.objectsError = game.i18n.format("SYSTEM.Dungeon.ObjectsError", { error: error.message });
    }
  }

  /** The stairs sprite to draw, if an object sheet is loaded. */
  get stairsSprite() {
    if (!this.objects) return null;
    const name = STAIRS_SPRITES[this.config.stairs] ?? STAIRS_SPRITES.down;
    return { name, width: this.objects.size, height: this.objects.size, data: this.objects.sprites[name] };
  }

  async _prepareContext(options) {
    await this.#loadTileset();
    await this.#loadObjects();
    const props = this.config.settings.floor_props;
    const markers = markersIn(this.floor, this.bounds);
    const count = group => markers.filter(marker => MARKERS[marker.type].group === group).length;
    const tileSize = this.mapImage.tileSize;
    return {
      config: this.config,
      props,
      layouts: Object.entries(FLOOR_LAYOUTS).map(([value, key]) => ({ value: Number(value), label: `SYSTEM.Dungeon.Layouts.${key}` })),
      scales: SCALES.map(scale => ({ value: scale, label: game.i18n.format("SYSTEM.Dungeon.ScaleOption", { pixels: tileSize * scale }) })),
      markerGroups: MARKER_GROUPS.map(group => ({
        group, label: `SYSTEM.Dungeon.Markers.${group}`, checked: this.config.markers[group], count: count(group),
        color: Object.values(MARKERS).find(style => style.group === group).tint
      })),
      tilesetError: this.tilesetError,
      noTileset: !this.config.tileset,
      objectsError: this.objectsError,
      noObjects: !this.config.objects,
      stairsDirections: Object.keys(STAIRS_SPRITES).map(value => ({ value, label: `SYSTEM.Dungeon.Stairs.${value}` })),
      itemTables: [
        ...game.tables.map(table => ({ value: table.uuid, label: table.name })),
        ...game.packs.filter(pack => pack.documentName === "RollTable").flatMap(pack =>
          pack.index.map(entry => ({ value: `Compendium.${pack.collection}.RollTable.${entry._id}`, label: `${entry.name} (${pack.title})` })))
      ],
      summary: game.i18n.format("SYSTEM.Dungeon.Summary", {
        width: this.bounds.width, height: this.bounds.height, rooms: roomShapes(this.floor, this.bounds).length
      }),
      busy: this.busy
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const preview = this.element.querySelector("canvas.dungeon-preview");
    if (preview) this.#drawPreview(preview);
    const input = this.element.querySelector("input.dungeon-import");
    if (input && !input.dataset.bound) {
      input.dataset.bound = "true";
      input.addEventListener("change", event => this.#importFile(event.target.files?.[0]));
    }
  }

  /** The map, with the markers the Scene would get. */
  #drawPreview(preview) {
    const { width, height, data, tileSize } = this.mapImage;
    preview.width = width;
    preview.height = height;
    const context = preview.getContext("2d");
    context.putImageData(new ImageData(data, width, height), 0, 0);
    const stairs = this.stairsSprite ? toCanvas(this.stairsSprite) : null;
    for (const marker of markersIn(this.floor, this.bounds)) {
      const style = MARKERS[marker.type];
      if (!this.config.markers[style.group]) continue;
      if (marker.type === "stairs" && stairs) {
        context.drawImage(stairs, marker.x * tileSize, marker.y * tileSize, tileSize, tileSize);
        continue;
      }
      const inset = tileSize * (1 - style.size / 1.5) / 2;
      context.fillStyle = style.tint;
      context.strokeStyle = "#000000";
      context.lineWidth = 2;
      context.beginPath();
      context.arc((marker.x + 0.5) * tileSize, (marker.y + 0.5) * tileSize, tileSize / 2 - inset, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    }
  }

  static async #onChange(event, form, formData) {
    // Ignore cleared number fields rather than passing nulls to the generator
    const data = foundry.utils.expandObject(Object.fromEntries(Object.entries(formData.object).filter(([, value]) => value !== null)));
    const before = JSON.stringify(this.config.settings.floor_props);
    const sheetsChanged = (data.tileset ?? "") !== this.config.tileset || (data.objects ?? "") !== this.config.objects;
    this.config.name = data.name ?? this.config.name;
    this.config.tileset = data.tileset ?? "";
    this.config.objects = data.objects ?? "";
    this.config.stairs = data.stairs ?? this.config.stairs;
    this.config.itemTable = data.itemTable ?? "";
    this.config.scale = Number(data.scale) || 3;
    this.config.markers = { ...this.config.markers, ...data.markers };
    foundry.utils.mergeObject(this.config.settings.floor_props, data.props ?? {});
    await game.settings.set(SYSTEM_ID, GENERATOR_SETTING, this.config);

    if (JSON.stringify(this.config.settings.floor_props) !== before) this.#generate();
    // Re-render only the preview (so typing in the options keeps focus) unless a sheet's message changed
    await this.render({ parts: sheetsChanged ? ["options", "preview"] : ["preview"] });
  }

  static #onReroll() {
    this.#generate();
    this.render({ parts: ["preview"] });
  }

  static #onImport() {
    this.element.querySelector("input.dungeon-import")?.click();
  }

  /** Imports a settings file exported from Pokemon Dungeoneer. */
  async #importFile(file) {
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      if (!imported?.floor_props) throw new Error(game.i18n.localize("SYSTEM.Dungeon.NotSettingsFile"));
      this.config.settings = normalizeSettings(imported);
      await game.settings.set(SYSTEM_ID, GENERATOR_SETTING, this.config);
      ui.notifications.info(game.i18n.format("SYSTEM.Dungeon.Imported", { name: file.name }));
      this.#generate();
      this.render();
    } catch (error) {
      ui.notifications.error(game.i18n.format("SYSTEM.Dungeon.ImportError", { error: error.message }));
    }
  }

  static async #onReset() {
    this.config.settings = normalizeSettings({});
    await game.settings.set(SYSTEM_ID, GENERATOR_SETTING, this.config);
    this.#generate();
    this.render();
  }

  static async #onCreateScene() {
    if (this.busy) return;
    if (!this.tileset && !(await foundry.applications.api.DialogV2.confirm({
      window: { title: "SYSTEM.Dungeon.Title" },
      content: `<p>${game.i18n.localize("SYSTEM.Dungeon.NoTilesetConfirm")}</p>`
    }))) return;
    this.busy = true;
    this.render({ parts: ["preview"] });
    try {
      const scene = await buildScene({
        name: this.config.name, floor: this.floor, bounds: this.bounds, rendered: this.mapImage, stairs: this.stairsSprite,
        scale: this.config.scale, markers: this.config.markers, settings: this.config.settings, tileset: this.config.tileset,
        itemTable: this.config.itemTable
      });
      ui.notifications.info(game.i18n.format("SYSTEM.Dungeon.Created", { name: scene.name }));
      await scene.view();
    } catch (error) {
      console.error(error);
      ui.notifications.error(game.i18n.format("SYSTEM.Dungeon.CreateError", { error: error.message }));
    } finally {
      this.busy = false;
      this.render({ parts: ["preview"] });
    }
  }
}

/** Uploads a canvas as a PNG into the world's dungeon folder, returning its path. */
async function uploadPng(surface, fileName) {
  const FilePicker = foundry.applications.apps.FilePicker.implementation;
  const blob = await new Promise(resolve => surface.toBlob(resolve, "image/png"));
  if (!blob) throw new Error(`${fileName} couldn't be encoded.`);
  const folder = `worlds/${game.world.id}/${UPLOAD_FOLDER}`;
  try {
    await FilePicker.browse("data", folder);
  } catch {
    await FilePicker.createDirectory("data", folder);
  }
  const response = await FilePicker.upload("data", folder, new File([blob], fileName, { type: "image/png" }), {}, { notify: false });
  if (!response?.path) throw new Error(`${fileName} couldn't be uploaded.`);
  return response.path;
}

/** Uploads the map into the world's folder and creates its Scene. */
export async function buildScene({ name, floor, bounds, rendered, stairs, scale, markers, settings, tileset, itemTable }) {
  const gridSize = rendered.tileSize * scale;
  const mapPath = await uploadPng(toCanvas(rendered, scale), `${name.slugify({ strict: true }) || "floor"}-${Date.now()}.png`);
  // The stairs sprite, scaled up as crisply as the map; shared by every floor with the same stairs and grid size
  const stairsPath = stairs && markers.stairs
    ? await uploadPng(toCanvas(stairs, gridSize / stairs.width), `${stairs.name.slugify()}-${gridSize}px.png`)
    : null;

  const walls = wallSegments(floor, bounds).map(([x0, y0, x1, y1]) => ({ c: [x0, y0, x1, y1].map(value => value * gridSize) }));

  const regions = roomShapes(floor, bounds).map((room, i) => ({
    name: game.i18n.format(room.monsterHouse ? "SYSTEM.Dungeon.MonsterHouse" : room.kecleonShop ? "SYSTEM.Dungeon.KecleonShop" : "SYSTEM.Dungeon.RoomName", { number: i + 1 }),
    color: room.monsterHouse ? "#d0453a" : room.kecleonShop ? "#3aa655" : "#4a7fd0",
    shapes: room.rects.map(rect => ({
      type: "rectangle", x: rect.x * gridSize, y: rect.y * gridSize, width: rect.width * gridSize, height: rect.height * gridSize, rotation: 0, hole: false
    })),
    behaviors: [{ type: ROOM_BEHAVIOR }]
  }));

  const placed = markersIn(floor, bounds);
  // Item spots get real items from the item table; buried items stay hidden markers
  const table = markers.items && itemTable ? await fromUuid(itemTable) : null;
  const floorItems = [];
  if (table) {
    for (const marker of placed.filter(marker => marker.type === "item")) {
      const { results } = await table.roll();
      const result = results.find(result => result.documentUuid);
      const item = result ? await fromUuid(result.documentUuid) : null;
      if (item?.type !== "Item") continue;
      const center = { x: (marker.x + 0.5) * gridSize, y: (marker.y + 0.5) * gridSize };
      floorItems.push(floorItemTileData(item.toObject(), center, gridSize, { forSale: marker.shop }));
      marker.placed = true;
    }
  }
  const tiles = placed.filter(marker => markers[MARKERS[marker.type].group] && !marker.placed).map(marker => {
    const style = MARKERS[marker.type];
    if (marker.type === "stairs" && stairsPath) {
      return {
        texture: { src: stairsPath }, x: marker.x * gridSize, y: marker.y * gridSize, width: gridSize, height: gridSize,
        hidden: false, locked: true, flags: { [SYSTEM_ID]: { dungeonMarker: marker.type } }
      };
    }
    const size = gridSize * style.size;
    return {
      texture: { src: style.icon, tint: style.tint },
      x: (marker.x + 0.5) * gridSize - size / 2, y: (marker.y + 0.5) * gridSize - size / 2,
      width: size, height: size, hidden: style.hidden, locked: true,
      flags: { [SYSTEM_ID]: { dungeonMarker: marker.type } }
    };
  });

  const start = placed.find(marker => marker.type === "start");
  return Scene.create({
    name,
    width: bounds.width * gridSize,
    height: bounds.height * gridSize,
    padding: 0,
    backgroundColor: "#000000",
    background: { src: mapPath },
    grid: { type: CONST.GRID_TYPES.SQUARE, size: gridSize },
    tokenVision: true,
    fog: { exploration: true },
    environment: { globalLight: { enabled: true } },
    ...(start ? { initial: { x: (start.x + 0.5) * gridSize, y: (start.y + 0.5) * gridSize, scale: 1 } } : {}),
    walls, regions, tiles: [...tiles, ...floorItems],
    flags: { [SYSTEM_ID]: { dungeon: { settings, tileset } } }
  });
}
