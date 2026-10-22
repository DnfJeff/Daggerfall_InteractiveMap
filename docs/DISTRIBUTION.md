# Distribution: personal, release, and the desktop shell

```
log:     2026-10-21
status:  desktop app (Tauri + WebView2) is the shipping form; the web build remains the core
```

## What exists now

| Copy | Folder | Start | Notes live |
|---|---|---|---|
| Dev | repo root | `npm run dev` (port 5178, auto-loads `DFC_DEV_*` folders) | dev browser profile |
| Desktop dev | repo root | `npx tauri dev` (native window over the dev server) | `src-tauri/target/debug/data/` |
| **Personal** | `Personal/` | desktop shortcut → `Daggerfall Companion.exe` | `Personal/data/` |
| Release | `Releases/DaggerfallCompanion-<v>/` (+ zip) | `Daggerfall Companion.exe` | `<release>/data/` |

Personal and Release are the same build (`scripts/make-release.ps1`, `-Personal` for the former).

## The desktop shell (`src-tauri/`)

A ~60-line Rust program using **Tauri 2**:
- the built web app (`dist/`) is **embedded in the .exe** and served from Tauri's internal protocol
  (no localhost server, no ports);
- it opens one native window rendered by **WebView2**, which ships with Windows 10/11;
- WebView2's storage directory is set to `data/` beside the exe, so IndexedDB (notes, settings,
  remembered folder handles) travels with the folder: copy the folder, keep your notes;
- release profile: size-optimised, LTO, stripped.

The web app doesn't know it's in a shell; the same `dist/` also runs in any Chromium browser. If a
feature ever needs native powers (reading a folder path without the picker, file watching for a live
save bridge), add a Tauri command in `src-tauri/src/main.rs` and call it from the app behind a
capability check.

Retired: the PowerShell `HttpListener` + Edge `--app` runtime (worked, but was two processes and a
script). `scripts/launch.ps1` (Node + `vite preview`) remains for running straight from source.

## Shells considered

| Option | Size | Verdict |
|---|---|---|
| **Tauri (Rust + system WebView2)** | single small exe | **Chosen**: one program, no runtime to install, embedded assets, room for native commands |
| WebView2 host in C# | ~1 MB + .NET runtime (or ~70 MB self-contained) | Fine, but needs .NET on the target or a large bundle |
| Electron | 80–150 MB | Heaviest; nothing we need that Tauri lacks |
| Neutralinojs | ~2 MB | Smaller ecosystem, thinner native API |
| Browser app window + local server | ~0.3 MB | Previous approach; not one clean process |

Cross-platform later: Tauri also builds for macOS/Linux (WKWebView/WebKitGTK); the File System
Access API is Chromium-only, so those builds would swap the folder pickers for Tauri's native dialog
and file APIs.
