# Releases

Portable builds of the companion. A release is one program and a readme:

```
DaggerfallCompanion-<version>/
  Daggerfall Companion.exe        the whole app (web UI embedded), runs on Windows 10/11, no install
  README.txt                      end-user instructions
  data/                           created on first run: that copy's notes and settings
DaggerfallCompanion-<version>.zip the same, without data/ (safe to share)
```

Make one with:

```bash
powershell -ExecutionPolicy Bypass -File scripts/make-release.ps1
```

Needs the Rust toolchain and Node on the building machine (`npx tauri build`); the result needs
neither. The version comes from `package.json`; the commit hash is stamped into the release README.
Release folders and zips are not tracked in git; rebuild them from any commit.

**Personal vs release.** Your everyday copy lives in `Personal/` (same build, its own `data/`), run by
the desktop shortcut. Releases are frozen snapshots for sharing. Copies never share notes; move them
with Data & backups → Export in one, Import in the other.
