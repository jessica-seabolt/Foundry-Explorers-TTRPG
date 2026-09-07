import { MoveRollDialog, SkillRollDialog } from './roll-dialog.mjs';

export default {
  async openMoveRoll(userId, moveId, dc) {
    new MoveRollDialog({ userId, moveId, dc }).render({ force: true });
  },
  async openSkillRoll(userId, skill, dc) {
    new SkillRollDialog({ userId, skill, dc }).render({ force: true });
  }
}