# Daggerfall Companion — Architecture (v0.2)

```
log:      2026-10-21
status:   describes the build at v0.2.0
pairs with: UserExperienceVision.md (how it should feel), daggerfall-companion-data-landscape.md (the data facts)
```

This is the map of the codebase: what each part does, how data flows, which decisions were made and
why, and where the sharp edges are. Read it before branching or porting.

---

## 1. Shape of the thing

A **static web app** (Svelte 5 + TypeScript, built by Vite) that runs entirely in the browser. It never
talks to a server of its own: a local static server only hands it its files. Game data is read from
folders the user chooses (File System Access API); the user's own data lives in the browser's
IndexedDB.

```
 ┌─────────────── user's disk ───────────────┐      ┌──────────── browser ─────────────┐
 │ ARENA2/  MAPS.BSA BLOCKS.BSA *.IMG *.PAK  │──┐   │ src/lib/df      parsers → GameData │
 │          TEXTURE.### FACTION.TXT          │  ├──▶│ src/lib/map     camera, layers,     │
 │ DFU / DFO Saves/SAVEn/*.txt               │──┤   │                 labels, search      │
 │ DFU install/…/Mods/basicroads.dfmod       │──┘   │ src/lib/state   app state (runes)   │
 └───────────────────────────────────────────┘      │ src/lib/db      IndexedDB, backups  │
                                                     │ src/components  workspace UI        │
 ┌──── IndexedDB "daggerfall-companion" ─────┐◀────▶│                                     │
 │ kv: settings, folder handles               │      └─────────────────────────────────────┘
 │ records: notes, markers, journal, reveals,│
 │          kills, guides, spots, statuses    │
 │ profiles, snapshots                         │
 └───────────────────────────────────────────┘
```

Two rules hold everywhere:
1. **Game data is read, never stored.** Exports and snapshots contain only user-authored data, so they
   are small and legal to share.
2. **Saves are read, never written.**

---

## 2. Source layout

| Path | Role |
|---|---|
| `src/lib/df/` | Pure TypeScript parsers and game models. No DOM (except where noted), so they run in Node for probes. |
| `src/lib/map/` | Rendering helpers: camera, cached layers (world art, borders, town canvases, road chunks), label sprites, search. Uses DOM canvas. |
| `src/lib/db/` | IndexedDB wrapper, the record model, backups/exports/snapshots. |
| `src/lib/state/` | `app.svelte.ts` (the single app-state object) and `settings.ts` (persisted settings + defaults + merge). |
| `src/lib/data/` | JSON tables taken from Daggerfall Unity (MIT): shop-name parts, NameGen, enemies, encounter tables. These live in FALL.EXE in the original game, so they can't be read from ARENA2. |
| `src/components/` | Svelte UI. `dock/` is the docking system; `map/` the three map views and their overlays. |
| `scripts/` | Node probes (verify parsers against real data), the personal launcher, the release builder. |
| `src-tauri/` | Desktop shell (Rust, Tauri 2): one exe embedding `dist/`, WebView2 storage in `data/` beside it. |
| `release/` | End-user README template for releases. |
| `public/` | Web app manifest, icons, no-cache service worker (makes the app installable). |

---

## 3. Game data layer (`src/lib/df`)

### 3.1 Sources
`source.ts` defines `GameSource` (a read-only, case-insensitive folder). Implementations: a
`FileSystemDirectoryHandle` (Chromium, remembered across sessions), a `FileList` from
`<input webkitdirectory>` (fallback, not remembered), a Node folder (probes), and dev-server HTTP
(`devsource.ts`, dev only).

### 3.2 Formats

| File | Module | What we take |
|---|---|---|
| BSA archives | `bsa.ts` | Directory at end of file; name or number records; random access via `Blob.slice`. |
| `MAPS.BSA` | `maps.ts` | Per region: names, map table (position, type, discovered flag, dungeon type), location records (doors, building list, exterior block grid, port flag), dungeon block layouts. Block footprint (W×H) for every location is read at load. |
| `BLOCKS.BSA` | `blocks.ts` | RMB blocks: 64×64 automap bitmap (pixel = building type + 1), building positions and per-block building records. Parsed lazily, cached. Unknown names fall back like DFU's `CheckName`. |
| `*.IMG`, `*.COL`, `*.PAK` | `images.ts` | Indexed images (raw/RLE/headerless), palettes, run-length PAK grids (POLITIC, CLIMATE: 1001×500, DFU reads x+1). |
| `TEXTURE.###` | `texture.ts` | First frame of creature sprites (uncompressed, multi-frame, RLE). |
| `FACTION.TXT` | `factions.ts` | Factions by id with tab-depth parent/child tree, type, region (stored 1-based), ruler. |
| `.dfmod` (UnityFS) | `unityfs.ts` | LZ4 block decompression; TextAssets found by name. Used for Basic Roads. |
| DFU / DFO saves | `save.ts` | See §3.6. |

### 3.3 GameData (`game.ts`)
Loads everything once per ARENA2 folder and exposes:
- `maps`, `blocks`, `factions`, palettes, `politic`, `climate`;
- `world`: a seamless 1000×500 palette image composed from all region maps (FMAP*). Each land pixel
  comes from its own region's art; where that art doesn't reach, a learned dimmed→highlighted palette
  mapping is applied (region maps draw neighbours dimmed); open sea uses the dominant sea colour;
- `town(loc)`: builds a `TownModel` (cached promise);
- `sprite(archive)`; `directory()`; `regionFacts(region)` (both lazy, memoised);
- `fingerprint`: identity of the data (sizes + hashed head/tail of MAPS/BLOCKS) used to flag imports.

### 3.4 Towns (`town.ts`)
Blocks are laid out with **block row 0 at the south**. Building linkage follows DFU's `RMBLayout`:
named buildings (shops, taverns, guilds, temples, palace) appear in the same order in MAPS.BSA and in
the blocks, so each block's named record takes the next unused MAPS record of the same type (name
seed, faction, quality). Building keys are DFU's `(x<<16)|(y<<8)|record`, which match DFU saves.
Hover/selection uses pixel ownership: each 4-connected automap component goes to the nearest
building record of the matching type; labels sit at component centroids.

### 3.5 Names (`names.ts`)
DFU's `GenerateBuildingName`: classic LCG (`next = next*1103515245+12345`, bits 16–30), B part drawn
before A, `%ef` burns one roll then generates a male first name from the region's name bank,
`%rt` uses the province faction's ruler title, guild/temple names come from factions, banks from the
region name. Verified: 15,251 locations, UESP's seed 27748 → "The Howling Stag", 166/196 save-recorded
names match (the rest are quest residences and mod renames).

### 3.6 Saves (`save.ts`)
Two runtimes, kept as separate sources:

| | Daggerfall Unity | Daggerfall Online |
|---|---|---|
| Info | `SaveInfo.txt`, realTime in .NET ticks | `SaveInfo.txt`, realTime JS ms, `characterId` |
| Data | `SaveData.txt` `playerData.playerEntity` | `SaveData.txt` top-level fields |
| Time | DFU seconds | classic minutes from 3E 404 → converted to DFU seconds |
| Position | `playerPosition.worldPosX/Z` | `world.nativeX/Z` |
| Discovery | `DiscoveryData.txt`, keyed by mapId, building keys | `discovery.locations` by map pixel id; buildings by "region:name", own key order |
| Notebook | `NotebookData.txt` | `quest.notebook` |

Format is detected **per save** (DFO folders also hold imported DFU saves). Discovery is normalised to
`{ locations: Set<mapId>, buildings: Map<mapId, Map<key,name>>, names: Map<mapId, Set<name>> }`; DFO
building matches are by name because its keys don't follow DFU layout order.

### 3.7 Directory, encounters, roads
- `directory.ts`: per settlement, which services it offers (shop types, guilds/orders by faction,
  temples by god or order, port = port flag **and** a bank), plus a search vocabulary. Built from MAPS
  records only (~0.1 s for 11k places).
- `encounters.ts`: classic 20-entry tables per dungeon type, per climate × (wild day / wild night /
  town night), underwater and indoors; `encounterOdds(table, level)` reproduces the classic pick
  (80% level±3, 15% bottom..level+1, 5% wide, clamped). `regionEncounters.ts` weights climates by
  land share.
- `roads.ts`: Basic Roads grids (one byte per pixel = 8 direction bits, N = y−1) → edges both ends agree
  on → chains between junctions → two rounds of Chaikin smoothing. ~0.12 s.

---

## 4. User data (`src/lib/db`)

### 4.1 Records
Every user item is a record in one store, keyed by id:

```ts
{ id, plane, kind, anchor, anchorKey, createdAt, updatedAt, deletedAt?, …kind fields }
plane:  'atlas' | <profileId> | '_none'      // Atlas = true in every playthrough
kind:   marker | note | journal | guide | reveal | kill | spot | status
anchor: px{x,y} | loc{mapId} | bld{mapId,key} | town{mapId,x,y} | region{region} | creature{id}
```

Anchors use stable game identities (mapId, DFU building key, map pixel), never names. Deletion is
soft (Trash) except reveals/kills/spots/statuses, which are toggles.

### 4.2 Profiles
`{ id, name, color, binding: { mode: pinned|character, runtime: dfu|dfo, folder?, characterName?, characterId? } }`.
Reveals, kills, spots and statuses use the active profile's plane (or `_none`), so a reveal in one
playthrough never spoils another.

### 4.3 Backups (`backup.ts`)
Bundle format `{ format: 'daggerfall-companion', version: 1, app, exportedAt, scope, world, settings?, profiles, records }`.
Scopes: all, atlas, chosen profiles. Import: merge (newer `updatedAt` wins) or replace, optionally as
profile copies. Snapshots are full bundles in the `snapshots` store, taken on open (throttled), before
import/restore/profile delete, and manually; automatic ones are pruned to N. Optional backup folder
receives files. Schema versions: `DB_VERSION` in `idb.ts`, `BUNDLE_VERSION` + `migrateBundle` in
`backup.ts`, and `mergeSettings` fills new setting fields with defaults.

---

## 5. State (`src/lib/state`)

`app` is one class using Svelte 5 runes. Notable members:
- sources & loading: `sources`, `game`, `saves`, `boundSave`, `roads`, `dfuMods`;
- user data: `settings`, `profiles`, `records` + derived `visibleRecords`, `byAnchor`, `reveals`,
  `kills`, `spots`, `statuses`, `discovery`, `serviceMatches`, `encounterLevel`;
- navigation: `mapLevel` (overview/world/town), `townMapId`, `selection`, `flyRequest`, `townFocus`,
  `mapZoom`, `bestiaryWhere`, `serviceQuery`, `composer`;
- spoiler rules: `locationVisible`, `buildingNameVisible`, `serviceNameVisible`, `shopNamesShown`;
- layout: `settings.layout` (dock sizes, open states, section states) saved debounced via `saveLayout`.

Pattern: components read `app.*` directly and call its methods; there is no event bus.

---

## 6. Rendering (`src/lib/map`, `components/map`)

- **Camera** (`camera.ts`): centre + zoom (screen px per world unit), wheel zoom about the cursor,
  drag pan, eased `flyTo` that dips out for long hops.
- **WorldMap**: world-space pass (art, region tint, roads by visible chunk, borders, towns-in-pixel at
  zoom ≥ 36), then screen-space pass (dots sized by footprint, rings, status badges, here/home, labels,
  markers). Redraws on demand via rAF.
- **Labels** (`labels.ts`, `labelClasses.ts`): every label is rasterised once to a sprite (LRU 6000)
  and blitted; collisions use a spatial hash; tiers decide appearance zoom and priority
  (cities > towns > villages > taverns/temples > dungeons > homes). Quantise font sizes so sprites hit
  the cache.
- **TownMap**: the town canvas at 1 px per automap cell over a stone pattern; footprints as cached
  `Path2D`s; labels in the game's yellow.
- **Overview**: the game's `TRAV0I00.IMG` cropped to its map area; region picking via `TRAV0I01.IMG`.

Performance budget: dense region views stay within a frame while panning; the expensive parts
(sorting label candidates, filtering visible locations, building road chunks) happen in `$derived`
values that only change with data, not per frame.

---

## 7. Workspace UI (`components`)

```
rail │ map (overview / regions / town)                    │ ▌ right dock: Inspector (sections)
     │                                                    │ ▌             ─ splitter ─
     ├─ splitter ─────────────────────────────────────────│ ▌             Map controls (sections)
     │ bottom dock tabs: Journal Bestiary Character Guides│
     │                   Data & backups Preferences       │
status bar: profile · bound save · spoiler level · persistence · refresh
```

`dock/Pane`, `dock/Section` (collapsible, state remembered by id), `dock/Splitter` (pointer + keyboard).
Shortcuts: Ctrl+F find, Esc clear, `]` side panels, `` ` `` bottom dock.

---

## 8. Running and shipping

| Mode | How | Port | Data lives |
|---|---|---|---|
| Dev | `npm run dev` (auto-loads `DFC_DEV_*` folders) | 5178 | dev browser profile |
| Desktop dev | `npx tauri dev` (native window over the dev server) | 5178 | `src-tauri/target/debug/data/` |
| Personal | desktop shortcut → `Personal/Daggerfall Companion.exe` (update: `make-release.ps1 -Personal`) | none | `Personal/data/` |
| Release | `Releases/DaggerfallCompanion-x/Daggerfall Companion.exe` | none | `data/` beside the exe |
| From source | `scripts/launch.ps1` (Node, rebuilds when stale) | 5179 | your Chrome/Edge profile |

Details and shell alternatives: `DISTRIBUTION.md`. In-game directions: `UNITY-MOD.md`.

Browsers key storage by origin (scheme + host + **port**): keep dev/source ports stable or data looks lost. The desktop exe has no port; its storage is the `data/` folder beside it.

---

## 9. Verification

| Script | Checks |
|---|---|
| `scripts/probe.ts` | load time, counts per type, sample names, world/town BMPs |
| `scripts/crosscheck.ts` | generated building names vs DFU save discovery |
| `scripts/roads-probe.ts` | roads vectoriser |
| `scripts/sizes-probe.ts` | town footprints by type |
| `scripts/directory-probe.ts` | services catalogue, search vocabulary, region facts, encounter odds |
| `npm run check` / `npm run build` | types and production build |

---

## 10. Sharp edges

- **File System Access API** is Chromium-only; Firefox falls back to re-picking folders each visit.
- **Persistent storage** is granted mainly to installed apps; otherwise rely on snapshots/backups.
- **Mods** change ground truth (renames, added places). The map is vanilla; saves supply mod names.
- **Building linkage** for generic houses is best-effort (as in DFU); named buildings are reliable.
- **Palace names** for Wayrest/Sentinel come from a small table, not TEXT.RSC.
- **Dungeon maps** (RDB) are parsed but not drawn yet.
- **DFO roads**: Daggerfall Online has its own road data; only the Basic Roads mod is read today.

---

## 11. Hosted web map and baked data (v0.3)

The same codebase builds a **web flavor** (`npm run build:web`, `VITE_FLAVOR=web`) for GitHub Pages:

- **Baked data** (`scripts/bake.ts` → `public/data/*.bin`, gzip): columnar location table, named
  building records, resolved block names, faction list, 508 RMB blocks (automaps + building records),
  the composed world raster, politic/climate grids, palettes, overview + region picker, creature
  sprites, and Basic Roads grids. ~0.9 MB total. `src/lib/df/baked.ts` rebuilds a `GameData` from it
  through the `MapsData` / `BlocksData` interfaces, so towns, names, directory and region facts run
  unchanged. `scripts/bake-verify.ts` proves equality against the original files.
- **No folder access**: the web flavor loads baked data at start and skips the welcome screen.
  Local/desktop builds ship the same data and offer it as “Open the map now”.
- **.dfc files**: a full bundle (`scope: all`) as compact JSON with a `.dfc` extension. File menu:
  Save (Ctrl+S; rewrites the same file via the File System Access API, or downloads), Save as, Open
  (Ctrl+O). `app.dfcSavedAt` drives the unsaved-changes dot. Opening shows `ImportDialog`
  (open = replace, or merge), with an automatic snapshot first.
- **Drag and drop** (`DropZone`): `.dfc` → open; save folders/files → `DroppedSavesRoot` → pick a save
  → `snapshotSave` stores character, position, discovery and notebook in `profile.saveSnapshot`.
  `loadBoundSave` uses a live binding when there is one, else the snapshot, so captured characters
  travel inside `.dfc` files.
- **CI**: `pages.yml` (check + build:web → Pages), `release.yml` (tag → Windows exe zip on a release).
