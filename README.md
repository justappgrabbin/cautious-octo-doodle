# Synthia Canonical Build — 2026-05-24

This build treats **Synthia_Morph_Substrate_FULL_PureJS.html** as the sovereign living runtime. MorphOS, Resonance, MRNN, the orchestrator demo, Web Linux archives, MCP bridge, keyboard sidecar, and Supabase schema are mounted around it instead of replacing it.

## Run locally

```bash
cd public
python3 -m http.server 8080
```

Open `http://localhost:8080`.

## Layout

- `public/index.html` — canonical launcher / mode switcher.
- `public/apps/synthia-substrate.html` — primary living substrate.
- `public/apps/*.html` — mounted embodiments and historical donor shells.
- `src/core` — orchestrator/bootstrap TypeScript.
- `src/bridges` — MCP/API/server/mobile bridges.
- `src/materialize` — app materialization logic.
- `database/supabase-schema.sql` — persistence schema.
- `archives` — original ZIP packs.
- `sources/originals` — direct source-preserving copies.
- `BUILD_MANIFEST.json` — checksums and placement map.

## Canonical rule

Synthia is not a module inside the OS. The OS is one expression of Synthia.
