// Converts compendium packs between their LevelDB databases (packs/, built, not committed) and JSON source
// files (packs-src/, committed: one file per document). The JSON layout matches Foundry's official CLI
// (@foundryvtt/foundryvtt-cli): each document has a `_key`, with embedded documents nested inside their parent.
//
// Usage (Foundry must be closed, since it locks the databases):
//   tools/packs.cmd build      JSON source -> LevelDB packs
//   tools/packs.cmd extract    LevelDB packs -> JSON source
// Or with Node.js installed: node tools/packs.mjs <build|extract> [pack ...]

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIR = path.join(ROOT, "packs-src");
const PACK_FILES = /^(\d+\.(ldb|log)|CURRENT|LOCK|LOG|LOG\.old|MANIFEST-\d+)$/;

// Which top-level collection each pack type stores; anything else in a pack is never loaded by Foundry
const PACK_COLLECTIONS = { Actor: "actors", Item: "items", RollTable: "tables", JournalEntry: "journal", Macro: "macros", Scene: "scenes", Adventure: "adventures", Cards: "cards", Playlist: "playlists" };

/** Loads classic-level from the Foundry install named in foundry-config.yaml, so no npm install is needed. */
function loadClassicLevel() {
  const config = fs.readFileSync(path.join(ROOT, "foundry-config.yaml"), "utf8");
  const installPath = config.match(/installPath:\s*["']?(.+?)["']?\s*$/m)?.[1]?.replace(/\\\\/g, "\\");
  if (!installPath) throw new Error("Set installPath in foundry-config.yaml to your Foundry install folder.");
  const appDir = fs.existsSync(path.join(installPath, "resources", "app")) ? path.join(installPath, "resources", "app") : installPath;
  return createRequire(path.join(appDir, "package.json"))("classic-level").ClassicLevel;
}

function readPackList() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "system.json"), "utf8"));
  return manifest.packs.map(pack => ({ name: pack.name, type: pack.type, dir: path.join(ROOT, pack.path) }));
}

const slug = name => (name ?? "unnamed").normalize("NFKD").replace(/[^\w]+/g, "_").replace(/^_|_$/g, "").toLowerCase() || "unnamed";

/* -------------------------------------------- */
/*  Extract: LevelDB -> JSON                    */
/* -------------------------------------------- */

async function extractPack(ClassicLevel, pack) {
  await assertNotInUse(ClassicLevel, pack);
  const db = new ClassicLevel(pack.dir, { keyEncoding: "utf8", valueEncoding: "json" });
  const entries = new Map();
  for await (const [key, value] of db.iterator()) entries.set(key, value);
  await db.close();

  const collection = PACK_COLLECTIONS[pack.type];
  const parse = key => {
    const [, collectionPath, ids] = key.split("!");
    return { segments: collectionPath.split("."), ids: ids.split(".") };
  };
  const kept = new Map();
  const dropped = {};
  for (const [key, value] of entries) {
    const { segments } = parse(key);
    if (segments[0] === collection || (segments[0] === "folders" && segments.length === 1)) kept.set(key, value);
    else dropped[segments.join(".")] = (dropped[segments.join(".")] ?? 0) + 1;
  }

  // Nest embedded documents inside their parents, deepest first, replacing the parent's list of ids
  const embedded = [...kept.keys()].filter(key => parse(key).segments.length > 1)
    .sort((a, b) => parse(b).segments.length - parse(a).segments.length);
  for (const key of embedded) {
    const { segments, ids } = parse(key);
    const parentKey = `!${segments.slice(0, -1).join(".")}!${ids.slice(0, -1).join(".")}`;
    const parent = kept.get(parentKey);
    const field = segments.at(-1);
    if (!parent || !Array.isArray(parent[field])) throw new Error(`${pack.name}: no parent for ${key}`);
    const index = parent[field].indexOf(ids.at(-1));
    const document = { ...kept.get(key), _key: key };
    if (index === -1) parent[field].push(document);
    else parent[field][index] = document;
  }

  // Write one file per top-level document; folders go in a _folders subfolder
  const outDir = path.join(SOURCE_DIR, pack.name);
  fs.rmSync(outDir, { recursive: true, force: true });
  let count = 0;
  for (const [key, value] of kept) {
    const { segments, ids } = parse(key);
    if (segments.length > 1) continue;
    const isFolder = segments[0] === "folders";
    const dir = isFolder ? path.join(outDir, "_folders") : outDir;
    fs.mkdirSync(dir, { recursive: true });
    const document = { ...value, _key: key };
    fs.writeFileSync(path.join(dir, `${slug(value.name)}_${ids[0]}.json`), JSON.stringify(document, null, 2) + "\n");
    count++;
  }
  const droppedText = Object.keys(dropped).length ? `; dropped stray ${JSON.stringify(dropped)}` : "";
  console.log(`Extracted ${pack.name}: ${count} documents${droppedText}`);
}

/* -------------------------------------------- */
/*  Build: JSON -> LevelDB                      */
/* -------------------------------------------- */

function readSourceFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return readSourceFiles(full);
    return entry.name.endsWith(".json") ? [full] : [];
  });
}

/** Splits a document into LevelDB entries: embedded documents get their own keys, and parents keep their ids. */
function flatten(document, batch) {
  const { _key, ...value } = document;
  if (!_key) throw new Error(`Document ${document._id} (${document.name}) has no _key`);
  for (const [field, list] of Object.entries(value)) {
    if (!Array.isArray(list) || !list.some(item => item?._key?.startsWith("!"))) continue;
    value[field] = list.map(item => {
      flatten(item, batch);
      return item._id;
    });
  }
  batch.push({ type: "put", key: _key, value });
}

/** Fails before anything is touched if the pack is open elsewhere (Foundry locks the databases it has loaded). */
async function assertNotInUse(ClassicLevel, pack) {
  if (!fs.existsSync(path.join(pack.dir, "CURRENT"))) return;
  const db = new ClassicLevel(pack.dir, { keyEncoding: "utf8", valueEncoding: "json" });
  try {
    await db.open();
  } catch {
    throw new Error(`The ${pack.name} pack is in use. Close Foundry (or return to Setup) and try again.`);
  }
  await db.close();
}

async function buildPack(ClassicLevel, pack) {
  await assertNotInUse(ClassicLevel, pack);
  const files = readSourceFiles(path.join(SOURCE_DIR, pack.name));
  const batch = [];
  for (const file of files) flatten(JSON.parse(fs.readFileSync(file, "utf8")), batch);

  // Replace the database files, leaving anything else in the pack folder (like images) alone
  fs.mkdirSync(pack.dir, { recursive: true });
  for (const entry of fs.readdirSync(pack.dir)) {
    if (PACK_FILES.test(entry) || entry === "lost") fs.rmSync(path.join(pack.dir, entry), { recursive: true, force: true });
  }
  const db = new ClassicLevel(pack.dir, { keyEncoding: "utf8", valueEncoding: "json" });
  await db.batch(batch);
  await db.compactRange("\x00", "\xff");
  await db.close();
  console.log(`Built ${pack.name}: ${files.length} documents (${batch.length} entries)`);
}

/* -------------------------------------------- */

const [command, ...only] = process.argv.slice(2);
if (!["build", "extract"].includes(command)) {
  console.error("Usage: packs.mjs <build|extract> [pack ...]");
  process.exit(1);
}
const ClassicLevel = loadClassicLevel();
const packs = readPackList().filter(pack => !only.length || only.includes(pack.name));
try {
  for (const pack of packs) {
    if (command === "extract") await extractPack(ClassicLevel, pack);
    else await buildPack(ClassicLevel, pack);
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
