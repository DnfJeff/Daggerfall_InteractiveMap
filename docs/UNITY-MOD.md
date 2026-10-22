# The companion as a game mod: research notes

```
log:     2026-10-21
status:  research only, no code yet. Next: prototypes (below), then choose languages.
```

The question: should parts of the companion live **inside the game** (a Daggerfall Unity mod, or a
Daggerfall Online add-on) instead of, or alongside, the standalone app? And would that mean rewriting
in another language? This note maps the ground so a prototype can answer it with evidence.

---

## 1. What the game side already has

Daggerfall Unity (C#, Unity 2019.4) ships readers for everything we parse ourselves (`MapsFile`,
`BlocksFile`, `ImgFile`, `ContentReader`), the building-name generator, discovery tracking, the
travel map and exterior automap windows. A DFU mod is C# compiled in the DFU Unity project with the
Mod Builder and shipped as a `.dfmod` (the same UnityFS bundles we already read for Basic Roads).

Mod hooks relevant to us (to verify against current DFU source when prototyping):

| Need | DFU facility |
|---|---|
| Replace or extend the travel map / automap | `UIWindowFactory.RegisterCustomUIWindow` for `UIWindowType.TravelMap` and friends; subclass the existing windows |
| Per-save data (playthrough plane) | `IHasModSaveData`: the mod's JSON stored in each save folder (`mod_<name>.txt`, as seen in your saves) |
| Shared data (Atlas plane) | a file under the mod's persistent data folder |
| Live position, location, time | `PlayerGPS`, `PlayerEnterExit`, `WorldTime` |
| Talk to other mods (roads) | mod messages (Basic Roads exposes its grids this way) |
| Settings | mod settings (`modsettings.json`) |

**Daggerfall Online** is a JavaScript port. Its saves carry a `modData` block (horse-cart, QuestTracker,
LootCodex…), so it has an add-on system of its own. If that system loads JavaScript, much of this
TypeScript code could run inside it unchanged. That is the cheapest in-game path and worth checking first.

---

## 2. Three shapes, from cheapest to deepest

### A. Bridge mod + standalone companion (recommended first prototype)
A tiny in-game mod publishes live state; the companion stays a web app.

- Mod: every few seconds (and on location change) write `companion-live.json` (position, current
  location and building, in-game time, newly discovered places) to a folder the companion watches,
  or serve it on `localhost`. Optionally read back "waypoints" the companion set.
- Companion: a "Live" source next to the save folders; the map follows the player in real time, and
  "I'm here" becomes automatic.
- Language: a few hundred lines of C# (DFU) and/or JS (DFO). **No rewrite**; the current stack stays.

### B. In-game map window
Replace or augment the travel map inside DFU: hover-to-identify, markers, notes, town names.

- Strength: no second screen; feels native.
- Cost: DFU's UI system is pixel-art panels at 320×200 scale; text-heavy views (journal, bestiary,
  inspector) are laborious there. Our canvas renderer, label tiers and search would be re-implemented
  in C#/Unity UI.
- Language: C#. **Partial rewrite** of the map and UI layers; the parsers are unnecessary (DFU has them).

### C. Full port into the game
Everything in-game. Highest cost, and it gives up what the standalone app is good at (big readable
panels, second monitor, use while not playing, sharing an Atlas). Not recommended unless B proves
delightful.

---

## 3. What carries over, whatever is chosen

| Asset | Portable? |
|---|---|
| The **data model**: planes, anchors (mapId, DFU building key, map pixel), record kinds | Yes. It's JSON. Keep the bundle format as the contract between app and mod. |
| Atlas / profile **export format** | Yes. A mod could read and write it. |
| **Derived data** (encounter odds, directory, region facts) | Logic is small; ports in hours. |
| Parsers | Not needed in DFU (built in); reusable as-is in DFO if it runs JS. |
| UI | Web only. In-game UI is a separate build. |

Design rule from here: **keep the domain model and formats runtime-neutral** (plain data,
documented in `ARCHITECTURE.md` §4) so any front end can share a playthrough's notes.

---

## 4. Prototype plan (each in `Branches/`)

1. `Branches/dfo-addon-spike`: find how Daggerfall Online loads add-ons; load one TS module (e.g.
   the directory search) inside it. Answers: can this codebase run in-game for DFO as-is?
2. `Branches/dfu-bridge-spike`: minimal DFU mod writing `companion-live.json`; companion reads it and
   follows the player. Answers: how much C#, how fiddly the Mod Builder is, live-update latency.
3. `Branches/dfu-map-window-spike` (only if 2 goes well): subclass DFU's travel map to show
   hover names and our markers. Answers: is in-game UI worth its cost?

## 5. Deciding languages afterwards

Questions to answer with the prototypes, not before:
- Does a JS add-on path exist in DFO? If yes, TypeScript stays the core language everywhere.
- Is the DFU side only a bridge (small C#, web app unchanged) or a UI (bigger C# investment)?
- Is a native desktop shell wanted? See `DISTRIBUTION.md`: WebView2/Tauri wrap the current build
  without changing languages.

Footguns to keep in view: two sources of truth for notes (fix: one export format, one owner per
plane); mods changing ground truth (fix: fingerprint and name-by-save, already in place); UI duplicated
across runtimes (fix: keep in-game UI minimal and link out to the companion).
