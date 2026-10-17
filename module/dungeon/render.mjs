import { TERRAIN, terrainAt } from "./floor.mjs";
import { NEIGHBOURS, pickTile } from "./tileset.mjs";

const FLAT_COLORS = { [TERRAIN.WALL]: [46, 52, 64, 255], [TERRAIN.GROUND]: [196, 178, 140, 255], [TERRAIN.LIQUID]: [72, 128, 200, 255] };
const FLAT_SIZE = 24;

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
