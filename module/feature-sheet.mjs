import { filePath, toFormGroup } from '../constants.mjs';
import { RULE_TYPES, featureCategories } from './features.mjs';
import { classes, specializations } from './types.mjs';

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

export class FeatureSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
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
    feature: { template: filePath("templates/item/feature.hbs"), scrollable: [""] }
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.document.system;
    context.systemFields = system.schema.fields;
    context.categories = toFormGroup(featureCategories);
    context.classes = toFormGroup(classes);
    context.specializations = toFormGroup(specializations);
    context.rulesText = system.rules.length ? JSON.stringify(system.rules, null, 2) : "";
    context.ruleTypes = Object.entries(RULE_TYPES).map(([type, example]) => ({ type, example }));
    context.canEditRules = this.isEditable;
    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    // Rules are edited as JSON, so they're parsed and saved separately from the rest of the form
    const rulesInput = this.element.querySelector("textarea.feature-rules");
    rulesInput?.addEventListener("change", event => this.#saveRules(event.target.value));
  }

  async #saveRules(text) {
    let rules;
    try {
      rules = text.trim() ? JSON.parse(text) : [];
      if (!Array.isArray(rules) || rules.some(rule => typeof rule?.type !== "string")) throw new Error("not a list of rules");
    } catch (error) {
      ui.notifications.error(game.i18n.format("SYSTEM.Features.InvalidRules", { error: error.message }));
      return;
    }
    await this.document.update({ "system.rules": rules });
  }
}
