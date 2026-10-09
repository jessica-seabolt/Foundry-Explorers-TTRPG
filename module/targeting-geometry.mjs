// Pure grid geometry for move targeting. Works on grid offsets ({i: row, j: column}) so it can run without a canvas.
// Distances count a diagonal step as 1 Tile, like the Mystery Dungeon games.

export const DIRECTIONS = {
  nw: { i: -1, j: -1 }, n: { i: -1, j: 0 }, ne: { i: -1, j: 1 },
  w: { i: 0, j: -1 }, e: { i: 0, j: 1 },
  sw: { i: 1, j: -1 }, s: { i: 1, j: 0 }, se: { i: 1, j: 1 },
};
const CLOCKWISE = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
// A path is followed until it hits a wall; this caps it on open maps
const MAX_PATH_TILES = 50;

export const cellKey = ({ i, j }) => `${i},${j}`;

/** Ranges that need the user to pick a direction. */
export function needsDirection(range) {
  return ['front', 'ahead', 'path'].includes(range);
}

/** Rotates a direction by 45 degree steps (positive is clockwise). */
export function rotate(direction, steps) {
  const index = CLOCKWISE.indexOf(direction);
  return CLOCKWISE[(index + steps + CLOCKWISE.length * 2) % CLOCKWISE.length];
}

/** Distance in Tiles between two sets of occupied cells (closest pair, diagonals count as 1). */
export function tileDistance(cellsA, cellsB) {
  let best = Infinity;
  for (const a of cellsA) for (const b of cellsB) {
    best = Math.min(best, Math.max(Math.abs(a.i - b.i), Math.abs(a.j - b.j)));
  }
  return best;
}

/** The cells one step from a token in the given direction(s), excluding the token's own cells. */
function stepCells(cells, directions, steps = 1) {
  const own = new Set(cells.map(cellKey));
  const result = new Map();
  for (const direction of directions) {
    const { i: di, j: dj } = DIRECTIONS[direction];
    for (const cell of cells) {
      const next = { i: cell.i + di * steps, j: cell.j + dj * steps };
      if (!own.has(cellKey(next))) result.set(cellKey(next), next);
    }
  }
  return [...result.values()];
}

/** Which kinds of Pokemon a move's target type can hit, relative to the user. */
export function targetFilter(target) {
  const isFoe = (user, other) => other.team !== user.team;
  const isAlly = (user, other) => other.team === user.team;
  switch (target) {
    case 'foe': case 'foes': return isFoe;
    case 'ally': case 'allies': case 'selfAllies': case 'selfOrAlly': return isAlly;
    case 'all': return () => true;
    default: return () => false; // 'self' and moves with no target
  }
}

/** Whether the move picks one target (as opposed to every valid target). */
export const isSingleTarget = target => ['foe', 'ally', 'selfOrAlly'].includes(target);
/** Whether the user is one of the move's targets. */
export const includesSelf = target => ['self', 'selfAllies', 'selfOrAlly'].includes(target);

/**
 * Works out which tokens a move can hit.
 * @param {object} args
 * @param {object} args.user        {id, cells, team, center}
 * @param {object[]} args.others    Other tokens: {id, cells, team, center, fainted, room}
 * @param {object} args.move        {target, range, rangeCount}
 * @param {string} [args.direction] Facing, for front/ahead/path ranges
 * @param {{i, j}} [args.location]  Chosen Tile, for "choose a location" moves
 * @param {number} [args.burst]     Radius in Tiles around the location
 * @param {string|null} [args.userRoom]  The id of the Room the user is in
 * @param {number} [args.visibility]     The user's Visibility in Tiles (for Hallways)
 * @param {(fromCenter, toCell) => boolean} [args.isBlocked]  Whether a wall blocks the way to a cell
 * @returns {{cells: {i, j}[], candidates: object[], single: boolean, includeSelf: boolean, blockedBy: object|null}}
 */
export function computeTargets({ user, others, move, direction = null, location = null, burst = 1,
  userRoom = null, visibility = Infinity, isBlocked = () => false }) {
  const wants = targetFilter(move.target);
  const valid = other => !other.fainted && wants(user, other);
  const single = isSingleTarget(move.target);
  const result = { cells: [], candidates: [], single, includeSelf: includesSelf(move.target), blockedBy: null };
  const occupying = cells => {
    const keys = new Set(cells.map(cellKey));
    return others.filter(other => other.cells.some(cell => keys.has(cellKey(cell))));
  };
  const reachable = other => !isBlocked(user.center, other.cells[0]);

  switch (move.range) {
    case null: case undefined:
      return result;

    case 'front': {
      if (!direction) return result;
      // "Foes in Front" also hits the two Tiles beside the one in front
      const wide = !single && move.target !== 'self';
      const directions = wide ? [rotate(direction, -1), direction, rotate(direction, 1)] : [direction];
      result.cells = stepCells(user.cells, directions).filter(cell => !isBlocked(user.center, cell));
      result.candidates = occupying(result.cells).filter(valid);
      return result;
    }

    case 'ahead': case 'path': {
      if (!direction) return result;
      const maxSteps = move.range === 'path' ? MAX_PATH_TILES : (move.rangeCount ?? 1);
      for (let step = 1; step <= maxSteps; step++) {
        const cells = stepCells(user.cells, [direction], step);
        if (cells.some(cell => isBlocked(user.center, cell))) break; // stopped by a wall
        result.cells.push(...cells);
        const hit = occupying(cells).filter(other => !other.fainted);
        if (move.range === 'path') { // paths hit everything they pass through
          result.candidates.push(...hit.filter(valid));
          continue;
        }
        const wanted = hit.filter(valid);
        const blocker = hit.find(other => !valid(other));
        result.candidates.push(...wanted);
        if (blocker && !wanted.length) { // an Ally in the way blocks the target
          result.blockedBy = blocker;
          break;
        }
        if (wanted.length && single) break; // stops at the first target
        if (blocker) break;
      }
      return result;
    }

    case 'away': case 'range': {
      const reach = move.rangeCount ?? 1;
      for (const cell of user.cells) for (let di = -reach; di <= reach; di++) for (let dj = -reach; dj <= reach; dj++) {
        result.cells.push({ i: cell.i + di, j: cell.j + dj });
      }
      result.candidates = others.filter(other => valid(other) && tileDistance(user.cells, other.cells) <= reach && reachable(other));
      return result;
    }

    case 'room': {
      // Everyone in the same Room; in a Hallway, everyone in the Hallway the user can see
      result.candidates = others.filter(other => valid(other) && (userRoom
        ? other.room === userRoom
        : !other.room && tileDistance(user.cells, other.cells) <= visibility && reachable(other)));
      return result;
    }

    case 'floor':
      result.candidates = others.filter(valid);
      return result;

    case 'special': {
      if (!location) return result;
      for (let di = -burst; di <= burst; di++) for (let dj = -burst; dj <= burst; dj++) {
        result.cells.push({ i: location.i + di, j: location.j + dj });
      }
      result.candidates = others.filter(other => valid(other) && tileDistance([location], other.cells) <= burst);
      return result;
    }
  }
  return result;
}

/**
 * Reads "Choose a location within X tiles ... in a Y-tile range of that location" from a move's description.
 * @returns {{reach: number, burst: number}|null}
 */
export function parseLocationMove(description = "") {
  const reach = description.match(/location within (\d+) tiles?/i);
  if (!reach) return null;
  const burst = description.match(/(\d+)-tile range of that location/i);
  return { reach: Number(reach[1]), burst: burst ? Number(burst[1]) : 1 };
}
