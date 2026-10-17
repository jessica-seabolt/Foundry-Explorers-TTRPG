import { SYSTEM_ID } from '../constants.mjs';
import { dungeonPool, teamLevel } from './dungeon-tokens.mjs';
import { configureRollConfirm, freelyRaisable, raiseFreely, speakerActor } from './roll-confirm.mjs';
import { setHudItem } from './hud.mjs';
import { setsOffTraps } from './traps.mjs';

const POOL_SETTING = "gmAdventureTokens";
const SUGGEST_SETTING = "suggestAdventureTokens";
export const AWARD_REASONS = ["failedCheck", "foundItem", "secret", "failedStatus", "failedDamage", "roleplay", "other"];

const localize = key => game.i18n.localize(key);
const format = (key, data) => game.i18n.format(key, data);
const escape = text => foundry.utils.escapeHTML(text ?? "");
const reasonLabel = reason => localize(`SYSTEM.AdventureTokens.Reasons.${reason}`);

export function registerAdventureTokenSettings() {
  game.settings.register(SYSTEM_ID, POOL_SETTING, {
    scope: "world", config: false, type: Number, default: 0, onChange: () => renderCounter()
  });
  game.settings.register(SYSTEM_ID, SUGGEST_SETTING, {
    name: "SYSTEM.Settings.SuggestAdventureTokens.Name", hint: "SYSTEM.Settings.SuggestAdventureTokens.Hint",
    scope: "world", config: true, type: Boolean, default: true
  });
}

export const gmLimit = () => teamLevel();
export const gmTokens = () => game.settings.get(SYSTEM_ID, POOL_SETTING) ?? 0;
const setGmTokens = value => game.settings.set(SYSTEM_ID, POOL_SETTING, Math.max(0, Math.floor(value)));
const hasTokenTrack = actor => actor?.system?.tokens && Number.isFinite(actor.system.tokens.max);
const isFull = actor => actor.system.tokens.available >= actor.system.tokens.max;

async function announce(content, speaker = { alias: localize("SYSTEM.AdventureTokens.Title") }) {
  await foundry.documents.ChatMessage.implementation.create({ speaker, content: `<p>${content}</p>` });
}

export async function gainGmAdventureToken() {
  if (!game.user.isGM || gmTokens() >= gmLimit()) return false;
  await setGmTokens(gmTokens() + 1);
  await announce(format("SYSTEM.AdventureTokens.GmGained", { count: gmTokens(), limit: gmLimit() }));
  return true;
}

export async function awardAdventureToken(actor, reason = "other") {
  if (!game.user.isGM || !hasTokenTrack(actor)) return false;
  const name = escape(actor.name);
  if (gmTokens() < 1) {
    ui.notifications.warn(localize("SYSTEM.AdventureTokens.PoolEmpty"));
    return false;
  }
  if (isFull(actor)) {
    ui.notifications.warn(format("SYSTEM.AdventureTokens.Full", { name }));
    return false;
  }
  await actor.update({ "system.tokens.available": actor.system.tokens.available + 1 });
  await setGmTokens(gmTokens() - 1);
  await announce(format("SYSTEM.AdventureTokens.Awarded", { name, reason: reasonLabel(reason) }));
  return true;
}

function teamMembers() {
  const teams = game.actors.filter(actor => actor.type === "Team");
  const members = teams.length ? teams.flatMap(team => team.system.memberActors ?? []) : game.actors.filter(actor => actor.hasPlayerOwner);
  return [...new Set(members)].filter(hasTokenTrack);
}

async function openAwardDialog() {
  const members = teamMembers();
  if (!members.length) return ui.notifications.warn(localize("SYSTEM.AdventureTokens.NoMembers"));
  const memberOptions = members.map(actor => `<option value="${actor.uuid}">${escape(actor.name)} (${actor.system.tokens.available}/${actor.system.tokens.max})</option>`).join("");
  const reasonOptions = AWARD_REASONS.map(reason => `<option value="${reason}">${reasonLabel(reason)}</option>`).join("");
  const data = await foundry.applications.api.DialogV2.prompt({
    window: { title: "SYSTEM.AdventureTokens.AwardTitle" },
    content: `<p>${format("SYSTEM.AdventureTokens.Have", { count: gmTokens(), limit: gmLimit() })}</p>
      <div class="form-group"><label>${localize("SYSTEM.AdventureTokens.Who")}</label><div class="form-fields"><select name="actor">${memberOptions}</select></div></div>
      <div class="form-group"><label>${localize("SYSTEM.AdventureTokens.Why")}</label><div class="form-fields"><select name="reason">${reasonOptions}</select></div></div>`,
    ok: { label: "SYSTEM.AdventureTokens.Award", callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object },
    rejectClose: false
  });
  if (data?.actor) await awardAdventureToken(fromUuidSync(data.actor), data.reason);
}

async function openSetDialog() {
  const count = await foundry.applications.api.DialogV2.prompt({
    window: { title: "SYSTEM.AdventureTokens.Title" },
    content: `<div class="form-group"><label>${localize("SYSTEM.AdventureTokens.GmPool")}</label>
      <div class="form-fields"><input type="number" name="count" min="0" value="${gmTokens()}" autofocus></div></div>`,
    ok: { label: "SYSTEM.DungeonTokens.Set", callback: (event, button) => Number(button.form.elements.count.value) },
    rejectClose: false
  });
  if (Number.isFinite(count)) await setGmTokens(count);
}

function renderCounter() {
  if (!canvas?.scene) return setHudItem("explorers-adventure-tokens", null);
  const html = `<span><i class="fa-solid fa-star"></i> ${format("SYSTEM.AdventureTokens.Counter", { count: gmTokens(), limit: gmLimit() })}</span>`;
  setHudItem("explorers-adventure-tokens", html, {
    order: 1,
    tooltip: localize(game.user.isGM ? "SYSTEM.AdventureTokens.Tooltip" : "SYSTEM.AdventureTokens.PlayerTooltip"),
    onClick: game.user.isGM ? () => openAwardDialog() : null,
    onContextMenu: game.user.isGM ? () => openSetDialog() : null
  });
}

// Whispers the GM a one-click award when something on the rulebook's list happens.
export async function suggestAdventureToken(actor, reason, detail = "") {
  if (!game.settings.get(SYSTEM_ID, SUGGEST_SETTING) || !setsOffTraps(actor) || !hasTokenTrack(actor)) return;
  if (gmTokens() < 1 || isFull(actor)) return;
  const ChatMessage = foundry.documents.ChatMessage.implementation;
  await ChatMessage.create({
    speaker: { alias: localize("SYSTEM.AdventureTokens.Title") },
    whisper: ChatMessage.getWhisperRecipients("GM").map(user => user.id),
    content: `<p>${format("SYSTEM.AdventureTokens.Suggest", { name: escape(actor.name), reason: reasonLabel(reason), detail: detail ? ` (${escape(detail)})` : "" })}</p>
      <button type="button" class="adventure-token-award">${localize("SYSTEM.AdventureTokens.Give")}</button>`,
    flags: { [SYSTEM_ID]: { awardSuggestion: { actorUuid: actor.uuid, reason } } }
  });
}

function onRenderChatMessage(message, html) {
  const suggestion = message.getFlag(SYSTEM_ID, "awardSuggestion");
  const button = html.querySelector?.(".adventure-token-award");
  if (!suggestion || !button) return;
  if (!game.user.isGM) return button.remove();
  button.addEventListener("click", async () => {
    button.disabled = true;
    const actor = fromUuidSync(suggestion.actorUuid);
    if (!await awardAdventureToken(actor, suggestion.reason)) {
      button.disabled = false;
      return;
    }
    await message.update({ content: `<p>${format("SYSTEM.AdventureTokens.Given", { name: escape(actor.name) })}</p>` });
  });
}

export const adventurePool = actor => ({
  label: "SYSTEM.AdventureTokens.Title",
  title: "SYSTEM.AdventureTokens.RaiseTitle",
  prompt: "SYSTEM.AdventureTokens.RaisePrompt",
  count: () => actor.system.tokens?.available ?? 0,
  notEnough: cost => ui.notifications.warn(format("SYSTEM.AdventureTokens.NotEnough", { name: escape(actor.name), cost, have: actor.system.tokens?.available ?? 0 })),
  spend: async (cost, detail) => {
    await actor.update({ "system.tokens.available": actor.system.tokens.available - cost });
    await announce(format("SYSTEM.AdventureTokens.Spent", { name: escape(actor.name), count: cost, detail }),
      foundry.documents.ChatMessage.implementation.getSpeaker({ actor }));
    return true;
  }
});

function canSpendOwn(message) {
  const actor = message && speakerActor(message);
  if (!actor?.isOwner || !hasTokenTrack(actor) || actor.system.tokens.available < 1) return false;
  return (message.isAuthor || game.user.isGM) && freelyRaisable(message);
}

export function registerAdventureTokenHooks() {
// Team members spend their own Adventure Tokens; everyone else uses the GM's Dungeon Tokens.
  configureRollConfirm({
    poolFor: actor => actor && setsOffTraps(actor) && hasTokenTrack(actor) ? adventurePool(actor) : dungeonPool,
    isTeam: actor => setsOffTraps(actor)
  });
  Hooks.on("canvasReady", renderCounter);
  Hooks.on("updateActor", (actor, changes) => {
    if (foundry.utils.hasProperty(changes, "system.level")) renderCounter();
  });
  Hooks.on("renderChatMessageHTML", onRenderChatMessage);
  Hooks.on("getChatMessageContextOptions", (app, options) => {
    options.push({
      name: "SYSTEM.AdventureTokens.RaiseTitle",
      icon: '<i class="fa-solid fa-star"></i>',
      condition: li => canSpendOwn(game.messages.get(li.dataset.messageId)),
      callback: li => {
        const message = game.messages.get(li.dataset.messageId);
        return raiseFreely(message, adventurePool(speakerActor(message)));
      }
    });
  });
}
