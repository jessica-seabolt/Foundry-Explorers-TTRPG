import { SYSTEM_ID } from '../constants.mjs';
import { offsetPolygons, polygonContaining, roomOfToken, roomVisionArea, unionPolygons } from './rooms.mjs';
import { visibilityPenalty } from './weather.mjs';

const { PointVisionSource } = foundry.canvas.sources;

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

    const radius = dungeonRules && this.data.radius > 0
      ? Math.max(this.data.radius - visibilityPenalty(token.actor) * canvas.grid.size, canvas.grid.size / 2) : null;
    const nearby = radius ? los.applyConstraint(new PIXI.Circle(origin.x, origin.y, radius)) : null;
    const room = dungeonRules ? roomOfToken(token.document) : null;
    const area = room ? roomVisionArea(room, origin) : null;
    if (area) {
// The whole room, plus whatever is in normal sight range past its edges.
      const inRoom = los.applyConstraint(area);
      los = nearby ? withPoints(inRoom, polygonContaining(unionPolygons([inRoom, nearby]), origin)) : inRoom;
      this.los = this.light = this.shape = los;
      return;
    }
    if (nearby) los = nearby;
    this.los = los;
    this.light = this._createLightPolygon();
    this.shape = this._createRestrictedPolygon();
  }
}

function withPoints(polygon, shape) {
  if (!shape) return polygon;
  const result = polygon.clone();
  result.points = shape.points;
  result.bounds = result.getBounds();
  return result;
}

function expandSourcePolygon(polygon, distance, origin) {
  return withPoints(polygon, polygonContaining(offsetPolygons([polygon], distance), origin));
}

export function registerVisionHooks() {
  const refresh = () => canvas?.ready && canvas.perception.update({ initializeVision: true });
  for (const hook of ["createRegion", "updateRegion", "deleteRegion", "createRegionBehavior", "updateRegionBehavior", "deleteRegionBehavior"]) {
    Hooks.on(hook, refresh);
  }
}
