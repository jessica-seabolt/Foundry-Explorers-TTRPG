const { RegionBehaviorType } = foundry.data.regionBehaviors;

export const ROOM_BEHAVIOR = "room";

export class RoomRegionBehaviorType extends RegionBehaviorType {
  static LOCALIZATION_PREFIXES = ["SYSTEM.Regions.Room"];

  static defineSchema() {
    return {};
  }
}

export function getRooms(scene = canvas?.scene) {
  if (!scene) return [];
  return scene.regions.filter(region => region.behaviors.some(behavior => behavior.type === ROOM_BEHAVIOR && !behavior.disabled));
}

export function roomAt(point, scene = canvas?.scene) {
  const elevation = point.elevation ?? 0;
  return getRooms(scene).find(region => region.testPoint({ x: point.x, y: point.y, elevation })) ?? null;
}

export function roomOfToken(tokenDocument) {
  const center = tokenDocument.object?.center ?? tokenDocument.getCenterPoint?.();
  if (!center) return null;
  return roomAt({ ...center, elevation: tokenDocument.elevation }, tokenDocument.parent);
}

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

export function polygonContaining(polygons, point) {
  return polygons.find(polygon => polygon.contains(point.x, point.y))
    ?? polygons.reduce((best, polygon) => (!best || Math.abs(polygon.signedArea()) > Math.abs(best.signedArea()) ? polygon : best), null);
}

export function roomVisionArea(region, point, gridSize = canvas.grid.size) {
  const grown = offsetPolygons(region.polygons, gridSize);
  return polygonContaining(grown, point);
}
