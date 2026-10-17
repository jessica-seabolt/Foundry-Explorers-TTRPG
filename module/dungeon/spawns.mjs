const WILD_FOLDER = "Wild Pokémon";

export async function resolveDocument(uuid) {
  if (!uuid) return null;
  const document = await fromUuid(uuid).catch(() => null);
  if (document) return document;
  const match = uuid.match(/^Compendium\.[^.]+\.[^.]+\.(\w+)\.(\w+)$/);
  if (!match) return null;
  const [, documentName, id] = match;
  for (const pack of game.packs.filter(pack => pack.documentName === documentName)) {
    if (pack.index.has(id)) return pack.getDocument(id);
  }
  return null;
}

export async function rollTableDocument(table) {
  if (!table) return null;
  const { results } = await table.roll();
  const result = results.find(result => result.documentUuid);
  return result ? resolveDocument(result.documentUuid) : null;
}

export async function worldActorFor(document) {
  if (!(document instanceof Actor)) return null;
  if (!document.pack) return document;
  const existing = game.actors.find(actor => actor._stats?.compendiumSource?.endsWith(`.Actor.${document.id}`));
  if (existing) return existing;
  const folder = game.folders.find(folder => folder.type === "Actor" && folder.name === WILD_FOLDER)
    ?? await Folder.implementation.create({ name: WILD_FOLDER, type: "Actor" });
  return game.actors.importFromCompendium(game.packs.get(document.pack), document.id, { folder: folder.id });
}

export async function wildTokenData(actor, position, { asleepChance = 0 } = {}) {
  const token = (await actor.getTokenDocument(position)).toObject();
  if (!token.actorLink && Math.random() * 100 < asleepChance) {
    const asleep = (await ActiveEffect.implementation.fromStatusEffect("asleep")).toObject();
    token.delta = { ...token.delta, effects: [...(token.delta?.effects ?? []), asleep] };
  }
  return token;
}
