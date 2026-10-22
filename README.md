# Daggerfall Interactive Map

**An interactive map of The Elder Scrolls II: Daggerfall**: zoom from the whole Iliac Bay down to any
town's streets, find every shop, guild and temple by name, follow the roads, and keep a playthrough
journal you can save to a file.

**[Open the map →](https://dnfjeff.github.io/Daggerfall_InteractiveMap/)** · runs in your
browser, nothing to install · [Desktop app](https://github.com/DnfJeff/Daggerfall_InteractiveMap/releases/latest)

## What it does

**The map (for everyone)**
- All **15,251 locations** of the Iliac Bay on the game's own map art, with region borders, roads,
  tracks, rivers and streams. Hover to identify anything; zoom continuously from the overview to street
  level, where every town draws its real layout.
- **Every town's street map**, coloured like the in-game automap, with **shop, tavern, guild and temple
  names** exactly as the game generates them, and shop quality.
- **Search like you talk**: “bookstores near Gothway Garden”, “mages guild near me”, “armorer in
  Wayrest”, “temples”. Results are nearest-first with direction.
- **Only places with…**: show just the towns with a bank, a Fighters Guild, a temple of Kynareth, a port…
- **Region facts**: ruler, capital, ports, patron temple, climate, settlements, common dungeon types.
- **Encounters & bestiary**: what can spawn in each dungeon type and in each region's wilderness (day,
  night, in town at night), with odds at your level, from the game's own encounter tables.
- **Spoiler levels**: Explorer, Wanderer, Cartographer; reveal things one at a time.

**Your playthrough (optional)**
- **Markers and notes** anywhere: an unmarked shack, a quest giver, “silver or better here”.
  Notes go in your *Atlas* (true in every playthrough) or one *playthrough*.
- **Journal**, **I'm here / Home**, dungeons **started / cleared**, bestiary **kills**.
- **Bring in your character**: drop your Daggerfall Unity or Daggerfall Online **save folder** on the page.
  Its discoveries, position and notebook are copied into your playthrough (nothing is uploaded).
- **Save to a `.dfc` file**: your work autosaves in the browser; a `.dfc` file is your portable copy to
  keep, move to another PC, or share. Open one, or just drop it on the page.

Everything stays on your computer. There are no accounts and no servers beyond the static page.

## Desktop app

`Daggerfall Interactive Map.exe` (Windows 10/11, a few MB, no install) is the same map as a standalone
program, keeping its notes in a `data` folder beside it. It can also read **your own install and saves
live**: point it at `ARENA2` (mods and all) and bind a playthrough to a character that follows your
newest save. Download it from [Releases](https://github.com/DnfJeff/Daggerfall_InteractiveMap/releases/latest).

## Data and credits

The hosted map ships **derived data** extracted from a Daggerfall install: location positions and names,
town block layouts, building records, recombined region-map art, creature sprites. It does **not** contain
the game's original files. *The Elder Scrolls II: Daggerfall* is © Bethesda Softworks / ZeniMax Media and
is available free from Bethesda; this is an unofficial fan project.

- Shop and tavern name tables, NameGen, enemy and encounter tables: [Daggerfall Unity](https://github.com/Interkarma/daggerfall-unity)
  (MIT, © Daggerfall Workshop). The name generator and town building linkage follow DFU's reverse engineering.
- Roads, tracks, rivers and streams: the **Basic Roads** mod by Hazelnut.
- Format documentation: [UESP](https://en.uesp.net/wiki/Daggerfall_Mod:File_Formats).

## Development

```bash
npm install
npm run dev:web        # the hosted map, with hot reload
npm run build:web      # static site in dist/ (what GitHub Pages serves)
npm run dev            # the local flavor (folder pickers, live saves)
npx tauri build --no-bundle   # the desktop exe (needs Rust)
```

The map data in `public/data/` is baked from a local install and committed:

```bash
npm run bake -- "<path to ARENA2>" "<path to basicroads.dfmod>"
npx tsx scripts/bake-verify.ts "<path to ARENA2>"   # confirms baked data == original
```

- **Pages**: `.github/workflows/pages.yml` publishes `dist/` on every push to `main`
  (Settings → Pages → Source: GitHub Actions).
- **Releases**: push a tag like `v0.3.0`; `.github/workflows/release.yml` builds the exe and attaches a zip.
- Architecture, file formats and design decisions: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
  Distribution options: [docs/DISTRIBUTION.md](docs/DISTRIBUTION.md). In-game mod research:
  [docs/UNITY-MOD.md](docs/UNITY-MOD.md).

### Build flavors

| Flavor | Command | Map data | Saves |
|---|---|---|---|
| Web (Pages) | `build:web` | built-in | captured from dropped save folders, `.dfc` files |
| Local / desktop | `build`, `tauri build` | built-in, or your own `ARENA2` | live from your save folders, or captured |
