import { effects, skillToAbility, statConditions, valueEffects } from './module/types.mjs';

export const SYSTEM_ID = 'explorers';
export const skillToDie = {
  untrained: 1,
  minor: 2,
  major: 3
}
export const filePath = path => `systems/${SYSTEM_ID}/${path}`;
export const toModString = mod => mod >= 0 ? `+${mod}` : mod.toString();
export function getDieString({ sides, modifier, advantage = 'normal', multiplier = 1, highCrit = false }) {
  const modString = modifier !== 0 ? toModString(modifier) : "";
  const advString = advantage == 'normal' ? "" : advantage == 'advantage' ? "r<3" : "r>3";
  return `${multiplier != 1 ? "floor((" : ""}${sides}d6${advString}x${highCrit ? ">=5" : ""}${modString}${multiplier != 1 ? `) * ${multiplier})` : ""}`;
}
export function getMoveDie(actor, move) {
  return move.system.power > 0 ? getDamageDie(actor, move) : getStatusDie(actor, move);
}
export function getDamageDie(actor, move) {
  const model = actor.system;
  let isPhysical = move.system.isPhysical;
  if (move.system.hasTag('usesHighestOffense')) isPhysical = model.abilities.atk.mod > model.abilities.spatk.mod;
  if (move.system.hasTag('changeOffense')) isPhysical = !isPhysical;
  return {
    sides: move.system.power, 
    modifier: isPhysical ? model.abilities.atk.mod : model.abilities.spatk.mod
  };
}
export function getStatusDie(actor, move) {
  if (!move.system.getTriggerTypes().has('hit')) return null;
  if (move.system.offensiveCheck) return getSkillDie(actor, move.system.offensiveCheck);
  const model = actor.system;
  const baseModifier = move.system.isPhysical ? model.abilities.atk.mod : model.abilities.spatk.mod;
  return { sides: move.system.isStatus ? 2 : 1, modifier: baseModifier };
}
export function getSkillDie(actor, skill) {
  const proficiency = actor.system.skills[skill];
  const abilityName = skillToAbility[skill];
  const ability = abilityName === "hp" ? actor.system.hp : actor.system.abilities[abilityName];
  return { sides: skillToDie[proficiency], modifier: ability.mod }
}
export function toMoveString(move) {
  const moveDie = getMoveDie(this.document, move);
  if (!moveDie) return "Use";
  const { sides, modifier } = moveDie;
  return getDieString({ sides, modifier });
}
export function toSkillString(skill) {
  const { sides, modifier } = getSkillDie(this.document, skill);
  return getDieString({ sides, modifier });
}
export function toFormGroup(object) {
  return Object.entries(object).map(([value, label]) => ({ value, label }));
}
export function hasEffectCount(effectName) {
  return isStatCondition(effectName) || valueEffects.has(effectName);
}
export function isStatCondition(effectName) {
  return !!statConditions[effectName];
}
export function isEffect(effectName) {
  return !!effects[effectName];
}