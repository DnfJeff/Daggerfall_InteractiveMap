# Daggerfall Companion: Data Landscape

```
log:     2026-10-21
status:  research complete, no decisions made
scope:   what the game actually stores, generates, and records; what that means for an
         external map + companion + notebook tool
not in scope: implementation, stack, UI
```

---

## 0. Framing

The idea has three surfaces: a **map** at parity with or beyond the in-game travel map and automap, a **companion** (guides, bestiary, extensible), and a **notebook** with structured markers and notes. Notebook data splits into two planes:

- **Atlas plane.** Knowledge that holds across every playthrough. Built up over many saves and shared by all of them.
- **Playthrough plane.** Notes, markers, and journal entries that belong to one run. Loaded like a save profile.

Whether a given fact belongs in the atlas plane depends on whether the game produces it identically every time. Most of this doc is about answering that question per data type, so the split rests on how the game actually behaves rather than on guesses.

The short answer is that Daggerfall is far less random than its reputation suggests. Nearly everything on the map is baked into the data files or derived deterministically from seeds stored in them. Randomness lives in a few specific places: enemies, loot, quests, and wandering NPCs.

---

## 1. Which Daggerfall: the runtime matters

There are two runtimes in practical use, and they differ in ways that affect data.

**Classic (DOS, 1996, free since 2009).** Data lives in the `ARENA2` folder. Saves are binary, in `SAVE0`–`SAVE5`.

**Daggerfall Unity (DFU).** An open-source (MIT) reimplementation that reached 1.0 on 2023-12-30, with community releases since (1.1.x). It reads the same `ARENA2` data, writes its own JSON-based saves, and can *import* classic saves but not write them. It adds QoL systems (notebook, quest journal upgrades, discovery tracking) and a large mod ecosystem.

**Mods change the facts.** In DFU, a modset can rename locations, rename shops, add new locations, add roads, hide map locations, change terrain, change encounter tables, or change dungeon size. Section 13 lists the ones that matter here. The consequence: "consistent across playthroughs" really means **consistent across playthroughs that share the same game data + DFU version + relevant modset + relevant settings.** That tuple is the true identity of a "world" for atlas purposes.

> Observation: the atlas plane is not one dataset per game. It is one dataset per *world fingerprint*. Vanilla DFU is the common case, but the fingerprint concept is unavoidable once mods are in play.

---

## 2. Invariance tiers (the core table)

Every piece of data falls into one of five tiers.

| Tier | Meaning | Atlas-safe? |
|---|---|---|
| **T1 Static data** | Literally stored in `ARENA2` files | Yes |
| **T2 Seeded deterministic** | Generated at runtime from a seed stored in T1 data, via Daggerfall's own RNG | Yes, if generator is reproduced or values are observed once |
| **T3 Implementation-deterministic** | Not specified by data, but the engine resolves it the same way every load (DFU's algorithm may differ from classic's) | Yes *per runtime* |
| **T4 Recorded per-playthrough** | Rolled once, then persisted in the save | No; playthrough plane |
| **T5 Ephemeral** | Rolled per session/visit, often not saved | Neither; at most statistical knowledge |

### Classification

| Data | Tier | Notes |
|---|---|---|
| World shape, coastline, elevation, climate, political regions | T1 | `WOODS.WLD`, `CLIMATE.PAK`, `POLITIC.PAK`, all 1000×500 |
| Location existence, name, type, map position | T1 | `MAPS.BSA`. Location names are literal strings, not generated |
| Location map-visibility flags at game start | T1 | Flag bits in location type byte |
| Dungeon type (Crypt, Vampire Haunt, etc.) | T1 | Upper bits of a MapTable field |
| Town layout (which blocks, in what grid) | T1 | `MAPS.BSA` → `BLOCKS.BSA` RMB records |
| Building footprints, doors, block automap bitmap | T1 | Inside each RMB block |
| Building type, quality, faction per building | T1 | MAPS.BSA building records |
| **Shop / tavern / guild names** | **T2** | NameSeed per building, run through Daggerfall's LCG and name-part tables |
| Which map-level building record maps to which physical block building | T3 | See §5.4 |
| Static interior NPCs (placement, appearance) | T1 | Flats in block interiors |
| Static interior NPC names | T2/T3 (reported consistent) | Community reports same names in every game; verify in DFU (§14) |
| Dungeon layout (blocks + arrangement) | T1 | Fixed per dungeon; same in every game |
| Fixed-mobile enemies in dungeons | T1 | Same every load |
| Random-mobile enemies | T5 | Rolled from dungeon-type table × player level |
| Treasure pile contents | T5 | Randomised |
| Quest-object placement in dungeon | T4 | Chosen from the block's quest markers when quest starts |
| Quests offered, quest targets, quest NPC names | T4 | Place resources pick random buildings/dungeons |
| Residence "name" when used by a quest | T4 | Generated ("The X Residence"), not stable |
| Wandering street NPCs | T5 | Random names, random appearance |
| Wilderness terrain detail and flats | T3 | Heightmap + deterministic noise in DFU; changed by terrain mods |
| Random wilderness encounters | T5 | |
| What the player has discovered (locations, buildings) | T4 | In the save |
| Player character, stats, inventory, factions, time | T4 | In the save |

---

## 3. World geometry and coordinate systems

### 3.1 Coordinate spaces

| Space | Resolution | Source | Use |
|---|---|---|---|
| World units | Integer, roughly inches | Engine | Exact player/location position |
| Map pixel | 1000×500 grid | `WOODS.WLD`, `CLIMATE.PAK`, `POLITIC.PAK` | One location max per pixel; the natural cell of the world |
| Sub-pixel | 5×5 per map pixel (5000×2500 total) | `WOODS.WLD` noise/detail data | Finer elevation |
| Region | 62 slots in `MAPS.BSA`, 44 used regions in practice (41 continental + 3 island) | `MAPS.BSA`, `POLITIC.PAK` | Political grouping, the "states" layer |
| Block | RMB block grid inside a location (a full city is 8×8) | `MAPS.BSA` + `BLOCKS.BSA` | Town layout |

World units convert to map pixels by fixed division. Every location and every player position can be resolved to a map pixel. Map pixels are the stable "address" for anything placed on the overworld, including user markers at places the game doesn't mark.

### 3.2 Overworld layers that exist in data

| Layer | Source | Status |
|---|---|---|
| Elevation | `WOODS.WLD` 1000×500 + 5000×2500 detail | T1 |
| Climate (9 types) | `CLIMATE.PAK` | T1 |
| Political regions | `POLITIC.PAK` | T1 |
| Terrain type per pixel (generation params) | `WOODS.WLD` PixelData | T1 |
| Locations (all ~15,251) | `MAPS.BSA` | T1 |
| Roads and dirt tracks | **Basic Roads mod**, not game data | Mod; see §3.3 |
| Discovery / visibility | Save | T4 |
| Temple domains, knightly orders, vampire bloodlines | Lore; community-drawn maps on UESP | Derived, not file data |

### 3.3 Roads and trails

Vanilla Daggerfall has **no overworld roads**. The roads and tracks people see on the DFU travel map come from the **Basic Roads** mod (Hazelnut), displayed via **Travel Options**. Its data model is simple: one byte per map pixel, a bitmask of 8 directions a path leaves that pixel, stored separately for roads and for tracks. The paths were hand-drawn by the community pixel by pixel in an editor built on the travel map. Other mods can query it through DFU mod messages, either the whole byte array per path type or per pixel. Locations added by other mods (e.g. Betony Restored) have been connected into it.

So a roads layer is available and compact (two 1000×500 byte grids), but its provenance is a mod release, not the game.

### 3.4 Existing high-resolution / derived maps

- UESP hosts 1000×500 and 5000×2500 grayscale elevation extracts from `WOODS.WLD`, plus political, climate, temples/knights, vampire-bloodline, and region-code maps of the Iliac Bay.
- UESP's per-region map images are small (about 296×160), matching the in-game region map scale.
- DFU allows overriding travel-map and other `.IMG` images with PNGs in `StreamingAssets/Textures/Img`, and community redrawn travel maps exist (e.g. a Nexus "map" mod with redrawn region art).
- No public, maintained, interactive, deep-zoom web map with per-town layouts was found. UESP editors discussed building one (region map → click town → colored-building city map, like the automap) but it never shipped as a general tool.

---

## 4. Locations (`MAPS.BSA`)

### 4.1 Contents

`MAPS.BSA` holds overland data per region in four record kinds: location names, a location table (position + type), exterior data (town/building records), and dungeon interior data. Each location record says which `BLOCKS.BSA` blocks make it up.

### 4.2 Counts (UESP)

| Category | Count |
|---|---|
| Total distinct locations | 15,251 |
| Dungeons | 4,229 (Castle Daggerfall, Palace Sentinel and Castle Wayrest excluded; they sit inside cities) |
| Farmsteads, shacks, manors | 4,400 |
| Rural temples, shrines, covens | 1,532 |
| Cities, towns, villages, rural taverns | 5,090 |

### 4.3 Location types and flags

The location type byte has a basic type in the low bits and flags in the high bits:

Large/medium/small town, farm, large/medium/small dungeon, temple, tavern, manor, shrine, shack, graveyard, coven, and the player's ship. Each has a fixed travel-map dot color in the original.

Flags include a "hidden at start" bit and an "always shown" bit. This is the data behind "unmarked towns": many locations exist in data but don't show on the map until discovered.

### 4.4 Stable identity

Each location has a region index, an index within the region, and a location ID, all in T1 data. These are the natural anchors for atlas data about a place. The name is not a safe key: duplicates exist across regions, and rename mods change it.

---

## 5. Towns

### 5.1 Layout

A town is a grid of RMB blocks (up to 8×8 for a full city). Block choice and arrangement are T1 data, so every town looks the same in every game. This matches what you observed.

### 5.2 Automap

Each RMB block carries its **own automap bitmap**, the exact image the game shows. Each pixel is either transparent or encodes a building type. Ship and the "Special" types never draw. A town's automap is the mosaic of its blocks' automaps. That means the in-game town map look can be reconstructed exactly from data, with no screenshots.

### 5.3 Building records

Per building, `MAPS.BSA` exterior data includes, among other fields:

| Field | Meaning |
|---|---|
| NameSeed | Seed for the building's name |
| BuildingType | Alchemist, House For Sale, Armorer, Bank, Bookseller, Clothing, Furniture, Gem, General Store, Library, Guildhall, Pawn Shop, Weapon Smith, Temple, Tavern, Palace, House1–6, City Wall, Ship, Special1–4 |
| Quality | Shop quality tier, which drives stock and prices |
| FactionId | Owning faction/guild |

Residence subtypes encode door behavior. House1 is always locked. House2 is unlocked 06:00–18:00. Others follow similar rules.

### 5.4 Shop names: deterministic

Shop, tavern, and guild names are **not random per playthrough**. Each is generated from the building's NameSeed using Daggerfall's specific linear congruential generator (a 1990s C-runtime-style `srand`/`rand`) and per-building-type name-part tables. DFU reverse-engineered the RNG and output order (part B is drawn before part A) and reproduces classic names exactly. UESP's worked example is the tavern in Ashfield Hall, seed 27748, which produces "The Howling Stag".

So every vanilla shop name in the world is computable offline from `MAPS.BSA` and the name tables (which DFU ships as localizable text).

Caveats:

- **Map-to-block linkage is heuristic.** `MAPS.BSA` lists buildings per location; `BLOCKS.BSA` holds the physical buildings per block. The game doesn't store a clean link between them. DFU found that named buildings (shops, taverns, guilds) appear in the same order in both lists, and assumes generic buildings are distributed best-effort. Named buildings therefore map reliably. Generic houses map by DFU's algorithm (T3), which may not match classic exactly.
- **Duplicate-block bug class.** When the same RMB block appears twice in one location (example: Oxville in Daggerfall uses GEMRAM02.RMB twice), DFU had a regression where seeds collided. It was fixed, but it shows names depend on correct per-instance seed assignment.
- **Rename mods.** *Expanded Shop & Tavern Names* replaces the generator and *records the generated names into the save*. Removing it regenerates names and wipes identified-building names. *Taverns Renamed* and *Atlas of the Iliac Bay* (628+ renamed locations) change names too. Under these, names are effectively T4, or T2 under a different generator.
- **The DFU travel map search reads the game files directly**, so it doesn't see mod-renamed names. This is a known gap in the in-game tool itself.

### 5.5 Residences

Houses have no stable unique names. When a quest targets a residence, it gets a generated name for that quest ("The [surname] Residence"). That is T4 and won't match across saves. The *physical house* (block, position, type, door rules) is stable.

### 5.6 Inside buildings

Interior layouts and static NPC placement are block data (T1). Shop **inventory** is not; stock is generated by shop type and quality.

---

## 6. People

| Kind | Placement | Name | Tier |
|---|---|---|---|
| Static interior NPCs (shopkeepers, residents, castle staff) | Fixed in block data | Reported identical in all games | T1 / T2–T3 |
| Wandering street NPCs | Spawned around player | Random | T5 |
| Quest NPCs | Reserved by quest system, placed at a quest site | Random per quest | T4 |
| Named lore/main-quest NPCs (e.g. King Gothryd) | Fixed home; can be moved to a quest site while reserved | Fixed | T1 + T4 position |

Mods such as *Lively Cities* add static street NPCs with their own names, which also change the population of a town.

---

## 7. Dungeons

### 7.1 Layout: fixed

Every dungeon has a prebaked layout in `MAPS.BSA`, up to 32 RDB blocks on a 2D grid. Everyone sees the same layout in the same dungeon. DFU's lead developer has stated plainly that layouts are not random, and that quest placement and other systems depend on that being true. The randomness people remember came from block selection at design time, not at runtime.

Blocks are either **internal** (two door openings on each side) or **border** (seal the perimeter, loop back, never contain quest locations). The entrance and exit are always the same spot.

Exception: **DFU's "Smaller Dungeons" setting** shrinks layouts at a low level. With it on, layouts are still deterministic but *different*, so it belongs in the world fingerprint.

### 7.2 Contents

| Content | Behavior | Tier |
|---|---|---|
| Fixed-mobile markers | Same enemy every load (e.g. the first rat in Privateer's Hold) | T1 |
| Random-mobile markers | Enemy from a 20-entry table for the dungeon type, indexed by player level (80% near level ±3, small chance anywhere in list); no further change past about level 17 | T5 |
| Random treasure markers | Contents rolled | T5 |
| Quest-object markers | Fixed positions per block; the quest picks one | positions T1, choice T4 |
| Main-quest dungeon objects | Always the same spot | T1 |

The *map of where things can be* in a dungeon is atlas-grade. *What is there this time* is not.

### 7.3 Interior maps

Dungeon block geometry is in `BLOCKS.BSA`, so a 2D overview can be generated from data. The in-game dungeon automap is a 3D reveal-as-you-explore system. DFU's automap reveal state is persisted per save.

---

## 8. Quests, directions, and "are you passing through X?"

Quests define **Place** resources as `local` (same town as the quest giver), `remote` (another town in the same region), or `permanent` (a named fixed site such as Privateer's Hold), plus a site code that resolves to a building type or dungeon type. The engine picks a qualifying building or dungeon at random when the quest starts.

What this means for a lookup tool:

- The **target place** is always one of the T1/T2 places in data, a real building in a real town. Its name, position, and town map are knowable in advance.
- *Which* place gets chosen is T4. Different every playthrough.
- Of UESP's 227 catalogued quests, 34 always occur in every game; the rest are drawn randomly.

NPC dialog reveals locations at varying precision: a direction ("southeast of here"), or sometimes an actual map mark. Studying maps found as loot also reveals locations, and DFU logs each reveal as a notebook entry ("Discovered the location of X after studying a map").

The scenario you described (an NPC names a niche place, and the wiki has no screenshot) is fully answerable from data. Location name → region and coordinates → town block layout → automap → named buildings. None of it needs screenshots.

---

## 9. Discovery and knowledge state

- **Classic:** some locations visible from the start, others hidden by flag until found or revealed.
- **DFU:** tracks discovered locations and **discovered buildings** per save. Building names on the exterior automap appear once identified. This lives in the save, and the Lysunder save editor exposes it as editable "Discovery" data.
- **Hidden Map Locations (mod):** hides nearly everything except chosen types (cities by default) until visited, offered by a quest, or mentioned by an NPC. It can also block fast travel to unvisited places. Users report edge cases where locations get revealed unexpectedly, sometimes caused by other mods.

Discovery is the in-game equivalent of a "known places" layer. It is purely playthrough-scoped.

---

## 10. Bestiary data

| Item | Facts |
|---|---|
| Monster IDs | 0–42 monsters (Giant Rat, Imp, Spriggan … Dragonling and later additions), 128–146 humanoid classes (Mage … Knight) |
| Stats source | `MONSTER.BSA` holds monster data without images; sprites are in `TEXTURE.###` archives |
| Levels | Each monster type has a fixed level everywhere (rats always 1, Ancient Liches always 21); skills = 30 + 5 × level, capped at 100 |
| Humanoid enemy levels | Locked to the player's level at quest accept / dungeon entry |
| Spell points | 100 + 10 × level |
| Encounter tables | 20 entries per area type / dungeon type; documented on UESP by level |
| Loot | Per-enemy loot table letters, documented on UESP |
| Languages | Each monster has an associated language skill that can pacify it |
| Mod variance | *Daggerfall Enemy Expansion* adds enemy types and replaces tables; DFU already has a *Bestiary* mod reviving an in-game bestiary from a Daggerfall demo; texture packs (DREAM, Daggerfall Expanded Textures) replace sprites |

Kill tracking: the game doesn't appear to keep per-type kill counts in vanilla saves (verify, §14). A slain checkbox and counter would be companion-owned playthrough data unless the save turns out to hold it.

---

## 11. Saves and player data

### 11.1 Where saves live

| Runtime | Location |
|---|---|
| DFU Windows | `C:\Users\<user>\AppData\LocalLow\Daggerfall Workshop\Daggerfall Unity\Saves\SAVE<n>` |
| DFU Linux | `~/.config/unity3d/Daggerfall Workshop/Daggerfall Unity/...` |
| DFU macOS | `~/Library/Application Support/Daggerfall Workshop/Daggerfall Unity/...` |
| DFU portable | A `Portable.txt` in the install folder relocates everything into `PortableAppData` inside the install |
| Classic | `SAVE0`–`SAVE5` inside the Daggerfall install |

DFU has no save-count limit. The load screen links directly to each save's folder.

### 11.2 DFU save folder contents (confirmed so far)

| File | Content |
|---|---|
| `SaveInfo.txt` | Save metadata; the save isn't listed if this is missing or empty |
| `SaveData.txt` | Main JSON: player entity (name, race, class, stats, skills, level), inventory, position, environment state (in dungeon/building), global variables, **building discovery data** |
| `QuestData.txt` | Active quest state |
| `NotebookData.txt` | JSON, `notebookEntries`: array of string arrays; the first line is an in-game timestamp + place, the rest is text |
| `Bio.txt` | Character biography text |
| `QuestExceptions.txt` | Quest error state |
| Screenshot image | Save thumbnail |
| Mod save data | Mods can persist their own data per save |

Likely present but not individually confirmed in this research: faction data, conversation data, automap data, container data. §14 lists them.

### 11.3 Classic save

`SAVETREE.DAT` is a record tree (position, items, character, dungeon info, spells, guilds, bank accounts, etc.). `SAVEVARS.DAT` and `SAVENAME.TXT` sit alongside it. Format is partially documented on UESP; DFU contains a working reader.

### 11.4 Time

Daggerfall time is a single integer of **minutes since the epoch** (00:00, 1st of Morning Star, 3E 400). A new game starts several hundred thousand minutes in. DFU notebook entries are stamped in in-game time. In-game time is a natural axis for a journal and can line up with the game's own log.

### 11.5 Relevance to your profile idea

- Saves are self-contained folders and human-readable JSON in DFU. Reading them needs only a path, not scanning.
- A save is a *snapshot*. Each new save is a new folder (or an overwrite), so "the current state of a character" is the latest of a set of snapshots. Character identity across snapshots isn't a single explicit ID that this research confirmed (§14).
- Nothing in the save format prevents two companion profiles from reading the same save folder. Saves are read sources, and the companion's own data is separate.
- Prior art for parsing: the **Daggerfall Unity Save Editor** (Lysunder, on Nexus, about two weeks old as of this writing) reads `SaveData.txt`, `QuestData.txt`, `NotebookData.txt`, and can attach whole save folders.

---

## 12. Asset and file access: three distinct roots

| Root | Contains | Needed for |
|---|---|---|
| `ARENA2` (classic game data) | `MAPS.BSA`, `BLOCKS.BSA`, `WOODS.WLD`, `CLIMATE.PAK`, `POLITIC.PAK`, `MONSTER.BSA`, `TEXTURE.###`, `.IMG`/`.CIF` images, name tables | All T1/T2 world data, sprites, map art |
| DFU install `StreamingAssets` | Mods (`.dfmod`), loose texture overrides, quest packs, text/localization | What the player *actually* sees if modded |
| DFU persistent data path | Saves, `settings.ini`, mod settings | Playthrough data |

These are three separate user-chosen paths, and a DFU install may also have `ARENA2` dropped under `StreamingAssets/GameFiles`. Bestiary images from `ARENA2` are the vanilla sprites; if the player runs texture replacers, what they see in-game is the overrides in `StreamingAssets`. Whether the companion reflects vanilla or the player's modded look depends on which root it reads.

---

## 13. Mods that move the ground

| Mod | Effect on data |
|---|---|
| Basic Roads (+ Travel Options) | Adds road/track layer (§3.3) |
| Hidden Map Locations | Changes what's discovered and when |
| Atlas of the Iliac Bay | Renames 628+ locations |
| Expanded Shop & Tavern Names | New name generator; names stored in save |
| Taverns Renamed | Rural tavern locations named after their tavern |
| Betony Restored | Adds villages, farms, Betony City |
| World of Daggerfall (Project) | Adds wilderness POIs, terrain changes |
| Interesting Eroded Terrain | Alters heightmap/terrain |
| Lively Cities | Adds static street NPCs |
| Fixed Dungeon Exteriors | Changes dungeon exteriors |
| Daggerfall Enemy Expansion | New enemies, new encounter tables |
| Bestiary | In-game bestiary UI |
| DFU setting: Smaller Dungeons | Changes dungeon layouts |

---

## 14. Prior art

| Tool | What it did |
|---|---|
| Daggerfall Unity / Daggerfall Tools for Unity | Full readers for every format above; reference implementation of the name RNG, map/block linkage, terrain sampling, save parsing (MIT) |
| Daggerfall Scout (2009) | Continuous zoomable "Cartographer" view, from the whole Iliac Bay down to street level |
| Daggerfall Modelling | Viewer for town layouts and models; recommended resource for understanding layouts |
| Iliac (Tcl/Tk) | Used to produce UESP's block and capital-city screenshots |
| DFU travel map + exterior automap | Region maps with location filters and search; town map with colored buildings and names on identify |
| Hidden Map Locations / Travel Options | Discovery layer and roads overlay on the travel map |
| DFU Save Editor (Lysunder) | Save folder reader/editor, including discovery and notebook |
| UESP | Formats, location lists per region, store quality tables, bestiary, spawn tables, static maps |

No existing tool combines a deep-zoom overworld, per-town automaps with resolved names, and user annotation.

---

## 15. The two note planes, viewed through the data

This section frames the decision rather than making it.

### 15.1 What atlas data can attach to

| Anchor | Stability | Notes |
|---|---|---|
| Region + location index / location ID | T1 | Best anchor for anything about a known place |
| Building within location (block + record index) | T1 / T3 | Named buildings reliable; generic houses depend on linkage algorithm |
| Dungeon block + marker index | T1 | Good for "the quest marker in the NE room of this block" |
| Map pixel (x, y) | T1 | Works for unmarked or modded places and arbitrary wilderness points |
| World-unit coordinates | T1 | Precise, but more resolution than most notes need |
| Location name | Unstable | Duplicates; renamed by mods |
| Monster ID | T1 | Bestiary anchor |

### 15.2 What belongs in which plane, by the tiers

- T1/T2/T3 observations (this tavern sells X quality, this dungeon's quest markers are here, this unmarked shack exists at pixel N) are true in every playthrough of the same world fingerprint.
- T4 facts (quest targets, quest NPC names, discovery, a residence's quest-given name) are true only in one playthrough.
- T5 (what enemy was in that room, what loot dropped) is true in no playthrough after the fact. It can only be noted as anecdote or tallied statistically.

### 15.3 Questions this raises, to settle later

1. **World fingerprint granularity.** Is the atlas per game-data + modset, or vanilla-only with mod data as overlays?
2. **Promotion.** A note taken in a playthrough may later turn out to be universal (e.g. "this shop's name"). Does it move between planes, get copied, or get referenced?
3. **Conflict.** If the atlas says one thing and a playthrough observes another (because of a mod or a T3 difference), which surface wins, and is the difference itself information?
4. **Discovery as a lens.** The save's discovery data could filter the atlas to "what this character knows", or the atlas could be shown in full. This is a spoiler-policy choice.
5. **Save binding.** A profile is notes + a reference to one or more save folders. Many profiles can reference one save, and one profile's character produces many snapshot saves over time.
6. **Ground truth for names.** Compute names from seeds (needs reproducing the LCG + tables, plus mod awareness), or read them from the save's discovery data as the player identifies them, or both?
7. **Asset root choice.** Vanilla sprites from `ARENA2` versus modded art from `StreamingAssets`, independent per surface (map art, bestiary).

---

## 16. Open items to verify

| Item | Why it matters | How to check |
|---|---|---|
| Full DFU save file list (faction, conversation, automap, container data filenames) | Defines what's readable per save | DFU source `SaveLoadManager` / a real save folder |
| Whether DFU saves carry a stable character ID across snapshots | Profile ↔ save binding | Inspect `SaveInfo.txt` / `SaveData.txt` across two saves of one character |
| Whether discovered-building names are stored resolved or as seeds | Name ground truth | Inspect discovery data in `SaveData.txt` |
| Static interior NPC name determinism in DFU | Atlas-grade residents or not | Same building, two fresh games |
| Generic-house linkage parity classic vs DFU | Whether house-level atlas notes transfer between runtimes | Compare a quest-target house in both |
| Kill counts in vanilla save | Bestiary counter source | Inspect `SaveData.txt` |
| Exact travel-map image assets and resolutions | Fidelity of "in-game map" layer | `ARENA2` `.IMG`/`.CIF` inventory |
| Wilderness flat placement determinism in DFU | Whether wilderness landmarks are atlas-grade | Same pixel, two fresh games |
| Location count/type deltas under common mods | Fingerprint size | Diff location tables with mods on/off |

---

## Sources

- [UESP – MAPS.BSA format](https://en.uesp.net/wiki/Tes2Mod:MAPS.BSA)
- [UESP – BSA file formats](https://en.uesp.net/wiki/Tes2Mod:BSA_file_formats)
- [UESP – BLOCKS.BSA Map Block Records](https://pt.uesp.net/wiki/Daggerfall:BLOCKS.BSA/Map_Block_Records)
- [UESP – Building types](https://content3.uesp.net/wiki/Daggerfall:Building_types)
- [UESP – Location types (DFRemake)](https://app.uesp.net/wiki/Daggerfall_Mod:DFRemake/Resource_-_Location_Types)
- [UESP – WOODS.WLD format](https://en.uesp.net/wiki/Tes2Mod:WOODS.WLD_format)
- [UESP – Places](https://content2.uesp.net/wiki/Daggerfall:Cities)
- [UESP – Maps](https://en.uesp.net/wiki/Daggerfall:Maps)
- [UESP – Region map images](https://content3.uesp.net/wiki/Category:Daggerfall-Map_Images-Regions)
- [UESP – Tamriel geography extracts (WOODS.WLD grayscale)](https://app.uesp.net/tamriel/geography/tammap1.shtml)
- [UESP – Dungeons](https://content1.m.uesp.net/wiki/Daggerfall:Dungeons)
- [UESP – Enemy Spawn Locations](https://app.uesp.net/wiki/Daggerfall:Enemy_Spawn_Locations)
- [UESP – Bestiary](https://en.uesp.net/wiki/Daggerfall:Bestiary)
- [UESP – Mobile types](https://pt.uesp.net/wiki/Daggerfall:Mobile_types)
- [UESP – SaveTree.Dat](https://en.uesp.net/wiki/Tes2Mod:SaveTree.Dat)
- [UESP – SAVEGAME.DAT description](https://en.uesp.net/wiki/Tes2Mod:SAVEGAME.DAT_description)
- [UESP – Store Quality talk page (interactive map discussion)](https://app.uesp.net/wiki/Daggerfall_talk:Daggerfall_(city)/Store_Quality)
- [Daggerfall Workshop – Building Names](https://www.dfworkshop.net/building-names/)
- [Daggerfall Workshop – Questing: Place Resource](https://www.dfworkshop.net/questing-place-resource/)
- [Daggerfall Workshop – Quest Buildings and PcAt](https://www.dfworkshop.net/quest-buildings-and-pcat-condition/)
- [Daggerfall Workshop – Notebook & Journal upgrade](https://www.dfworkshop.net/notebook-enemy-spellcasting-and-bug-fixes/)
- [Daggerfall Workshop – Streaming World Part 2](https://www.dfworkshop.net/streaming-world-part-2/)
- [Daggerfall Workshop – Fixed and random enemies](https://www.dfworkshop.net/?p=1157)
- [Daggerfall Workshop – Texture modding](https://www.dfworkshop.net/projects/daggerfall-unity/modding/textures/)
- [Daggerfall Workshop – Mod features (save data)](https://www.dfworkshop.net/projects/daggerfall-unity/modding/features/)
- [Daggerfall Workshop – Daggerfall Scout (2009)](https://www.dfworkshop.net/2009/07/)
- [DFU wiki – Translating Daggerfall Unity](https://github.com/Interkarma/daggerfall-unity/wiki/Translating-Daggerfall-Unity)
- [DFU issue #2237 – duplicate block name seeds](https://github.com/Interkarma/daggerfall-unity/issues/2237)
- [DFU enums – FixedMobile / RandomMobile](https://github.com/Interkarma/daggerfall-unity/blob/master/Assets/Scripts/DaggerfallUnityEnums.cs/)
- [DFU 1.1.1 release notes (portable installs)](https://github.com/Interkarma/daggerfall-unity/releases/tag/v1.1.1)
- [DFU forums – Installing / persistent data path](https://forums.dfworkshop.net/viewtopic.php?p=27550)
- [DFU forums – Save folder recovery](https://forums.dfworkshop.net/viewtopic.php?p=33314)
- [DFU forums – NotebookData.txt format](https://forums.dfworkshop.net/viewtopic.php?t=5440)
- [DFU forums – Town layouts](https://forums.dfworkshop.net/viewtopic.php?p=344)
- [DFU forums – Basic Roads WIP](https://forums.dfworkshop.net/viewtopic.php?p=46530)
- [DFU forums – Basic Roads release / path data API](https://forums.dfworkshop.net/viewtopic.php?p=49129)
- [Nexus – Basic Roads](https://www.nexusmods.com/daggerfallunity/mods/134)
- [Nexus – Travel Options](https://www.nexusmods.com/daggerfallunity/mods/122)
- [Nexus – Hidden Map Locations](https://nexusmods.com/daggerfallunity/mods/265)
- [Nexus – Expanded Shop & Tavern Names](https://www.nexusmods.com/daggerfallunity/mods/722?tab=docs)
- [Nexus – Taverns Renamed (discussion)](https://www.nexusmods.com/daggerfallunity/mods/569?tab=posts)
- [Nexus – Atlas of the Iliac Bay](https://www.nexusmods.com/daggerfallunity/mods/1198?tab=docs)
- [Nexus – Betony Restored](https://www.nexusmods.com/daggerfallunity/mods/515?tab=docs)
- [Nexus – Lively Cities](https://www.nexusmods.com/daggerfallunity/mods/239?tab=docs)
- [Nexus – Daggerfall Unity Save Editor](https://www.nexusmods.com/daggerfallunity/mods/1392)
- [UESP – Daggerfall Enemy Expansion encounter tables](https://en.m.uesp.net/wiki/DFU_Mod:Daggerfall_Enemy_Expansion/Encounter_Tables)
- [r/Daggerfall – Interkarma on fixed dungeon layouts](https://reddit.fabiomanganiello.com/r/Daggerfall/comments/184g0vb/who_the_fuck_builds_castles_like_this/kb1nyno/?context=3)
- [Steam discussion – fixed quests vs random](https://steamcommunity.com/app/1812390/discussions/0/5876659925419580246)
- [gamesas forum – static interior NPC names](https://www.gamesas.com/post596016.html)
