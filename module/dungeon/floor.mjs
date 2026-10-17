import { GenerateDungeon } from "../../lib/dungeon-mystery/dungeon-mystery.mjs";

export const TERRAIN = { WALL: 0, GROUND: 1, LIQUID: 2 };
export const NO_ROOM = 0xFF;
const MAP_WIDTH = 56;
const MAP_HEIGHT = 32;

export const FLOOR_LAYOUTS = {
  0: "Large", 1: "Small", 2: "OneRoomMonsterHouse", 3: "OuterRing", 4: "Crossroads", 5: "TwoRoomsWithMonsterHouse",
  6: "Line", 7: "Cross", 8: "LargeNo6x4", 9: "Beetle", 10: "OuterRooms", 11: "Medium"
};

export function defaultSettings() {
  return {
    floor_props: {
      layout: 0, room_density: 6, item_density: 5, buried_item_density: 10, enemy_density: 10, trap_density: 5,
      floor_connectivity: 15, num_extra_hallways: 10, kecleon_shop_chance: 20, monster_house_chance: 20,
      itemless_monster_house_chance: 0, maze_room_chance: 0, allow_dead_ends: false,
      room_flags: { f_room_imperfections: false, f_secondary_terrain_generation: true },
      secondary_terrain_density: 5, secondary_structures_budget: 0, floor_number: 1, fixed_room_id: 0,
      hidden_stairs_type: 0, hidden_stairs_spawn_chance: 0
    },
    dungeon_data: {
      id: 0, floor: 1, n_floors_plus_one: 5, rescue_floor: 0, nonstory_flag: true,
      mission_destination: { is_destination_floor: false, mission_type: 0, mission_subtype: 0 },
      dungeon_objective: 1, guaranteed_item_id: 0, num_items: 0,
      kecleon_shop_min_x: 0, kecleon_shop_min_y: 0, kecleon_shop_max_x: 0, kecleon_shop_max_y: 0
    },
    generation_constants: {
      merge_rooms_chance: 5, no_imperfections_chance: 60, secondary_structure_flag_chance: 80,
      max_number_monster_house_item_spawns: 7, max_number_monster_house_enemy_spawns: 30,
      first_dungeon_id_allow_monster_house_traps: 28
    },
    advanced_generation_settings: {
      allow_wall_maze_room_generation: false, fix_dead_end_validation_error: false, fix_generate_outer_rooms_floor_error: false
    }
  };
}

export function normalizeSettings(settings = {}) {
  const defaults = defaultSettings();
  const merge = (base, extra) => {
    const result = { ...base };
    for (const [key, value] of Object.entries(extra ?? {})) {
      if (!(key in base)) continue;
      result[key] = (base[key] && typeof base[key] === "object") ? merge(base[key], value) : value;
    }
    return result;
  };
  return Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, merge(value, settings[key])]));
}

export function generateFloor(settings) {
  const { floor_props, dungeon_data, generation_constants, advanced_generation_settings } = normalizeSettings(settings);
  const dungeon = {
    ...dungeon_data,
    list_tiles: Array.from({ length: MAP_WIDTH }, () => Array(MAP_HEIGHT).fill(null)),
    fixed_room_tiles: Array.from({ length: 8 }, () => Array(8).fill(null)),
    active_traps: Array(64).fill(null)
  };
  let info = null;
  const tiles = GenerateDungeon(floor_props, dungeon, generation_constants, advanced_generation_settings,
    (level, type, data, generationInfo) => { info = generationInfo; });

  const width = tiles.length;
  const height = tiles[0].length;
  const size = width * height;
  const floor = {
    width, height,
    terrain: new Uint8Array(size), room: new Uint8Array(size).fill(NO_ROOM),
    monsterHouse: new Uint8Array(size), kecleonShop: new Uint8Array(size),
    markers: [], start: null
  };
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const tile = tiles[x][y];
      const i = x + y * width;
      const type = tile.terrain_flags.terrain_type;
      floor.terrain[i] = type === 0 ? TERRAIN.WALL : type === 1 ? TERRAIN.GROUND : TERRAIN.LIQUID;
      if (type !== 0) floor.room[i] = tile.room_index;
      floor.monsterHouse[i] = tile.terrain_flags.f_in_monster_house ? 1 : 0;
      floor.kecleonShop[i] = tile.terrain_flags.f_in_kecleon_shop ? 1 : 0;
      const spawn = tile.spawn_or_visibility_flags;
      if (spawn.f_stairs) {
        const hidden = info && x === info.hidden_stairs_spawn_x && y === info.hidden_stairs_spawn_y;
        floor.markers.push({ type: hidden ? "hiddenStairs" : "stairs", x, y });
      }
      if (spawn.f_item) floor.markers.push({ type: type === 0 ? "buriedItem" : "item", x, y, shop: !!tile.terrain_flags.f_in_kecleon_shop });
      if (spawn.f_trap) floor.markers.push({ type: "trap", x, y });
      if (spawn.f_monster) floor.markers.push({ type: "pokemon", x, y });
    }
  }
  if (info && info.player_spawn_x >= 0) floor.start = { x: info.player_spawn_x, y: info.player_spawn_y };
  return floor;
}

export const terrainAt = (floor, x, y) =>
  (x < 0 || y < 0 || x >= floor.width || y >= floor.height) ? TERRAIN.WALL : floor.terrain[x + y * floor.width];

export function cropBounds(floor, margin = 2) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let y = 0; y < floor.height; y++) {
    for (let x = 0; x < floor.width; x++) {
      if (floor.terrain[x + y * floor.width] !== TERRAIN.GROUND) continue;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  if (minX === Infinity) return { x: 0, y: 0, width: floor.width, height: floor.height };
  const x = Math.max(0, minX - margin);
  const y = Math.max(0, minY - margin);
  return { x, y, width: Math.min(floor.width, maxX + margin + 1) - x, height: Math.min(floor.height, maxY + margin + 1) - y };
}

const inBounds = (bounds, x, y) => x >= bounds.x && y >= bounds.y && x < bounds.x + bounds.width && y < bounds.y + bounds.height;

export function wallSegments(floor, bounds) {
  const isWall = (x, y) => terrainAt(floor, x, y) === TERRAIN.WALL;
  const horizontal = new Map();
  const vertical = new Map();
  const add = (map, line, at) => (map.get(line) ?? map.set(line, []).get(line)).push(at);
  for (let y = bounds.y; y < bounds.y + bounds.height; y++) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
      if (isWall(x, y)) continue;
      if (isWall(x, y - 1)) add(horizontal, y, x);
      if (isWall(x, y + 1)) add(horizontal, y + 1, x);
      if (isWall(x - 1, y)) add(vertical, x, y);
      if (isWall(x + 1, y)) add(vertical, x + 1, y);
    }
  }
  const segments = [];
  const merge = (map, toSegment) => {
    for (const [line, positions] of map) {
      positions.sort((a, b) => a - b);
      let start = positions[0];
      let end = start + 1;
      for (const at of positions.slice(1)) {
        if (at === end) { end++; continue; }
        segments.push(toSegment(line, start, end));
        start = at;
        end = at + 1;
      }
      segments.push(toSegment(line, start, end));
    }
  };
  merge(horizontal, (y, x0, x1) => [x0 - bounds.x, y - bounds.y, x1 - bounds.x, y - bounds.y]);
  merge(vertical, (x, y0, y1) => [x - bounds.x, y0 - bounds.y, x - bounds.x, y1 - bounds.y]);
  return segments;
}

export function roomShapes(floor, bounds) {
  const rooms = new Map();
  for (let y = bounds.y; y < bounds.y + bounds.height; y++) {
    let x = bounds.x;
    while (x < bounds.x + bounds.width) {
      const index = floor.room[x + y * floor.width];
      if (index === NO_ROOM) { x++; continue; }
      const start = x;
      while (x < bounds.x + bounds.width && floor.room[x + y * floor.width] === index) x++;
      const room = rooms.get(index) ?? rooms.set(index, { index, monsterHouse: false, kecleonShop: false, runs: [] }).get(index);
      room.runs.push({ x: start, y, width: x - start });
      for (let i = start; i < x; i++) {
        room.monsterHouse ||= !!floor.monsterHouse[i + y * floor.width];
        room.kecleonShop ||= !!floor.kecleonShop[i + y * floor.width];
      }
    }
  }
  return [...rooms.values()].sort((a, b) => a.index - b.index).map(({ runs, ...room }) => {
    const rects = [];
    for (const run of runs) {
      const above = rects.find(rect => rect.x === run.x && rect.width === run.width && rect.y + rect.height === run.y);
      if (above) above.height++;
      else rects.push({ x: run.x, y: run.y, width: run.width, height: 1 });
    }
    return { ...room, rects: rects.map(rect => ({ ...rect, x: rect.x - bounds.x, y: rect.y - bounds.y })) };
  });
}

export function markersIn(floor, bounds) {
  const markers = floor.markers.filter(marker => inBounds(bounds, marker.x, marker.y))
    .map(marker => ({ ...marker, x: marker.x - bounds.x, y: marker.y - bounds.y }));
  if (floor.start && inBounds(bounds, floor.start.x, floor.start.y)) {
    markers.push({ type: "start", x: floor.start.x - bounds.x, y: floor.start.y - bounds.y });
  }
  return markers;
}
