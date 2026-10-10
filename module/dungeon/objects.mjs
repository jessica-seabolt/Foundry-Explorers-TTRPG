// Dungeon object sprites from the "Pokemon Mystery Dungeon 2 Complete Items Sheet" (by Null, ripped by
// redblueyellow; The Spriters Resource, Explorers of Time/Darkness > Miscellaneous > Items). The sprites are read
// from fixed spots in its "Traps and Ground Tiles" grid, so only that exact sheet works.

const SHEET_SIZE = { width: 466, height: 584 };
const SPRITE_SIZE = 24;
const SPRITES = {
  stairsUp: [13, 387],
  stairsDown: [13, 412]
};

/**
 * Cuts the sprites out of the sheet.
 * @param {{width: number, height: number, data: Uint8ClampedArray}} image
 * @returns {{size: number, sprites: Record<string, Uint8ClampedArray>}}
 */
export function readObjectSheet(image) {
  if (image.width !== SHEET_SIZE.width || image.height !== SHEET_SIZE.height) {
    throw new Error(`Expected the ${SHEET_SIZE.width} × ${SHEET_SIZE.height} PMD2 items sheet`);
  }
  const sprites = {};
  for (const [name, [left, top]] of Object.entries(SPRITES)) {
    const data = new Uint8ClampedArray(SPRITE_SIZE * SPRITE_SIZE * 4);
    for (let y = 0; y < SPRITE_SIZE; y++) {
      const start = (left + (top + y) * image.width) * 4;
      data.set(image.data.subarray(start, start + SPRITE_SIZE * 4), y * SPRITE_SIZE * 4);
    }
    sprites[name] = data;
  }
  return { size: SPRITE_SIZE, sprites };
}
