sec

# How to Install

- Change the `installPath` property in `foundry-config.yaml` to your install path for Foundry Virtual Tabletop
- Build the compendium packs (see below) before launching Foundry

# Compendium Packs

The compendiums are stored as JSON in `packs-src/`, one file per document. Foundry reads them from
LevelDB databases in `packs/`, which are built from that source and aren't committed.

Close Foundry first (it locks the packs), then from the repository folder:

```powershell
tools/packs.cmd build      # packs-src/ -> packs/  (after cloning or pulling)
tools/packs.cmd extract    # packs/ -> packs-src/  (after editing compendiums inside Foundry)
```

Both commands take optional pack names to process only those, e.g. `tools/packs.cmd build moves`.
The script runs with the Node.js bundled in Foundry, so Node doesn't need to be installed.
With Node installed, `npm run packs:build` and `npm run packs:extract` do the same.

# Dungeon Floors

GMs can generate Mystery Dungeon floors from the **Generate Dungeon Floor** button in the Scenes sidebar
(or the macro `explorers.generateDungeon()`). Floors come from
[dungeon-mystery](https://github.com/EpicYoshiMaster/dungeon-mystery), a port of Explorers of Sky's own
generator, and settings exported from [Pokémon Dungeoneer](https://github.com/EpicYoshiMaster/pokemon-dungeoneer)
can be imported. The Scene gets the map image, walls, a Room region per room, and markers for the stairs,
items, traps and Pokémon spawns.

Maps are drawn with tileset sheets in SilverDeoxys563's format from
[The Spriters Resource](https://www.spriters-resource.com/ds_dsi/pokemonmysterydungeonexplorersoftimedarkness/)
(the Dungeon Tilesets section). They aren't included here: download the sheets you want into your Foundry
user data folder (for example `Data/tilesets/`) and pick one in the generator.

# License

This system is licensed under the GNU General Public License v3.0 or later (see `LICENSE`).

It is based on work by sec, released under the MIT License (see `LICENSE-MIT`); that original code remains
available under the MIT License. `lib/dungeon-mystery` is EpicYoshiMaster's dungeon-mystery, GPL-3.0-or-later.
