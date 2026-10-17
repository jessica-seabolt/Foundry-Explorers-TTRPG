import { SYSTEM_ID } from '../constants.mjs';
import { offsetPolygons, polygonContaining, roomOfToken, roomVisionArea } from './rooms.mjs';
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

    const room = dungeonRules ? roomOfToken(token.document) : null;
    if (room) {
      const area = roomVisionArea(room, origin);
      if (area) {
        los = los.applyConstraint(area);
        this.los = this.light = this.shape = los;
        return;
      }
    }
    if (dungeonRules && this.data.radius > 0) {
      const radius = Math.max(this.data.radius - visibilityPenalty(token.actor) * canvas.grid.size, canvas.grid.size / 2);
      los = los.applyConstraint(new PIXI.Circle(origin.x, origin.y, radius));
    }
    this.los = los;
    this.light = this._createLightPolygon();
    this.shape = this._createRestrictedPolygon();
  }
}

function expandSourcePolygon(polygon, distance, origin) {
  const grown = polygonContaining(offsetPolygons([polygon], distance), origin);
  if (!grown) return polygon;
  const expanded = polygon.clone();
  expanded.points = grown.points;
  expanded.bounds = expanded.getBounds();
  return expanded;
}

export function registerVisionHooks() {
  const refresh = () => canvas?.ready && canvas.perception.update({ initializeVision: true });
  for (const hook of ["createRegion", "updateRegion", "deleteRegion", "createRegionBehavior", "updateRegionBehavior", "deleteRegionBehavior"]) {
    Hooks.on(hook, refresh);
  }
}
