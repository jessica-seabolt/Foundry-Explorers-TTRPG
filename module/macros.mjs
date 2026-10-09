import { MoveRollDialog, SkillRollDialog } from './roll-dialog.mjs';

export default {
  async openMoveRoll(userId, moveId, dc) {
    new MoveRollDialog({ userId, moveId, dc }).render({ force: true });
  },
  async openSkillRoll(userId, skill, dc) {
    new SkillRollDialog({ userId, skill, dc }).render({ force: true });
  },
  /** Moving to a new Floor: resets Stat Changes for every Pokemon with a token on the current scene. */
  async newFloor() {
    const actors = new Set(canvas.scene?.tokens.map(token => token.actor).filter(actor => actor?.isOwner) ?? []);
    for (const actor of actors) await actor.system.newFloor?.();
  }
}