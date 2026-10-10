// Draws a floor with a tileset, one sheet cell per map tile, as raw RGBA pixels.

import { TERRAIN, terrainAt } from "./floor.mjs";
import { NEIGHBOURS, pickTile } from "./tileset.mjs";

/** Plain colours for drawing a floor without a tileset. */
const FLAT_COLORS = { [TERRAIN.WALL]: [46, 52, 64, 255], [TERRAIN.GROUND]: [196, 178, 140, 255], [TERRAIN.LIQUID]: [72, 128, 200, 255] };
const FLAT_SIZE = 24;

/**
 * Which neighbours count as "the same" for each terrain. Ground treats water as ground (as the sheets say to),
 * and anything off the edge of the map is wall.
 */
const SAME = {
  [TERRAIN.WALL]: other => other === TERRAIN.WALL,
  [TERRAIN.GROUND]: other => other !== TERRAIN.WALL,
  [TERRAIN.LIQUID]: other => other === TERRAIN.LIQUID
};

export function neighbourMask(floor, x, y, terrain = terrainAt(floor, x, y)) {
  let mask = 0;
  NEIGHBOURS.forEach(([dx, dy], bit) => {
    if (SAME[terrain](terrainAt(floor, x + dx, y + dy))) mask |= 1 << bit;
  });
  return mask;
}

/**
 * @param {object} floor        From generateFloor
 * @param {object} bounds       The tiles to draw, from cropBounds
 * @param {object|null} tileset From parseTileset; null draws plain colours
 * @param {() => number} random
 * @returns {{width: number, height: number, data: Uint8ClampedArray, tileSize: number}}
 */
export function renderFloor(floor, bounds, tileset, random = Math.random) {
  const size = tileset?.size ?? FLAT_SIZE;
  const width = bounds.width * size;
  const height = bounds.height * size;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let ty = 0; ty < bounds.height; ty++) {
    for (let tx = 0; tx < bounds.width; tx++) {
      const x = bounds.x + tx;
      const y = bounds.y + ty;
      let terrain = terrainAt(floor, x, y);
      // A tileset without water draws it as ground
      if (terrain === TERRAIN.LIQUID && tileset && !tileset.liquid) terrain = TERRAIN.GROUND;
      const left = tx * size;
      const top = ty * size;
      if (!tileset) {
        const color = FLAT_COLORS[terrain];
        for (let py = 0; py < size; py++) {
          for (let px = 0; px < size; px++) data.set(color, ((left + px) + (top + py) * width) * 4);
        }
        continue;
      }
      const tiles = { [TERRAIN.WALL]: tileset.wall, [TERRAIN.GROUND]: tileset.ground, [TERRAIN.LIQUID]: tileset.liquid }[terrain];
      const tile = pickTile(tiles, neighbourMask(floor, x, y, terrain), random);
      for (let py = 0; py < size; py++) {
        data.set(tile.subarray(py * size * 4, (py + 1) * size * 4), (left + (top + py) * width) * 4);
      }
    }
  }
  return { width, height, data, tileSize: size };
}
