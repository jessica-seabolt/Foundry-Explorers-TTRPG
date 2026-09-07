const { Roll, terms: { Die } } = foundry.dice;

// options.dc: The DC set for this roll. Can be undefined.
export class ExplorersRoll extends Roll {
  get success() { return this.options.dc !== null ? this.total >= this.options.dc : null; }

  constructor(formula, data, options={}) {
    super(formula, data, options);
    if (options.dc === undefined) options.dc = null;
  }
}

export class ExplorersDie extends Die {
  async explode(modifier, recursive) {
    const explode = await super.explode(modifier, recursive);
    for (let i=this.number;i<this.results.length;i++) {
      this.results[i].fromExplosion = true;
    }
    return explode;
  }

  async reroll(modifier, recursive) { // adding taking advantage/disadvantage in rerolls
    const reroll = await super.reroll(modifier, recursive);
    let rerollLower;
    if (modifier.includes("<")) rerollLower = true
    else if (modifier.includes(">")) rerollLower = false
    else return reroll;
    for (let i=0,j=this.number;i<this.number;i++) {
      const baseDie = this.results[i];
      if (!baseDie.rerolled) continue;
      const explodedDie = this.results[j];
      if (rerollLower ? explodedDie.result < baseDie.result : explodedDie.result > baseDie.result) {
        baseDie.active = true;
        baseDie.discarded = false;
        baseDie.rerolled = false;
        explodedDie.active = false;
        explodedDie.discarded = true;
        explodedDie.rerolled = true;
      }
      j++;
    }
    return reroll;
  }
}