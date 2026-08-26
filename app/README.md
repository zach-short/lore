# lore app

Universal Expo app (web + iOS + Android) for the lore picker. The Python
pipeline at the repo root stays the brain — it emits `site/data.json` with
precomputed per-member × per-film scores; this app is the face: it loads that
payload and does all subset/mode/filter aggregation on device. No backend.

## Run it

```bash
cd app
bun install
bun run web      # web at http://localhost:8081 (syncs data first)
bun run ios      # iOS simulator via Expo Go
bun run android  # Android emulator via Expo Go
```

Every start script runs `sync-data` first, which copies `../site/data.json`
into `public/data.json` (served same-origin on web) and
`src/lib/data/snapshot.json` (bundled into native builds as the offline
fallback). Refresh the payload itself with `uv run lore all` at the repo
root, then restart or re-run `bun run sync-data`.

Optional: set `EXPO_PUBLIC_DATA_URL` to a deployed `data.json` URL and native
builds will prefer fetching it over the bundled snapshot (falling back when
offline).

## Checks

```bash
bun run test       # vitest — the scoring/filter/reason port is pinned by 55 tests
bun run typecheck  # strict tsc
bunx expo lint
```

## Deploy (web)

```bash
bun run export:web          # prerenders static routes into dist/
wrangler pages deploy dist  # or any static host
```

`dist/` carries `data.json` with it, so a deploy is one artifact with no
server. Native store builds are an EAS concern for later (`eas build`).

## Layout

- `src/app/` — Expo Router routes only (thin: each renders one screen)
- `src/screens/<name>/` — screen bodies + their private components and hooks
- `src/components/` — shared UI (chips, poster, data states, tabs)
- `src/lib/lore/` — the typed domain port of the site's client logic
  (modes, aggregation, misery floor, filters, reasons) with colocated tests
- `src/lib/data/` — payload loading (platform-split web/native) + query keys
- `src/lib/session/` — tonight's-crew/mode/filter state, persisted locally
- `src/tw/` — className-enabled primitives (NativeWind v5 / react-native-css)
- `src/global.css` — the design tokens; `src/theme.ts` mirrors them for
  JS-only consumers (tab bar, nav theme). Change both together.

Data flows one way: pipeline → `data.json` → TanStack Query → pure selectors →
screens. Picking who's in the room tonight just re-aggregates in memory.
