// Dungeon Rooms are Scene Regions with the "Room" behavior. A Pokemon in a Room can see the whole Room
// and one Tile outside each entrance; a Pokemon in a Hallway (outside every Room) uses its normal Visibility.

const { RegionBehaviorType } = foundry.data.regionBehaviors;

export const ROOM_BEHAVIOR = "room";

export class RoomRegionBehaviorType extends RegionBehaviorType {
  static LOCALIZATION_PREFIXES = ["SYSTEM.Regions.Room"];

  static defineSchema() {
    return {};
  }
}

/** The Regions on a scene marked as Rooms. */
export function getRooms(scene = canvas?.scene) {
  if (!scene) return [];
  return scene.regions.filter(region => region.behaviors.some(behavior => behavior.type === ROOM_BEHAVIOR && !behavior.disabled));
}

/** The Room Region containing a point, or null if the point is in a Hallway. */
export function roomAt(point, scene = canvas?.scene) {
  const elevation = point.elevation ?? 0;
  return getRooms(scene).find(region => region.testPoint({ x: point.x, y: point.y, elevation })) ?? null;
}

/** The Room Region a token is standing in, judged by its center. */
export function roomOfToken(tokenDocument) {
  const center = tokenDocument.object?.center ?? tokenDocument.getCenterPoint?.();
  if (!center) return null;
  return roomAt({ ...center, elevation: tokenDocument.elevation }, tokenDocument.parent);
}

/**
 * Grows (or shrinks, with a negative delta) polygons by a distance in pixels, keeping square corners.
 * @param {PIXI.Polygon[]} polygons
 * @param {number} delta
 * @returns {PIXI.Polygon[]}
 */
export function offsetPolygons(polygons, delta) {
  const scalingFactor = CONST.CLIPPER_SCALING_FACTOR;
  const offsetter = new ClipperLib.ClipperOffset(2, 0.25 * scalingFactor);
  for (const polygon of polygons) {
    if (polygon.points.length < 6) continue;
    offsetter.AddPath(polygon.toClipperPoints({ scalingFactor }), ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);
  }
  const solution = new ClipperLib.Paths();
  offsetter.Execute(solution, delta * scalingFactor);
  return solution.map(path => PIXI.Polygon.fromClipperPoints(path, { scalingFactor }));
}

/** Of several polygons, the one containing the point (or the largest if none do). */
export function polygonContaining(polygons, point) {
  return polygons.find(polygon => polygon.contains(point.x, point.y))
    ?? polygons.reduce((best, polygon) => (!best || Math.abs(polygon.signedArea()) > Math.abs(best.signedArea()) ? polygon : best), null);
}

/** The area a Pokemon in this Room can see: the Room plus one Tile around it (covering entrances and walls). */
export function roomVisionArea(region, point, gridSize = canvas.grid.size) {
  const grown = offsetPolygons(region.polygons, gridSize);
  return polygonContaining(grown, point);
}
