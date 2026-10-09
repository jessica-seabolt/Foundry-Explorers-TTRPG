import { SYSTEM_ID } from '../constants.mjs';
import { DamageRoll, StatusRoll } from './explorers-roll.mjs';
import { openResistDialog } from './roll-dialog.mjs';

export default class BaseMessageModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {};
  }

  addListeners(html) {
    const message = this.parent;
    const damageRoll = message.rolls.find(roll => roll instanceof DamageRoll);
    for (const button of html.querySelectorAll(".damage-button")) {
      // Damage to a target is applied automatically; the button remains for untargeted rolls
      if (message.getFlag(SYSTEM_ID, "damageApplied")) button.remove();
      else button.addEventListener("click", () => damageRoll?.applyToTargets());
    }
    // The Resist button is a fallback for when the automatic Status Check prompt was closed or the move had no target
    const statusRoll = message.rolls.find(roll => roll instanceof StatusRoll);
    for (const button of html.querySelectorAll(".resist-button")) {
      if (message.getFlag(SYSTEM_ID, "statusResolved")) button.remove();
      else button.addEventListener("click", () => statusRoll && openResistDialog(statusRoll, message));
    }
  }
}
