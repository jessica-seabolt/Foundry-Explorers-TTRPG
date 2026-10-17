export const DIRECTIONS = {
  nw: { i: -1, j: -1 }, n: { i: -1, j: 0 }, ne: { i: -1, j: 1 },
  w: { i: 0, j: -1 }, e: { i: 0, j: 1 },
  sw: { i: 1, j: -1 }, s: { i: 1, j: 0 }, se: { i: 1, j: 1 },
};
const CLOCKWISE = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
const MAX_PATH_TILES = 50;

export const cellKey = ({ i, j }) => `${i},${j}`;

export function needsDirection(range) {
  return ['front', 'ahead', 'path'].includes(range);
}

export function rotate(direction, steps) {
  const index = CLOCKWISE.indexOf(direction);
  return CLOCKWISE[(index + steps + CLOCKWISE.length * 2) % CLOCKWISE.length];
}

export function tileDistance(cellsA, cellsB) {
  let best = Infinity;
  for (const a of cellsA) for (const b of cellsB) {
    best = Math.min(best, Math.max(Math.abs(a.i - b.i), Math.abs(a.j - b.j)));
  }
  return best;
}

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

export function targetFilter(target) {
  const isFoe = (user, other) => other.team !== user.team;
  const isAlly = (user, other) => other.team === user.team;
  switch (target) {
    case 'foe': case 'foes': return isFoe;
    case 'ally': case 'allies': case 'selfAllies': case 'selfOrAlly': return isAlly;
    case 'all': case 'any': return () => true;
    default: return () => false;
  }
}

export const isSingleTarget = target => ['foe', 'ally', 'selfOrAlly', 'any'].includes(target);
export const includesSelf = target => ['self', 'selfAllies', 'selfOrAlly'].includes(target);

export function computeTargets({ user, others, move, direction = null, location = null, burst = 1,
  userRoom = null, visibility = Infinity, isBlocked = () => false, pierce = false, throughAllies = false }) {
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
        if (cells.some(cell => isBlocked(user.center, cell))) break;
        result.cells.push(...cells);
        const hit = occupying(cells).filter(other => !other.fainted);
        if (move.range === 'path') {
          result.candidates.push(...hit.filter(valid));
          continue;
        }
        const wanted = hit.filter(valid);
        const blocker = throughAllies ? null : hit.find(other => !valid(other));
        result.candidates.push(...wanted);
        if (blocker && !wanted.length) {
          result.blockedBy = blocker;
          break;
        }
        if (wanted.length && single && !pierce) break;
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

export function parseLocationMove(description = "") {
  const reach = description.match(/location within (\d+) tiles?/i);
  if (!reach) return null;
  const burst = description.match(/(\d+)-tile range of that location/i);
  return { reach: Number(reach[1]), burst: burst ? Number(burst[1]) : 1 };
}
