export const SECTION = { legend: 0, wall: 1, wallAlt1: 2, wallAlt2: 3, ground: 4, groundAlt1: 5, groundAlt2: 6, liquid: 8, sparkle: 9 };
const SECTION_COLUMNS = 3;

export const NEIGHBOURS = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
const [NW, N, NE, W, E, SW, S, SE] = NEIGHBOURS.map((_, i) => 1 << i);

const BASE_TILE_WEIGHT = 6;

// Corners only count when both sides next to them match.
export function canonicalMask(mask) {
  if ((mask & (N | W)) !== (N | W)) mask &= ~NW;
  if ((mask & (N | E)) !== (N | E)) mask &= ~NE;
  if ((mask & (S | W)) !== (S | W)) mask &= ~SW;
  if ((mask & (S | E)) !== (S | E)) mask &= ~SE;
  return mask;
}

const pixel = (image, x, y) => {
  const i = (x + y * image.width) * 4;
  return [image.data[i], image.data[i + 1], image.data[i + 2], image.data[i + 3]];
};
const sameColor = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
const luma = color => 0.299 * color[0] + 0.587 * color[1] + 0.114 * color[2];
const colorKey = color => color.join(",");

function backgroundColor(image) {
  const counts = new Map();
  const count = color => counts.set(colorKey(color), (counts.get(colorKey(color)) ?? 0) + 1);
  for (let x = 0; x < image.width; x++) { count(pixel(image, x, 0)); count(pixel(image, x, image.height - 1)); }
  for (let y = 0; y < image.height; y++) { count(pixel(image, 0, y)); count(pixel(image, image.width - 1, y)); }
  const [key] = [...counts].sort((a, b) => b[1] - a[1])[0];
  return key.split(",").map(Number);
}

export function findGrid(image, background = backgroundColor(image)) {
  const longLines = (length, across, along, at) => {
    const found = new Map();
    for (let i = 0; i < across; i++) {
      let run = 0, best = 0, bestColor = null, previous = null;
      for (let j = 0; j < along; j++) {
        const color = at(i, j);
        run = previous && sameColor(color, previous) ? run + 1 : 1;
        previous = color;
        if (run > best && !sameColor(color, background)) { best = run; bestColor = color; }
      }
      if (best >= length) {
        const key = colorKey(bestColor);
        (found.get(key) ?? found.set(key, []).get(key)).push(i);
      }
    }
    return found;
  };
  const columns = longLines(image.height * 0.4, image.width, image.height, (x, y) => pixel(image, x, y));
  const rows = longLines(image.width * 0.4, image.height, image.width, (y, x) => pixel(image, x, y));
  const lineColor = [...columns.keys()].filter(key => rows.has(key))
    .sort((a, b) => (columns.get(b).length + rows.get(b).length) - (columns.get(a).length + rows.get(a).length))[0];
  if (!lineColor) throw new Error("No cell grid found");
  const pitch = mostCommonGap(columns.get(lineColor));
  if (!pitch || pitch !== mostCommonGap(rows.get(lineColor))) throw new Error("No regular cell grid found");
  const onGrid = positions => {
    const byOffset = new Map();
    for (const position of positions) (byOffset.get(position % pitch) ?? byOffset.set(position % pitch, []).get(position % pitch)).push(position);
    const lines = [...byOffset.values()].sort((a, b) => b.length - a.length)[0];
    const first = Math.min(...lines);
    let count = 1;
    while (lines.includes(first + count * pitch)) count++;
    return { first, count };
  };
  const vertical = onGrid(columns.get(lineColor));
  const horizontal = onGrid(rows.get(lineColor));
  const last = (lines, limit, isBorder) => {
    const end = lines.first + lines.count * pitch;
    return lines.count - 1 + (end < limit && isBorder(end) ? 1 : 0);
  };
  const midY = horizontal.first + Math.floor(horizontal.count * pitch / 2);
  const midX = vertical.first + Math.floor(vertical.count * pitch / 2);
  return {
    x: vertical.first + 1, y: horizontal.first + 1, pitch, size: pitch - 1,
    columns: last(vertical, image.width, x => !sameColor(pixel(image, x, midY), background)),
    rows: last(horizontal, image.height, y => !sameColor(pixel(image, midX, y), background))
  };
}

function mostCommonGap(positions) {
  const counts = new Map();
  for (let i = 1; i < positions.length; i++) {
    const gap = positions[i] - positions[i - 1];
    if (gap > 4) counts.set(gap, (counts.get(gap) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
}

function readLegendCell(image, left, top, size, background) {
  const third = size / 3;
  const sample = (column, row) => pixel(image, Math.floor(left + third * (column + 0.5)), Math.floor(top + third * (row + 0.5)));
  if (luma(sample(1, 1)) < 200) return null;
  let mask = 0;
  let bit = 0;
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 3; column++) {
      if (row === 1 && column === 1) continue;
      const color = sample(column, row);
      if (luma(color) < 60) mask |= 1 << bit;
      else if (!sameColor(color, background)) return null;
      bit++;
    }
  }
  return mask;
}

function readCell(image, left, top, size, background) {
  const data = new Uint8ClampedArray(size * size * 4);
  let blank = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const color = pixel(image, left + x, top + y);
      if (sameColor(color, background)) blank++;
      const transparent = color[0] === 255 && color[1] === 0 && color[2] === 255;
      data.set(transparent ? [0, 0, 0, 0] : color, (x + y * size) * 4);
    }
  }
  return blank > (size * size) / 2 ? null : data;
}

export function parseTileset(image) {
  const background = backgroundColor(image);
  const grid = findGrid(image, background);
  const cellAt = (column, row) => [grid.x + column * grid.pitch, grid.y + row * grid.pitch];

  const legend = [];
  for (let row = 0; row < grid.rows; row++) {
    for (let column = 0; column < SECTION_COLUMNS; column++) {
      const mask = readLegendCell(image, ...cellAt(column, row), grid.size, background);
      if (mask !== null) legend.push({ mask: canonicalMask(mask), column, row });
    }
  }
  if (legend.length < 13) throw new Error("No tile legend found");

  const readSection = section => {
    if ((section + 1) * SECTION_COLUMNS > grid.columns) return null;
    const tiles = new Map();
    for (const { mask, column, row } of legend) {
      const tile = readCell(image, ...cellAt(section * SECTION_COLUMNS + column, row), grid.size, background);
      if (tile) tiles.set(mask, tile);
    }
    return tiles.size ? tiles : null;
  };
  const withAlternates = (base, ...alternates) => {
    const tiles = new Map();
    for (const [mask, tile] of base ?? []) {
      tiles.set(mask, [tile, ...alternates.map(section => section?.get(mask)).filter(_ => _)]);
    }
    return tiles;
  };
  const wall = withAlternates(readSection(SECTION.wall), readSection(SECTION.wallAlt1), readSection(SECTION.wallAlt2));
  const ground = withAlternates(readSection(SECTION.ground), readSection(SECTION.groundAlt1), readSection(SECTION.groundAlt2));
  if (!wall.size || !ground.size) throw new Error("No wall or ground tiles found");

  let liquid = withAlternates(readSection(SECTION.liquid));
  const sparkle = readSection(SECTION.sparkle);
  for (const [mask, [tile]] of liquid) {
    const overlay = sparkle?.get(mask);
    if (!overlay) continue;
    for (let i = 0; i < tile.length; i += 4) {
// Sparkles fill the holes in the water tiles.
      if (tile[i + 3] === 0) tile.set(overlay.subarray(i, i + 4), i);
    }
  }
  if (!liquid.size) liquid = null;
  return { size: grid.size, wall, ground, liquid };
}

export function pickTile(tiles, mask, random = Math.random) {
  mask = canonicalMask(mask);
  let choices = tiles.get(mask);
  if (!choices) {
    let best = -Infinity;
    for (const [candidate, list] of tiles) {
      let score = 0;
      for (let bit = 0; bit < 8; bit++) score += ((candidate >> bit) & 1) === ((mask >> bit) & 1) ? 3 : -10;
      if (score > best) { best = score; choices = list; }
    }
  }
  if (choices.length === 1) return choices[0];
  const roll = random() * (BASE_TILE_WEIGHT + choices.length - 1);
  return roll < BASE_TILE_WEIGHT ? choices[0] : choices[1 + Math.floor(roll - BASE_TILE_WEIGHT)];
}
