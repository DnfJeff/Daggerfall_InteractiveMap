# Daggerfall Companion: User Experience Vision

```
log:      2026-10-21
status:   vision, pre-design
pairs with: daggerfall-companion-data-landscape.md (the data facts live there)
scope:    how the tool feels and flows, not how it's built
```

---

## 0. The one-line pitch

The in-game map, freed from the game. Same art, same layers, same mental model, now zoomable and hoverable, and every town is one click from its street map. Wrapped in a companion and notebook that remember what you learn across every playthrough and what happened in this one.

---

## 1. Guiding principles

**Feels like Daggerfall first.** The base canvas is the game's own map art and layers, pulled from the player's install. Someone who knows the travel map should be oriented instantly. Improvement is in the controls and the reach, not a reskin.

**The game folder is the source of truth.** Nothing is bundled that the player's install can supply. Art, map data, bestiary sprites, and saves all come from paths the user sets.

**Explicit over automatic.** No scanning, no searching the disk, no guessing. The user sets a path once in preferences. When they've changed something, they press refresh. The tool tells them what it found.

**Spoilers are a dial, not a default.** Daggerfall hides things: unmarked places, unidentified shop names, quest locations. The tool can know all of it, so it must let the player decide how much they see.

**Two kinds of memory, clearly marked.** What's true of the world goes in the Atlas. What happened in this run goes in a Playthrough. The user should never wonder which one they're writing into.

**Start small, stay honest.** Phase one is the game-asset map workspace done well. Everything else layers on once that's right.

---

## 2. First run

1. **Welcome → point at your game.** One screen. "Where is your Daggerfall data?" A folder picker for the `ARENA2` folder. Optional second and third pickers for the DFU install (for mods/overrides) and the DFU save folder. Each shows a plain status: found / not found / what was found ("44 regions, 15,251 locations").
2. **Choose a spoiler level.** Three presets with a one-line description each, adjustable later:
   - *Explorer*: show only what the game would show a new character.
   - *Wanderer*: show all locations, hide shop names and dungeon contents until you reveal them.
   - *Cartographer*: show everything.
3. **Land on the Iliac Bay.** The full map, the way the game shows it, ready to zoom.

The first run should take under a minute and never feel like configuration.

---

## 3. The workspace

One window, three persistent areas:

```
┌───────────────┬──────────────────────────────────────┬───────────────┐
│  Left rail     │            Map canvas                │  Right panel  │
│  (Companion    │  (Iliac Bay → Region → Town →        │  (Inspector:  │
│   sections)    │   Building / Dungeon)                │   whatever is │
│                │                                      │   selected)   │
├───────────────┴──────────────────────────────────────┴───────────────┤
│  Status bar: active Profile · bound save · spoiler level · refresh   │
└──────────────────────────────────────────────────────────────────────┘
```

- **Left rail** is where you switch between Map, Bestiary, Guides, Notebook, Character, and whatever gets added later. The map remains the home.
- **Map canvas** is the main stage.
- **Right panel** inspects whatever you've selected: a region, a town, a building, a marker, a monster.
- **Status bar** always answers "whose notes am I in, which save am I reading, how much am I seeing?"

---

## 4. The map, level by level

The canvas is one continuous space with natural stopping points. Each level uses the art the game uses at that level.

### 4.1 Iliac Bay (overview)

The province-scale map the game opens on. Regions outlined and named. Hovering a region highlights it and shows its name in a small tooltip. Clicking zooms into it, the same way right-click zooms in the game, but smooth.

### 4.2 Region

The region map art, scaled up so it holds up under zoom. Location dots in the game's own colors by type. This is where most time is spent.

- **Hover to identify.** Hover any dot: name, type, and a one-line note if you have one. This is the single biggest missing piece in the game's map.
- **Pan and zoom freely,** across region borders, without the game's "back out, pick another region" step.
- **Layer toggles,** matching the game's filters (towns, dungeons, temples, homes) plus extra layers: roads and tracks if present, your markers, discovered vs. undiscovered, quest-related.
- **Find.** A search box that matches location names and your own marker names, with fuzzy matching and region context in the results ("Ashfield Hall — Daggerfall region, village").

### 4.3 Selecting a town: "Open this town"

In the game, clicking a town offers fast travel. Here, the same click offers **Open town**. One action takes you straight into the town map. No menus, no intermediate screen.

The right panel, before you open it, shows a town card: name, region, size, a thumbnail of the layout, counts of shops/temples/guilds, your notes, and markers.

### 4.4 Town

The town's own automap, drawn from the game's block maps, at full zoom.

- Buildings colored by type, exactly as the game's exterior automap colors them, with a legend.
- **Hover a building:** type, quality, name (subject to spoiler level), your notes.
- **Click a building:** it pins in the right panel, where you can annotate it.
- Shops whose names are hidden by the spoiler level show as "Armorer (unidentified)" with a small **reveal** affordance. Revealing can be per building, per town, or global.
- A breadcrumb (Iliac Bay › Daggerfall › Ashfield Hall) for getting back out.

### 4.5 Dungeon

Selecting a dungeon offers **Open dungeon**: a 2D block map with what's fixed (layout, entrance, marker positions) and what's always the same. Contents are hidden or shown by spoiler level. This is a later phase, but the flow should feel identical to opening a town.

---

## 5. Spoiler control

Spoilers are a first-class control, visible in the status bar and adjustable anywhere.

- **Global level** from the presets in §2.
- **Per-category overrides:** location visibility, shop names, dungeon contents, quest targets.
- **Local reveals:** "show this one" on a single item, without changing global settings.
- **Playthrough-aware option:** if a save is bound, the tool can match what the character has discovered. Undiscovered places fade, identified shops show names, the rest stays hidden.
- Revealed state is remembered per Profile, so revealing something in one playthrough doesn't spoil the next.

---

## 6. Markers and notes

### 6.1 Placing a marker

Right-click anywhere on any map level: **Add marker**. A small composer opens:

- name
- icon / category (town, dungeon, landmark, danger, quest, custom)
- note body (freeform, with simple structure: links, checklists)
- tags
- **Where it lives:** *Atlas* (shared across all playthroughs) or *This playthrough* (current Profile)

Markers can sit on an existing location or building, or on a bare spot: an unmarked shack, a roadside camp, a hill with a view.

### 6.2 Attaching to existing things

Every location, building, dungeon, and monster can carry notes and tags without placing a separate marker. Select it, write in the right panel. Same composer, same Atlas/Playthrough choice.

### 6.3 Seeing the two planes

Atlas and Playthrough content share the same shapes but are visually distinct everywhere they appear: a subtle color or badge, plus a filter to show either or both. Moving or copying a note between planes is a deliberate action ("Promote to Atlas", "Copy to this playthrough"), never an accident.

---

## 7. Profiles (the playthrough plane)

A Profile is a playthrough's notebook, loaded like a game save.

- **Profile picker** styled after the game's save slots: name, character portrait if bound, last opened, a few counts (markers, notes, kills).
- **New Profile:** name it, optionally bind it to a save.
- **Binding is loose and optional.** A Profile may point at a DFU save folder (or a character's latest save). Two Profiles can point at the same save; the tool doesn't mind. A Profile can be re-pointed at a newer save.
- **Switching Profiles** swaps the playthrough notes, markers, reveals, and bestiary progress. The Atlas never changes.
- **No Profile** is a valid state: Atlas-only browsing, like a reference map.

### 7.1 The journal

Inside a Profile, a journal: timestamped entries, written quickly, optionally linked to a place, building, monster, or marker.

- Entries can carry in-game time as well as real time.
- If a save is bound, the game's own notebook entries can be shown alongside, read-only, so the player's log and the game's log sit side by side.
- Entries are searchable and filterable by place, tag, or date.

---

## 8. Character

When a Profile is bound to a save, a Character section shows the build as the game sees it: name, race, class, level, attributes, skills, current location (with a "show on map" jump). Read-only, refreshed on demand. No save editing; this tool observes.

---

## 9. Bestiary

A section in the left rail, pulled from the game's data and sprites via the game path.

- Grid or list of creatures, each with sprite, level, key traits, and the player's own notes.
- **Slain checkbox** per creature (per Profile).
- **Optional counter** per creature, with simple + / − controls, hidden unless the user turns it on.
- Atlas notes on a creature ("silver or better, cast reflect first") show in every Profile. Kills and counts are per Profile.
- Filters: slain / not slain, by type, by level band.

---

## 10. Guides and the companion space

The left rail is open-ended. Guides start as a reading space for structured reference (quest notes, faction notes, how-tos) and can link anywhere into the map or bestiary. Each section follows the same rule: content can be Atlas or Playthrough, and the badge says which. New sections should be able to slot in without changing how the rest works.

---

## 11. Preferences and refresh

One preferences screen:

- **Paths:** game data, DFU install, DFU saves. Each with a folder picker, a status line, and its own **Refresh**.
- **Spoilers:** global level and overrides.
- **Display:** map art source (vanilla vs. the player's DFU overrides), marker sizes, label density.
- **Data:** export/import Atlas and Profiles, so they can be backed up or moved between machines.

Refresh is always manual and always reports what changed ("12 new saves found", "map art reloaded"). Nothing happens in the background behind the user's back.

---

## 12. Signature moments

The experiences the tool lives or dies by:

1. **"Are you passing through Ashfield Hall?"** Type the name, land on the town card, open the town, hover the buildings. Under ten seconds, no wiki tab.
2. **The unmarked shack.** Spot it in-game, right-click the spot on the region map, mark it Atlas. It's there in every future run.
3. **Picking up an old run.** Open the Profile picker, pick the slot, and the map, notes, reveals, and bestiary progress all snap back to that playthrough.
4. **Spoiler-safe exploring.** Explorer level plus a bound save, and the map shows only what this character knows, with every hidden thing one deliberate click away.

---

## 13. Phasing

**Phase 1: the map workspace.** Game paths, overview → region → town, zoom, hover-to-ID, find, "Open town", layer toggles, spoiler levels. No notes yet. This has to feel better than the game's map on its own.

**Phase 2: markers and the two planes.** Atlas and Profile notes, markers on any level, attachments to places and buildings, the Profile picker.

**Phase 3: companion sections.** Bestiary with slain/counter, journal, character view from a bound save.

**Phase 4: depth.** Dungeons, roads layer, guides, discovery-aware spoilers, import/export polish.

Each phase should stand on its own and be worth using.

---

## 14. Reference points

**DFOnline's "Enhanced Map"** showed that a zoomable, data-rich Daggerfall map is compelling, but in-game its controls weren't clean enough to rely on. The takeaway: the zoom and the dataset are the right ambition; the controls and the separation from the game are where this tool can do better.

**The game's own travel map and automap** set the mental model. Matching its look and colors is a feature, not a limitation.

---

## 15. Open UX questions

1. Does the canvas transition between levels as one continuous zoom, or in clean steps with animation between them?
2. How loud should the Atlas/Playthrough distinction be: subtle badge, or strong color coding?
3. When a bound save advances, does the Profile follow the newest save automatically, or does the user re-point it?
4. Should town and dungeon maps open in place, in tabs, or side by side with the region?
5. How are mod-added locations and renamed places surfaced: as part of the map, or as an overlay the user turns on?
