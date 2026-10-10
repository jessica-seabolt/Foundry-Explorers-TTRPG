// Features (class abilities, class and specialization features, Rare Qualities, origins) are Items of type "Feature".
// Each can carry `rules`: small JSON objects the system acts on. This module reads them and answers questions such as
// "what's this Pokemon's proficiency in Influence?" or "how much extra Move Power does this move get?".
// Rule types are documented in RULE_TYPES below, which the feature sheet also shows as a reference.

export const featureCategories = {
  classAbility: "SYSTEM.Features.Categories.ClassAbility",
  classFeature: "SYSTEM.Features.Categories.ClassFeature",
  specializationFeature: "SYSTEM.Features.Categories.SpecializationFeature",
  rareQuality: "SYSTEM.Features.Categories.RareQuality",
  origin: "SYSTEM.Features.Categories.Origin",
  other: "SYSTEM.Features.Categories.Other",
};

// Class data from the rulebook (HP per level as corrected by the v1.1 update)
export const classData = {
  explorer: { baseHp: 25, hpPerLevel: 15, majorSkills: ['tracking', 'ecology', 'sneak'],
    minorSkillOptions: ['memory', 'traps', 'logic', 'endurance', 'strength', 'awareness', 'movement'] },
  missionExpert: { baseHp: 25, hpPerLevel: 15, majorSkills: ['tracking', 'ecology', 'sneak'],
    minorSkillOptions: ['intuition', 'memory', 'traps', 'logic', 'physicalStatusResistance', 'specialStatusResistance', 'movement'] },
  strategist: { baseHp: 20, hpPerLevel: 10, majorSkills: ['memory', 'traps', 'logic'],
    minorSkillOptions: ['tracking', 'ecology', 'sneak', 'endurance', 'physicalStatusResistance', 'awareness', 'specialStatusResistance', 'movement'] },
  icon: { baseHp: 20, hpPerLevel: 10, majorSkills: ['influence', 'deceive', 'intuition'],
    minorSkillOptions: ['tracking', 'ecology', 'sneak', 'memory', 'traps', 'logic', 'movement'] },
  guardian: { baseHp: 30, hpPerLevel: 20, majorSkills: ['endurance'],
    minorSkillOptions: ['influence', 'intuition', 'ecology', 'traps', 'strength', 'physicalStatusResistance', 'specialStatusResistance'] },
  brawler: { baseHp: 25, hpPerLevel: 15, majorSkills: ['strength'],
    minorSkillOptions: ['influence', 'tracking', 'sneak', 'traps', 'endurance', 'physicalStatusResistance', 'movement'] },
  specialist: { baseHp: 25, hpPerLevel: 15, majorSkills: ['awareness'],
    minorSkillOptions: ['deceive', 'intuition', 'ecology', 'logic', 'endurance', 'specialStatusResistance', 'movement'] },
};
export const MINOR_SKILL_CHOICES = 3;

// Natures and their Aura colours
export const natures = {
  quiet: "Blue", bold: "Violet", mild: "Brown", modest: "Turquoise", relaxed: "Green", sassy: "Yellow",
  lonely: "Sapphire", rash: "Pearl", impish: "Magenta", serious: "Black", gentle: "Mint", hardy: "Scarlet",
  calm: "Olive", docile: "Diamond", adamant: "Orange", naive: "White", jolly: "Pink", lax: "Platinum",
  careful: "Purple", bashful: "Gold", hasty: "Red", naughty: "Ruby", brave: "Silver", timid: "Emerald", quirky: "Lime",
};
export const auraColors = {
  Blue: "#3b6fd6", Violet: "#8f5bd6", Brown: "#8a5a2b", Turquoise: "#30c5c0", Green: "#3fa34d", Yellow: "#e8cf3a",
  Sapphire: "#1f3fa0", Pearl: "#e8e0d0", Magenta: "#d63aa8", Black: "#222222", Mint: "#98e2c6", Scarlet: "#d62828",
  Olive: "#808000", Diamond: "#b9f2ff", Orange: "#f28c28", White: "#f5f5f5", Pink: "#f4a6c6", Platinum: "#d9d9d6",
  Purple: "#7a3fb0", Gold: "#d4af37", Red: "#e03131", Ruby: "#9b111e", Silver: "#c0c0c0", Emerald: "#2e8b57", Lime: "#9acd32",
};

/** The Aura colour of a Nature written like "Quiet" or "Quiet Nature", or null for a custom Nature. */
export function auraOfNature(nature = "") {
  const key = nature.trim().toLowerCase().replace(/\s*nature$/, "");
  return natures[key] ?? null;
}

/** Reference for the rule types, shown on the feature sheet. */
export const RULE_TYPES = {
  skill: '{"type":"skill","skill":"influence","proficiency":"major"}',
  skillDice: '{"type":"skillDice","skill":"awareness","dice":1}',
  hpPerLevel: '{"type":"hpPerLevel","amount":5}',
  visibility: '{"type":"visibility","amount":5}',
  statModifier: '{"type":"statModifier","stat":"def","amount":2,"whenUserStatus":"any","whenAura":null}  ("stat" can be a list)',
  permanentCondition: '{"type":"permanentCondition","condition":"magicCoat"}',
  conditionImmunity: '{"type":"conditionImmunity","conditions":["paralyzed"]}',
  bypassConditionImmunity: '{"type":"bypassConditionImmunity","conditions":["poisoned","badlyPoisoned"]}',
  statLowerImmunity: '{"type":"statLowerImmunity","stats":["def"],"fromOthers":false}  (or ["all"])',
  statChange: '{"type":"statChange","mode":"double"}  (or "invert")',
  onStatLowered: '{"type":"onStatLowered","effects":[{"effect":"atkUp","effectCount":2}]}',
  onConditionGained: '{"type":"onConditionGained","conditions":["flinched"],"effects":[{"effect":"speUp","effectCount":2}],"cure":false}  ("any" for any harmful one)',
  reflectConditions: '{"type":"reflectConditions","conditions":["burned","paralyzed","poisoned"]}',
  damageTaken: '{"type":"damageTaken","multiplier":0.5,"moveTypes":["fire"],"physical":false,"special":false,"whenFullHp":false,"superEffective":false}',
  magicGuard: '{"type":"magicGuard"}',
  endure: '{"type":"endure","fromFullHp":true}  (or "once":true, "key":"focusBand", "chance":3, "perBattle":true)',
  noRecoil: '{"type":"noRecoil"}',
  onDamaged: '{"type":"onDamaged","stealAttackerItem":false,"physical":true,"moveTypes":["fire"],"tag":"wind","critical":false,"chance":5,"effects":[],"attackerEffects":[{"effect":"burned"}],"attackerDamage":"1d6","selfDamage":null}',
  onHpBelow: '{"type":"onHpBelow","fraction":0.5,"effects":[{"effect":"spatkUp","effectCount":2}],"heal":{"percent":25}}',
  moveType: '{"type":"moveType","from":"normal","tag":null,"to":"flying"}  (no "from" or "tag" changes every move)',
  movePower: '{"type":"movePower","amount":1,"physical":true,"special":true,"tag":"punch","moveType":null,"healing":false,"stab":false,"maxLevel":null,"priority":false,"opportunity":false,"whenUserStatus":null,"whenUserHp":null,"whenTargetStatus":null,"removeSecondary":false}',
  critRange: '{"type":"critRange","min":5}',
  statusCheckDice: '{"type":"statusCheckDice","dice":1}',
  steamroll: '{"type":"steamroll","moveTypes":null,"matchups":["notVeryEffective","mostlyIneffective","immune"]}',
  liquidOoze: '{"type":"liquidOoze"}',
  ignoreTargetStatChanges: '{"type":"ignoreTargetStatChanges"}',
  onHit: '{"type":"onHit","physical":true,"chance":6,"targetEffects":[{"effect":"poisoned"}],"stealHeldItem":false}',
  keepHeldItem: '{"type":"keepHeldItem"}  (Sticky Hold: its Held Item cannot be stolen)',
  pickupRange: '{"type":"pickupRange","tiles":4}  (picks up floor items this far from its path)',
  onKnockOut: '{"type":"onKnockOut","effects":[{"effect":"atkUp","effectCount":2}]}',
  typeImmunity: '{"type":"typeImmunity","moveType":"water","heal":true,"effects":[]}',
  tagImmunity: '{"type":"tagImmunity","tag":"sound"}',
  noCritsAgainst: '{"type":"noCritsAgainst"}',
  filter: '{"type":"filter"}',
  incomingMovePower: '{"type":"incomingMovePower","amount":1}',
  ignoreSecondary: '{"type":"ignoreSecondary"}',
  extraPpCost: '{"type":"extraPpCost","amount":1}',
  range: '{"type":"range","physical":true,"special":false,"from":"front","to":"away","count":2}  (or "countBonus":1)',
  pierce: '{"type":"pierce"}',
  shootThroughAllies: '{"type":"shootThroughAllies"}',
  onTurnEnd: '{"type":"onTurnEnd","effects":[{"effect":"speUp","effectCount":2}],"damage":null}',
  poisonHeal: '{"type":"poisonHeal"}',
  earlyBird: '{"type":"earlyBird"}',
  ignoreHeldItem: '{"type":"ignoreHeldItem"}  (Klutz)',
  onTurnStart: '{"type":"onTurnStart","damage":"1d6","effects":[]}',
  blockStatusMoves: '{"type":"blockStatusMoves"}  (Assault Vest)',
  bellyNeed: '{"type":"bellyNeed","multiplier":2}  (Munch Band)',
  onHeldItemLost: '{"type":"onHeldItemLost","effects":[{"effect":"speUp","effectCount":2}]}  (Unburden)',
  _consume: 'Add "consume": true to a held item\'s rule to use the item up when it triggers (Berries, Gems).',
};

/* -------------------------------------------- */
/*  Reading rules                               */
/* -------------------------------------------- */

/**
 * All rules of a type from an actor's Features and its held item (unless a Feature like Klutz ignores held items).
 * Rules from the held item carry its id as `itemId`, so a trigger can use the item up (Berries, Gems).
 */
export function getRules(actor, type) {
  if (!actor?.items) return [];
  const rules = [];
  const collect = (item, extra = {}) => {
    for (const rule of item.system.rules ?? []) {
      if (rule?.type === type) rules.push({ ...rule, source: item.name, ...extra });
    }
  };
  const features = actor.items.filter(item => item.type === "Feature");
  for (const feature of features) collect(feature);
  const held = heldItemOf(actor);
  const klutz = features.some(feature => (feature.system.rules ?? []).some(rule => rule?.type === "ignoreHeldItem"));
  if (held && !klutz) collect(held, { itemId: held.id });
  return rules;
}

/** The Item an actor is holding, if any. */
export function heldItemOf(actor) {
  const id = actor?.system?.heldItem;
  if (!id) return null;
  const item = actor.items.get?.(id) ?? actor.items.find?.(other => other.id === id);
  return item?.type === "Item" ? item : null;
}

export const hasRule = (actor, type) => getRules(actor, type).length > 0;
const asArray = value => value == null ? [] : Array.isArray(value) ? value : [value];

/** Whether an actor has a Condition, counting permanent ones from Features (e.g. Magic Bounce). */
export function hasCondition(actor, condition) {
  if (actor?.statuses?.has(condition)) return true;
  return getRules(actor, "permanentCondition").some(rule => rule.condition === condition);
}

// The harmful Status Conditions, which "has a Status Condition" (Guts, Marvel Scale) refers to.
// Beneficial ones like Eyedrop, Magic Coat or Invulnerable don't count.
export const AFFLICTIONS = new Set([
  'paralyzed', 'burned', 'poisoned', 'badlyPoisoned', 'frozen', 'asleep', 'flinched', 'confused', 'restrained',
  'blinded', 'yawning', 'trapped', 'frightened', 'silenced', 'infatuated', 'taunted'
]);

/** Checks a rule's "whenUserStatus" condition: a list of Conditions, or "any" for any harmful Status Condition. */
function statusMatches(actor, wanted) {
  if (!wanted) return true;
  if (wanted === "any") return [...(actor?.statuses ?? [])].some(status => AFFLICTIONS.has(status));
  return asArray(wanted).some(status => actor?.statuses?.has(status));
}

function hpMatches(actor, wanted) {
  if (!wanted) return true;
  const { raw, max } = actor.system.hp;
  if (wanted === "full") return raw >= max;
  if (wanted === "above50") return raw > max / 2;
  if (wanted === "below50") return raw < max / 2;
  return true;
}

/** Whether a rule's move filters (physical/special, type, tag, healing, ...) match a move. */
function moveMatches(rule, { move, moveType, isPhysical, isStab, opportunity }) {
  const system = move.system;
  const damaging = system.power > 0;
  if (rule.physical === true && rule.special !== true && !(isPhysical && damaging)) return false;
  if (rule.special === true && rule.physical !== true && !(!isPhysical && damaging)) return false;
  if (rule.physical === true && rule.special === true && !damaging) return false;
  if (rule.tag && !system.hasTag?.(rule.tag)) return false;
  if (rule.moveType && rule.moveType !== moveType) return false;
  if (rule.healing && !system.hasTag?.('healPower')) return false;
  if (rule.stab && !isStab) return false;
  if (rule.maxLevel && system.level > rule.maxLevel) return false;
  if (rule.priority && !system.hasTag?.('priority')) return false;
  if (rule.opportunity && !opportunity) return false;
  return true;
}

/* -------------------------------------------- */
/*  Character data                              */
/* -------------------------------------------- */

const PROFICIENCY_RANK = { untrained: 0, minor: 1, major: 2 };

/** Effective proficiency in every skill: the sheet's choice, raised by the class's Major Skills and skill rules. */
export function effectiveProficiencies(actor, baseSkills, className) {
  const result = { ...baseSkills };
  const raise = (skill, proficiency) => {
    if (!(skill in result)) return;
    if (PROFICIENCY_RANK[proficiency] > PROFICIENCY_RANK[result[skill]]) result[skill] = proficiency;
  };
  for (const skill of classData[className]?.majorSkills ?? []) raise(skill, 'major');
  for (const rule of getRules(actor, "skill")) raise(rule.skill, rule.proficiency ?? 'major');
  return result;
}

export const skillBonusDice = (actor, skill) =>
  getRules(actor, "skillDice").filter(rule => rule.skill === skill).reduce((sum, rule) => sum + (rule.dice ?? 1), 0);
export const visibilityBonus = actor => getRules(actor, "visibility").reduce((sum, rule) => sum + (rule.amount ?? 0), 0);
export const hpPerLevelBonus = actor => getRules(actor, "hpPerLevel").reduce((sum, rule) => sum + (rule.amount ?? 0), 0);

/** Flat modifier changes from Features (e.g. Marvel Scale: +2 Def while afflicted). */
export function statModifierBonus(actor, stat) {
  return getRules(actor, "statModifier")
    .filter(rule => asArray(rule.stat).includes(stat) && statusMatches(actor, rule.whenUserStatus))
    .filter(rule => !rule.whenAura || rule.whenAura === actor.system?.auraColor)
    .reduce((sum, rule) => sum + (rule.amount ?? 0), 0);
}

/* -------------------------------------------- */
/*  Using moves                                 */
/* -------------------------------------------- */

/** The Type a move has when this Pokemon uses it (Aerilate, Normalize, Liquid Voice, ...). */
export function effectiveMoveType(actor, move) {
  let type = move.system.type;
  for (const rule of getRules(actor, "moveType")) {
    if (rule.tag && !move.system.hasTag?.(rule.tag)) continue;
    if (rule.from && rule.from !== type) continue;
    type = rule.to;
  }
  return type;
}

/**
 * Move Power changes from the user's Features, and the target's (No Guard), for one use of a move.
 * @returns {{amount: number, sources: string[], removeSecondary: boolean, consumed: string[]}}  consumed: held items used up
 */
export function movePowerBonus(actor, move, { target = null, moveType, isPhysical, isStab, opportunity = false } = {}) {
  const context = { move, moveType, isPhysical, isStab, opportunity };
  let amount = 0;
  let removeSecondary = false;
  const sources = [];
  const consumed = [];
  for (const rule of getRules(actor, "movePower")) {
    if (!moveMatches(rule, context)) continue;
    if (!statusMatches(actor, rule.whenUserStatus) || !hpMatches(actor, rule.whenUserHp)) continue;
    if (rule.whenTargetStatus && !(target && statusMatches(target, rule.whenTargetStatus))) continue;
    amount += rule.amount ?? 1;
    removeSecondary ||= !!rule.removeSecondary;
    sources.push(rule.source);
    if (rule.consume && rule.itemId) consumed.push(rule.itemId);
  }
  if (target && move.system.power > 0) {
    for (const rule of getRules(target, "incomingMovePower")) {
      amount += rule.amount ?? 1;
      sources.push(rule.source);
    }
  }
  return { amount, sources, removeSecondary, consumed };
}

/** Whether a target ignores a move entirely: a type immunity (Levitate, Water Absorb) or a tag immunity (Soundproof). */
export function moveImmunity(target, move, moveType) {
  const typeRule = getRules(target, "typeImmunity").find(rule => rule.moveType === moveType);
  if (typeRule) return typeRule;
  return getRules(target, "tagImmunity").find(rule => move.system.hasTag?.(rule.tag)) ?? null;
}

/** The lowest die face that scores a Critical Hit for this user (Super Luck lowers it to 5). */
export const critRangeMin = actor => Math.min(6, ...getRules(actor, "critRange").map(rule => rule.min ?? 5));

/* -------------------------------------------- */
/*  Targeting                                   */
/* -------------------------------------------- */

/** A move's range after Features like Long Reach and Focused Shot. */
export function effectiveRange(actor, move) {
  const system = move.system;
  let range = system.range;
  let rangeCount = system.rangeCount;
  for (const rule of getRules(actor, "range")) {
    if (rule.physical && !system.isPhysical) continue;
    if (rule.special && system.isPhysical) continue;
    if (rule.from && rule.from !== range) continue;
    if (rule.to) {
      range = rule.to;
      rangeCount = rule.count ?? rangeCount;
    }
    if (rule.countBonus) rangeCount = (rangeCount ?? 1) + rule.countBonus;
  }
  return { range, rangeCount };
}
