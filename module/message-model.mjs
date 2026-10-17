import { SYSTEM_ID } from '../constants.mjs';
import { DamageRoll, StatusRoll } from './explorers-roll.mjs';
import { confirmOf, isPending } from './roll-confirm.mjs';
import { openResistDialog } from './roll-dialog.mjs';

export default class BaseMessageModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {};
  }

  addListeners(html) {
    const message = this.parent;
    const damageRoll = message.rolls.find(roll => roll instanceof DamageRoll);
// Accepting a targeted roll applies it, so it needs no button of its own.
    const governed = confirmOf(message) && damageRoll?.targetId;
    for (const button of html.querySelectorAll(".damage-button")) {
      if (governed || message.getFlag(SYSTEM_ID, "damageApplied")) button.remove();
      else button.addEventListener("click", () => damageRoll?.applyToTargets());
    }
    const statusRoll = message.rolls.find(roll => roll instanceof StatusRoll);
    for (const button of html.querySelectorAll(".resist-button")) {
      if (isPending(message) || message.getFlag(SYSTEM_ID, "statusResolved")) button.remove();
      else button.addEventListener("click", () => statusRoll && openResistDialog(statusRoll, message));
    }
  }
}
