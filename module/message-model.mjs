import { DamageRoll } from './explorers-roll.mjs';

export default class BaseMessageModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {};
  }

  addListeners(html) {
    const damageButtons = html.querySelectorAll(".damage-button");
    for (const damageButton of damageButtons) damageButton.addEventListener("click", (event) => DamageRoll.applyDamageCallback(event));
  }
}
