# Branches

Whole variant workspaces of this project, side by side with the main one. Each subfolder is a
**git worktree**: a full checkout of a branch that shares this repository's history, so variants can
be built, run and compared without switching the main folder away from `main`.

```bash
# new variant
git worktree add Branches/<name> -b <name>
cd Branches/<name> && npm install && npm run dev -- --port 5200

# list / remove
git worktree list
git worktree remove Branches/<name>
```

Conventions:
- One folder per idea: `Branches/unity-mod-spike`, `Branches/electron-shell`, `Branches/ui-experiment`.
- Give each variant its own dev port (`npm run dev -- --port 52xx`); browsers keep data per address,
  so variants never touch each other's notes.
- Note the intent at the top of the variant's `README.md`, and merge back through git when it works.
- Variant folders are not tracked by the main checkout (see `.gitignore`); their history lives on
  their branch.
