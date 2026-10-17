import { SYSTEM_ID } from '../constants.mjs';
import { emitToGM, registerSocketHandler } from './socket.mjs';
import { processEndOfTurn, processStartOfTurn } from './conditions.mjs';
import { startBattleField, tickTerrains } from './weather.mjs';

const { Combat } = foundry.documents;
const { Roll } = foundry.dice;

const TIE_CHOICE_ACTION = "chooseInitiativeTie";
const MAX_TIE_REROLLS = 20;

export class ExplorersCombat extends Combat {
  async startCombat() {
    const unrolled = this.combatants.filter(c => c.initiative === null).map(c => c.id);
    if (unrolled.length) await this.rollInitiative(unrolled, { updateTurn: false });
    await startBattleField(this.combatants.contents);
    return super.startCombat();
  }

  async _onEndRound(context) {
    await super._onEndRound(context);
    const scene = this.scene ?? canvas?.scene;
    if (scene) await tickTerrains(scene);
  }

  async _onStartTurn(combatant, context) {
    await super._onStartTurn(combatant, context);
    if (combatant.actor && !combatant.isDefeated) await processStartOfTurn(combatant.actor);
  }

  async _onEndTurn(combatant, context) {
    await super._onEndTurn(combatant, context);
    if (combatant.actor) await processEndOfTurn(combatant.actor);
  }

// Foundry calls this without `this`.
  _sortCombatants(a, b) {
    const ia = Number.isNumeric(a.initiative) ? a.initiative : -Infinity;
    const ib = Number.isNumeric(b.initiative) ? b.initiative : -Infinity;
    if (ia !== ib) return ib - ia;
    const ta = a.getFlag(SYSTEM_ID, "tiebreak") ?? [];
    const tb = b.getFlag(SYSTEM_ID, "tiebreak") ?? [];
    for (let i = 0; i < Math.max(ta.length, tb.length); i++) {
      const difference = (tb[i] ?? 0) - (ta[i] ?? 0);
      if (difference) return difference;
    }
    return a.id > b.id ? 1 : -1;
  }

  static teamOf(combatant) {
    return combatant.token?.disposition ?? combatant.actor?.prototypeToken.disposition ?? CONST.TOKEN_DISPOSITIONS.NEUTRAL;
  }

  static tieKey(initiative, combatants) {
    return `${String(initiative).replace(".", "_")}-${combatants.map(c => c.id).sort().join("-")}`;
  }

  async resolveInitiativeTies() {
    const groups = new Map();
    for (const combatant of this.combatants) {
      if (!Number.isNumeric(combatant.initiative)) continue;
      if (!groups.has(combatant.initiative)) groups.set(combatant.initiative, []);
      groups.get(combatant.initiative).push(combatant);
    }

    const resolved = this.getFlag(SYSTEM_ID, "resolvedTies") ?? [];
    const currentKeys = [];
    const updates = [];
    const rollLines = [];
    const choices = [];
    for (const [initiative, members] of groups) {
      if (members.length < 2) continue;
      const key = ExplorersCombat.tieKey(initiative, members);
      currentKeys.push(key);
      if (resolved.includes(key)) continue;
      const tiebreaks = new Map();
      await this.#orderTiedGroup(members, [], tiebreaks, rollLines, choices, key);
      for (const [id, tiebreak] of tiebreaks) updates.push({ _id: id, [`flags.${SYSTEM_ID}.tiebreak`]: tiebreak });
    }

    const keysChanged = currentKeys.length !== resolved.length || currentKeys.some(key => !resolved.includes(key));
    if (!updates.length && !keysChanged) return;

    const currentId = this.combatant?.id;
    if (updates.length) await this.updateEmbeddedDocuments("Combatant", updates, { turnEvents: false });
    const combatUpdate = { [`flags.${SYSTEM_ID}.resolvedTies`]: currentKeys };
    if (currentId) combatUpdate.turn = this.turns.findIndex(t => t.id === currentId);
    await this.update(combatUpdate, { turnEvents: false });

    if (rollLines.length) {
      await foundry.documents.ChatMessage.implementation.create({
        speaker: { alias: game.i18n.localize("SYSTEM.Initiative.TieTitle") },
        content: `<p>${game.i18n.localize("SYSTEM.Initiative.TieRolled")}</p><ul>${rollLines.map(line => `<li>${line}</li>`).join("")}</ul>`
      });
    }
    for (const choice of choices) await this.#createTieChoiceMessage(choice);
  }

  async #orderTiedGroup(members, prefix, tiebreaks, rollLines, choices, key, depth = 0) {
    const teams = new Set(members.map(ExplorersCombat.teamOf));
    if (teams.size === 1 || depth >= MAX_TIE_REROLLS) {
      for (const combatant of members) tiebreaks.set(combatant.id, prefix);
      if (members.length > 1) choices.push({ key, prefix, combatantIds: members.map(c => c.id) });
      return;
    }

    const byTotal = new Map();
    const results = [];
    for (const combatant of members) {
      const roll = await new Roll("2d6").evaluate();
      results.push(`${foundry.utils.escapeHTML(combatant.name)}: ${roll.total}`);
      if (!byTotal.has(roll.total)) byTotal.set(roll.total, []);
      byTotal.get(roll.total).push(combatant);
    }
    rollLines.push(results.join(", "));
    for (const [total, group] of byTotal) {
      if (group.length === 1) tiebreaks.set(group[0].id, [...prefix, total]);
      else await this.#orderTiedGroup(group, [...prefix, total], tiebreaks, rollLines, choices, key, depth + 1);
    }
  }

  async #createTieChoiceMessage({ key, prefix, combatantIds }) {
    const flags = { [SYSTEM_ID]: { initiativeTie: { combatId: this.id, key, prefix, remaining: combatantIds, chosen: [] } } };
    await foundry.documents.ChatMessage.implementation.create({
      speaker: { alias: game.i18n.localize("SYSTEM.Initiative.TieTitle") },
      content: ExplorersCombat.renderTieChoice(this, flags[SYSTEM_ID].initiativeTie),
      flags
    });
  }

  static renderTieChoice(combat, { remaining, chosen }) {
    const name = id => foundry.utils.escapeHTML(combat.combatants.get(id)?.name ?? "?");
    const chosenList = chosen.length ? `<ol>${chosen.map(id => `<li>${name(id)}</li>`).join("")}</ol>` : "";
    if (remaining.length === 0) {
      return `<div class="initiative-tie-choice"><p>${game.i18n.localize("SYSTEM.Initiative.TieDecided")}</p>${chosenList}</div>`;
    }
    const buttons = remaining.map(id => `<button type="button" data-combatant-id="${id}">${name(id)}</button>`).join("");
    return `<div class="initiative-tie-choice">
      <p>${game.i18n.localize("SYSTEM.Initiative.TieChoose")}</p>
      ${chosenList}
      <div class="initiative-tie-buttons">${buttons}</div>
    </div>`;
  }

  static canChooseTie(user, combat, tie) {
    if (user.isGM) return true;
    return tie.remaining.some(id => combat?.combatants.get(id)?.actor?.testUserPermission(user, "OWNER"));
  }

  static async applyTieChoice(messageId, combatantId, userId) {
    const message = game.messages.get(messageId);
    const tie = message?.getFlag(SYSTEM_ID, "initiativeTie");
    const user = game.users.get(userId);
    if (!tie || !user) return;
    const combat = game.combats.get(tie.combatId);
    if (!combat || !tie.remaining.includes(combatantId) || !ExplorersCombat.canChooseTie(user, combat, tie)) return;
    if (!(combat.getFlag(SYSTEM_ID, "resolvedTies") ?? []).includes(tie.key)) {
      ui.notifications.warn("SYSTEM.Initiative.TieOutdated", { localize: true });
      return;
    }

    const chosen = [...tie.chosen, combatantId];
    let remaining = tie.remaining.filter(id => id !== combatantId);
    if (remaining.length === 1) {
      chosen.push(remaining[0]);
      remaining = [];
    }
    const updates = chosen.map((id, i) => ({ _id: id, [`flags.${SYSTEM_ID}.tiebreak`]: [...tie.prefix, 100 - i] }));
    const currentId = combat.combatant?.id;
    await combat.updateEmbeddedDocuments("Combatant", updates, { turnEvents: false });
    if (currentId) await combat.update({ turn: combat.turns.findIndex(t => t.id === currentId) }, { turnEvents: false });

    const newTie = { ...tie, chosen, remaining };
    await message.update({
      content: ExplorersCombat.renderTieChoice(combat, newTie),
      [`flags.${SYSTEM_ID}.initiativeTie`]: newTie
    });
  }
}

const pendingResolutions = new Map();
function scheduleTieResolution(combat) {
  if (!game.user.isActiveGM || !(combat instanceof ExplorersCombat)) return;
  clearTimeout(pendingResolutions.get(combat.id));
  pendingResolutions.set(combat.id, setTimeout(() => {
    pendingResolutions.delete(combat.id);
    if (game.combats.has(combat.id)) combat.resolveInitiativeTies();
  }, 250));
}

export function registerCombatHooks() {
  Hooks.on("updateCombatant", (combatant, changes) => {
    if ("initiative" in changes) scheduleTieResolution(combatant.parent);
  });
  Hooks.on("createCombatant", combatant => {
    if (combatant.initiative !== null) scheduleTieResolution(combatant.parent);
    if (game.user.isActiveGM && combatant.parent.started) startBattleField([combatant]);
  });
  Hooks.on("deleteCombatant", combatant => scheduleTieResolution(combatant.parent));
  Hooks.on("deleteCombat", combat => {
    if (!game.user.isActiveGM) return;
    for (const combatant of combat.combatants) combatant.actor?.system.clearEndure?.({ battleOnly: true });
  });

  Hooks.on("createChatMessage", message => {
    const tie = message.getFlag(SYSTEM_ID, "initiativeTie");
    if (!tie || game.user.isGM) return;
    const combat = game.combats.get(tie.combatId);
    if (ExplorersCombat.canChooseTie(game.user, combat, tie)) {
      ui.notifications.info("SYSTEM.Initiative.TieNotify", { localize: true });
    }
  });
}

export function addTieChoiceListeners(message, html) {
  const tie = message.getFlag(SYSTEM_ID, "initiativeTie");
  if (!tie) return;
  const container = html.querySelector(".initiative-tie-buttons");
  if (!container) return;
  const combat = game.combats.get(tie.combatId);
  if (!ExplorersCombat.canChooseTie(game.user, combat, tie)) {
    container.remove();
    return;
  }
  for (const button of container.querySelectorAll("button[data-combatant-id]")) {
    button.addEventListener("click", () => {
      const { combatantId } = button.dataset;
      if (game.user.isActiveGM) ExplorersCombat.applyTieChoice(message.id, combatantId, game.user.id);
      else emitToGM(TIE_CHOICE_ACTION, { messageId: message.id, combatantId, userId: game.user.id });
    });
  }
}

registerSocketHandler(TIE_CHOICE_ACTION, data => ExplorersCombat.applyTieChoice(data.messageId, data.combatantId, data.userId));
