import { filePath, toFormGroup } from '../constants.mjs';
import { RULE_TYPES } from './features.mjs';
import { USE_EFFECTS } from './items.mjs';
import { itemCategories, ranges, targets, types } from './types.mjs';

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

export class ItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    tag: "form",
    form: {
      submitOnChange: true,
    },
    position: {
      width: 520,
    }
  }

  static PARTS = {
    item: { template: filePath("templates/item/item.hbs"), scrollable: [""] }
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.document.system;
    context.systemFields = system.schema.fields;
    context.itemCategories = itemCategories;
    context.targets = toFormGroup(targets);
    context.ranges = toFormGroup(ranges);
    context.types = toFormGroup(types);
    context.rulesText = system.rules.length ? JSON.stringify(system.rules, null, 2) : "";
    context.onUseText = system.onUse.length ? JSON.stringify(system.onUse, null, 2) : "";
    context.ruleTypes = Object.entries(RULE_TYPES).map(([type, example]) => ({ type, example }));
    context.useEffects = Object.entries(USE_EFFECTS).map(([type, example]) => ({ type, example }));
    context.canEditRules = this.isEditable;
    context.isAutomated = system.rules.length > 0 || system.onUse.length > 0;
    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    // Rules and use effects are edited as JSON, so they're parsed and saved separately from the rest of the form
    for (const textarea of this.element.querySelectorAll("textarea[data-json-field]")) {
      textarea.addEventListener("change", event => this.#saveJson(textarea.dataset.jsonField, event.target.value));
    }
  }

  async #saveJson(field, text) {
    let value;
    try {
      value = text.trim() ? JSON.parse(text) : [];
      if (!Array.isArray(value) || value.some(rule => typeof rule?.type !== "string")) throw new Error("not a list of rules");
    } catch (error) {
      ui.notifications.error(game.i18n.format("SYSTEM.Features.InvalidRules", { error: error.message }));
      return;
    }
    await this.document.update({ [`system.${field}`]: value });
  }
}
