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
