import { SYSTEM_ID } from '../constants.mjs';
import { offsetPolygons, polygonContaining, roomOfToken, roomVisionArea } from './rooms.mjs';

const { PointVisionSource } = foundry.canvas.sources;

/**
 * Token vision following the Explorers rules:
 * - In a Room, a Pokemon sees the entire Room and one Tile outside it, regardless of its Visibility.
 * - In a Hallway, it sees up to its Visibility, even in lit areas.
 * - Optionally, sight extends one Tile past walls so the wall Tiles of a dungeon map are visible.
 */
export class ExplorersVisionSource extends PointVisionSource {
  _createShapes() {
    super._createShapes();
    const token = this.object;
    if (!token?.document || !this.los?.points.length || this.data.disabled || this.suppressed) return;
    const revealWalls = game.settings.get(SYSTEM_ID, "revealWallTiles");
    const dungeonRules = game.settings.get(SYSTEM_ID, "dungeonVisibility");
    if (!revealWalls && !dungeonRules) return;

    const origin = { x: this.data.x, y: this.data.y };
    let los = this.los;
    if (revealWalls) los = expandSourcePolygon(los, canvas.grid.size, origin);

    const room = dungeonRules ? roomOfToken(token.document) : null;
    if (room) {
      const area = roomVisionArea(room, origin);
      if (area) {
        los = los.applyConstraint(area);
        this.los = this.light = this.shape = los;
        return;
      }
    }
    if (dungeonRules && this.data.radius > 0) los = los.applyConstraint(new PIXI.Circle(origin.x, origin.y, this.data.radius));
    this.los = los;
    this.light = this._createLightPolygon();
    this.shape = this._createRestrictedPolygon();
  }
}

/** Grows a line-of-sight polygon outward, so the Tile just past each wall becomes visible. */
function expandSourcePolygon(polygon, distance, origin) {
  const grown = polygonContaining(offsetPolygons([polygon], distance), origin);
  if (!grown) return polygon;
  const expanded = polygon.clone();
  expanded.points = grown.points;
  expanded.bounds = expanded.getBounds();
  return expanded;
}

/** Recompute vision when Rooms change. */
export function registerVisionHooks() {
  const refresh = () => canvas?.ready && canvas.perception.update({ initializeVision: true });
  for (const hook of ["createRegion", "updateRegion", "deleteRegion", "createRegionBehavior", "updateRegionBehavior", "deleteRegionBehavior"]) {
    Hooks.on(hook, refresh);
  }
}
