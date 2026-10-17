import { SYSTEM_ID, filePath, getDieString } from '../constants.mjs';
import { DamageRoll, ExplorersRoll, StatusRoll } from './explorers-roll.mjs';
import { emitToUser, registerSocketHandler } from './socket.mjs';

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

const CONFIRM_FLAG = "confirm";
const CONFIRM_ACTION = "confirmRoll";
const ALWAYS_SETTING = "confirmAllRolls";
const PROMPT_SETTING = "promptAutomaticRolls";
const ROLL_CLASSES = { Roll: () => foundry.dice.Roll, ExplorersRoll: () => ExplorersRoll, DamageRoll: () => DamageRoll, StatusRoll: () => StatusRoll };
const ADVANTAGES = { advantage: "SYSTEM.Dice.Advantage", normal: "SYSTEM.Dice.Normal", disadvantage: "SYSTEM.Dice.Disadvantage" };
const pending = new Map();
const noPool = { count: () => 0 };
let tokens = { poolFor: () => noPool, isTeam: () => false };

const localize = key => game.i18n.localize(key);
const format = (key, data) => game.i18n.format(key, data);
const escape = text => foundry.utils.escapeHTML(text ?? "");
const ChatMessage = () => foundry.documents.ChatMessage.implementation;

export const speakerActor = message => ChatMessage().getSpeakerActor(message.speaker);
export const confirmOf = message => message?.getFlag?.(SYSTEM_ID, CONFIRM_FLAG) ?? null;
export const isPending = message => ["setup", "pending"].includes(confirmOf(message)?.state);

export function registerRollConfirmSettings() {
  game.settings.register(SYSTEM_ID, ALWAYS_SETTING, {
    name: "SYSTEM.Settings.ConfirmAllRolls.Name", hint: "SYSTEM.Settings.ConfirmAllRolls.Hint",
    scope: "world", config: true, type: Boolean, default: false
  });
  game.settings.register(SYSTEM_ID, PROMPT_SETTING, {
    name: "SYSTEM.Settings.PromptAutomaticRolls.Name", hint: "SYSTEM.Settings.PromptAutomaticRolls.Hint",
    scope: "world", config: true, type: Boolean, default: true
  });
}

// Set at startup by the token code, which knows whose pool pays for which roll.
export function configureRollConfirm({ poolFor, isTeam }) {
  tokens = { poolFor, isTeam };
}

export const poolFor = actor => tokens.poolFor(actor);

export function confirmerFor(actor) {
  if (actor && tokens.isTeam(actor)) {
    const players = game.users.filter(user => user.active && !user.isGM && actor.testUserPermission?.(user, "OWNER"));
    const player = players.find(user => user.character === actor) ?? players[0];
    if (player) return player;
  }
  return game.users?.activeGM ?? game.user;
}

// "2d6+1" becomes a roll the decider can add dice or Advantage to before rolling.
export function rollSetup(formula, extra = {}) {
  const match = String(formula).replace(/\s/g, "").match(/^(\d*)d6([+-]\d+)?$/);
  if (!match) return null;
  return { dice: Number(match[1] || 1), modifier: Number(match[2] ?? 0), explode: false, ...extra };
}

const setupFormula = (setup, bonus = 0, advantage = setup.advantage ?? "normal") => getDieString({
  sides: setup.dice + bonus, modifier: setup.modifier ?? 0, advantage, multiplier: setup.multiplier ?? 1,
  highCrit: !!setup.highCrit, explode: setup.explode ?? true
});

const explodeAt = die => {
  const modifier = die.modifiers?.find(modifier => modifier.startsWith("x"));
  if (!modifier) return null;
  const match = modifier.match(/^x(?:>=?(\d+))?/);
  return match?.[1] ? Number(match[1]) : die.faces;
};

// Our formulas are "Nd6...+mod", optionally wrapped as "floor((...) * multiplier)".
export function rollTotal(roll) {
  const sum = roll.dice.reduce((total, die) => total + die.results.filter(result => result.active).reduce((t, result) => t + result.result, 0), 0);
  const multiplier = roll.formula.match(/\* ([\d.]+)\)$/);
  const modifier = roll.formula.match(/([+-]\s*\d+)\)?(?: \* [\d.]+\))?$/);
  const base = sum + (modifier ? Number(modifier[1].replace(/\s/g, "")) : 0);
  return multiplier ? Math.floor(base * Number(multiplier[1])) : base;
}

const rollDie = async faces => (await new foundry.dice.Roll(`1d${faces}`).evaluate()).total;

async function explode(term, face) {
  const threshold = explodeAt(term);
  let current = face;
  while (threshold && current.active && current.result >= threshold && !current.exploded) {
    current.exploded = true;
    current = { result: await rollDie(term.faces), active: true, fromExplosion: true };
    term.results.push(current);
  }
}

export async function raiseDice(roll, raises) {
  for (const { die, result, amount } of raises) {
    const term = roll.dice[die];
    const face = term?.results[result];
    if (!face?.active) continue;
    face.result = Math.min(term.faces, face.result + amount);
    await explode(term, face);
  }
  roll._total = rollTotal(roll);
  return roll;
}

const SUCCESS_SPAN = /<br><span style="color:(?:green|red);font-weight:bold;">[^<]*<\/span>$/;
const successSpan = success => `<br><span style="color:${success ? "green" : "red"};font-weight:bold;">${localize(success ? "SYSTEM.Dice.Success" : "SYSTEM.Dice.Failure")}</span>`;

function updatedFlavor(message, roll) {
  if (roll.options?.dc == null || !message.flavor || !SUCCESS_SPAN.test(message.flavor)) return {};
  return { flavor: message.flavor.replace(SUCCESS_SPAN, successSpan(roll.total >= roll.options.dc)) };
}

// What a total means, from the purpose the roll was made with.
export function outcomeOf(purpose, total, dc = null) {
  if (!purpose || total == null) return null;
  const range = purpose.outcomes?.find(outcome => total >= (outcome.min ?? -Infinity) && total <= (outcome.max ?? Infinity));
  if (range) return { text: range.text, good: range.good ?? null };
  const needs = purpose.needs ?? dc;
  if (needs == null) return null;
  const success = total >= needs;
  return { text: success ? purpose.success ?? localize("SYSTEM.Dice.Success") : purpose.failure ?? localize("SYSTEM.Dice.Failure"), good: success };
}

const raisableFaces = roll => roll.dice.flatMap((die, dieIndex) => die.results.map((result, resultIndex) => ({ die, dieIndex, result, resultIndex })))
  .filter(({ die, result }) => result.active && result.result < die.faces);

// Rolls without consequences (skill checks) can be raised at any time.
export const freelyRaisable = message => !!message?.rolls.length && !confirmOf(message)
  && message.rolls[0].options?.dc != null && raisableFaces(message.rolls[0]).length > 0;

async function spendOnRaise(message, pool, cost) {
  await pool.spend(cost, format("SYSTEM.Confirm.RaisedBy", { name: escape(speakerActor(message)?.name), count: cost }));
}

export async function raiseFreely(message, pool) {
  new RollPrompt({ message, free: true, pool }).render({ force: true });
}

// raises: [{ die, result, amount }]. Free raises change a finished skill check; the rest go to the waiting roller.
export async function spendRaises(message, pool, raises, { free = false } = {}) {
  const cost = raises.reduce((sum, raise) => sum + raise.amount, 0);
  if (!cost) return false;
  if (cost > pool.count()) {
    pool.notEnough(cost);
    return false;
  }
  await spendOnRaise(message, pool, cost);
  if (!free) {
    await confirmRollOp(message, "raise", { raises });
    return true;
  }
  const roll = await raiseDice(message.rolls[0], raises);
  await message.update({ rolls: [roll], ...updatedFlavor(message, roll) });
  return true;
}

async function finishRoll(message, roll, accepted) {
  const confirm = confirmOf(message);
  const outcome = outcomeOf(confirm?.purpose, roll.total, roll.options?.dc);
  const update = { rolls: [roll], ...updatedFlavor(message, roll) };
  if (accepted) {
    update[`flags.${SYSTEM_ID}.${CONFIRM_FLAG}.state`] = "accepted";
    if (outcome) update.flavor = `${update.flavor ?? message.flavor ?? ""}<br><strong>${escape(outcome.text)}</strong>`;
  }
  await message.update(update);
  if (!accepted) return;
  pending.get(message.id)?.();
  pending.delete(message.id);
}

const shouldWait = actor => !!game.settings.get(SYSTEM_ID, ALWAYS_SETTING) || poolFor(actor).count() > 0;

async function handleOp({ messageId, op, raises = [], bonus = 0, advantage = null }) {
  const message = game.messages.get(messageId);
  const confirm = confirmOf(message);
  if (!message || !isPending(message)) return;
  if (op === "roll" && confirm.state === "setup") {
    const RollClass = ROLL_CLASSES[confirm.setup.rollClass ?? "Roll"]();
    const roll = await new RollClass(setupFormula(confirm.setup, Math.max(0, bonus), advantage ?? confirm.setup.advantage), {}, confirm.setup.options ?? {}).evaluate();
    const actor = confirm.actorUuid ? fromUuidSync(confirm.actorUuid) : null;
    const waits = shouldWait(actor);
    if (waits) await message.update({ [`flags.${SYSTEM_ID}.${CONFIRM_FLAG}.state`]: "pending" });
    return finishRoll(message, roll, !waits);
  }
  if (confirm.state !== "pending") return;
  const roll = message.rolls[0];
  if (op === "raise") await raiseDice(roll, raises);
  return finishRoll(message, roll, op === "accept");
}

// The client that made the roll is waiting on it, so it applies every change.
export async function confirmRollOp(message, op, data = {}) {
  const payload = { messageId: message.id, op, ...data };
  if (message.isAuthor || (game.user.isGM && !message.author?.active)) return handleOp(payload);
  emitToUser(message.author.id, CONFIRM_ACTION, payload);
}

// source is an evaluated Roll, or a setup the decider rolls themselves after adding dice or Advantage.
// purpose explains the roll: { title, text, needs, success, failure, outcomes: [{ min, max, text }] }.
export async function postRoll(source, chatData = {}, { actor = null, confirm = true, rollMode = null, purpose = null } = {}) {
  const prompt = confirm && !(source instanceof foundry.dice.Roll) && !!game.settings.get(SYSTEM_ID, PROMPT_SETTING);
  const setup = prompt ? source : null;
  let roll = source instanceof foundry.dice.Roll ? source : null;
  if (!roll && !prompt) roll = await new (ROLL_CLASSES[source.rollClass ?? "Roll"]())(setupFormula(source), {}, source.options ?? {}).evaluate();
  if (roll && !roll._evaluated) await roll.evaluate();
  const confirmer = confirmerFor(actor);
  const state = !confirm ? "accepted" : setup ? "setup" : shouldWait(actor) ? "pending" : "accepted";
  const flags = { ...chatData.flags, [SYSTEM_ID]: { ...chatData.flags?.[SYSTEM_ID], [CONFIRM_FLAG]: {
    state, userId: confirmer?.id ?? null, actorUuid: actor?.uuid ?? null, purpose, ...(setup ? { setup } : {})
  } } };
  const automatic = !(source instanceof foundry.dice.Roll);
  let flavor = (automatic && purpose?.text) || chatData.flavor || purpose?.text || "";
  if (roll?.options?.dc != null && !SUCCESS_SPAN.test(flavor)) flavor += successSpan(roll.total >= roll.options.dc);
  const data = { speaker: ChatMessage().getSpeaker({ actor }), ...chatData, flavor, flags, rolls: roll ? [roll] : [] };
  if (rollMode) foundry.documents.ChatMessage.applyRollMode(data, rollMode);
  const message = await ChatMessage().create(data);
  if (state === "accepted" || !message) return { roll, message };
  await new Promise(resolve => pending.set(message.id, resolve));
  const final = game.messages.get(message.id) ?? message;
  return { roll: final.rolls[0], message: final };
}

export class RollPrompt extends HandlebarsApplicationMixin(ApplicationV2) {
  static instances = new Map();

  static DEFAULT_OPTIONS = {
    classes: ["explorers", "roll-prompt"],
    position: { width: 360 },
    window: { icon: "fa-solid fa-dice" },
    actions: {
      bonus: RollPrompt.#onBonus,
      step: RollPrompt.#onStep,
      roll: RollPrompt.#onRoll,
      raise: RollPrompt.#onRaise,
      accept: RollPrompt.#onAccept
    }
  };

  static PARTS = { body: { template: filePath("templates/roll/roll-prompt.hbs") } };

  static open(message) {
    const existing = RollPrompt.instances.get(message.id);
    if (existing) return existing.render({ force: true });
    const prompt = new RollPrompt({ message });
    RollPrompt.instances.set(message.id, prompt);
    prompt.render({ force: true });
  }

  constructor(options) {
    super({ id: `roll-prompt-${options.message.id}${options.free ? "-free" : ""}`, ...options });
    this.message = options.message;
    this.free = !!options.free;
    this.freePool = options.pool ?? null;
    this.bonus = 0;
    this.advantage = null;
    this.steps = new Map();
  }

  get confirm() { return confirmOf(game.messages.get(this.message.id) ?? this.message); }
  get liveMessage() { return game.messages.get(this.message.id) ?? this.message; }
  get title() { return this.confirm?.purpose?.title ?? this.liveMessage.flavor?.replace(/<[^>]+>/g, " ").trim() ?? localize("SYSTEM.Confirm.Title"); }
  get pool() {
    if (this.freePool) return this.freePool;
    const actor = this.confirm?.actorUuid ? fromUuidSync(this.confirm.actorUuid) : null;
    return poolFor(actor);
  }

  async _prepareContext() {
    const message = this.liveMessage;
    const confirm = this.confirm ?? {};
    const purpose = confirm.purpose ?? null;
    const text = purpose?.text ?? message.flavor ?? "";
    if (confirm.state === "setup") {
      const advantage = this.advantage ?? confirm.setup.advantage ?? "normal";
      return {
        setup: true, text, bonus: this.bonus, formula: setupFormula(confirm.setup, this.bonus, advantage),
        advantages: Object.entries(ADVANTAGES).map(([value, label]) => ({ value, label: localize(label), selected: value === advantage }))
      };
    }
    const roll = message.rolls[0];
    const pool = this.pool;
    const spent = [...this.steps.values()].reduce((sum, step) => sum + step, 0);
    const left = pool.count() - spent;
    const faces = roll.dice.flatMap((die, dieIndex) => die.results.map((result, resultIndex) => {
      const key = `${dieIndex}.${resultIndex}`;
      const step = this.steps.get(key) ?? 0;
      const raisable = result.active && pool.count() > 0;
      return {
        key, value: result.result + step, raised: step > 0, active: result.active, exploded: !!result.exploded,
        canLower: step > 0, canRaise: raisable && result.result + step < die.faces && left > 0
      };
    }));
    const preview = spent ? rollTotal({ formula: roll.formula, dice: roll.dice.map((die, dieIndex) => ({ ...die,
      results: die.results.map((result, resultIndex) => ({ ...result, result: result.result + (this.steps.get(`${dieIndex}.${resultIndex}`) ?? 0) })) })) }) : null;
    const outcome = outcomeOf(purpose, preview ?? roll.total, roll.options?.dc);
    return {
      setup: false, text, formula: roll.formula, total: roll.total, preview, faces,
      outcome: outcome?.text ?? null, outcomeClass: outcome?.good === true ? "good" : outcome?.good === false ? "bad" : "",
      canSpend: pool.count() > 0, spent, left, tokens: localize(pool.label ?? "SYSTEM.DungeonTokens.Title"),
      free: this.free
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.element.querySelector("select[name=advantage]")?.addEventListener("change", event => {
      this.advantage = event.target.value;
      this.render();
    });
  }

  _onClose(options) {
    super._onClose(options);
    if (RollPrompt.instances.get(this.message.id) === this) RollPrompt.instances.delete(this.message.id);
  }

  static #onBonus(event, target) {
    this.bonus = Math.max(0, this.bonus + Number(target.dataset.step));
    this.render();
  }

  static #onStep(event, target) {
    const { key, step } = target.dataset;
    this.steps.set(key, Math.max(0, (this.steps.get(key) ?? 0) + Number(step)));
    this.render();
  }

  static async #onRoll() {
    await confirmRollOp(this.liveMessage, "roll", { bonus: this.bonus, advantage: this.advantage });
  }

  static async #onRaise() {
    const raises = [...this.steps].filter(([, amount]) => amount > 0).map(([key, amount]) => {
      const [die, result] = key.split(".").map(Number);
      return { die, result, amount };
    });
    this.steps.clear();
    if (await spendRaises(this.liveMessage, this.pool, raises, { free: this.free }) && this.free) this.close();
    else this.render();
  }

  static async #onAccept() {
    await confirmRollOp(this.liveMessage, "accept");
    this.close();
  }
}

function renderWaiting(message, html) {
  const confirm = confirmOf(message);
  if (!isPending(message)) return;
  const content = html.querySelector?.(".message-content") ?? html;
  const bar = document.createElement("div");
  bar.className = "roll-confirm";
  const name = escape(game.users.get(confirm.userId)?.name);
  bar.innerHTML = `<p class="hint">${format(confirm.state === "setup" ? "SYSTEM.Confirm.WaitingRoll" : "SYSTEM.Confirm.Waiting", { name })}</p>`;
  if (game.user.isGM || game.user.id === confirm.userId) {
    bar.insertAdjacentHTML("beforeend", `<button type="button"><i class="fa-solid fa-up-right-from-square"></i> ${localize("SYSTEM.Confirm.Open")}</button>`);
    bar.querySelector("button").addEventListener("click", () => RollPrompt.open(message));
  }
  content.append(bar);
}

function syncPrompt(message) {
  const confirm = confirmOf(message);
  const open = RollPrompt.instances.get(message.id);
  if (!isPending(message)) return open?.close();
  if (open) return open.render();
  if (confirm.userId === game.user.id) RollPrompt.open(message);
}

export function registerRollConfirmHooks() {
  registerSocketHandler(CONFIRM_ACTION, handleOp);
  Hooks.on("renderChatMessageHTML", renderWaiting);
  Hooks.on("createChatMessage", syncPrompt);
  Hooks.on("updateChatMessage", syncPrompt);
}
