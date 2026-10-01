# Lore app

This folder is the Lore app, a group movie picker that runs on web, iOS and Android from one Expo codebase. The Python pipeline at the repo root does the scoring and writes `site/data.json`, a payload with precomputed scores for every member and film. The app loads that payload and does all subset, mode and filter aggregation on the device. The only backend is Supabase, which handles sign-in, friend links, Letterboxd export uploads and hosting of the published payload.

The app uses Expo SDK 57 with Expo Router, React 19, React Native 0.86, NativeWind 5 (preview) for Tailwind classes, TanStack Query for data and supabase-js for auth and storage. React Compiler and typed routes are on in `app.json`. The [repo README](../README.md) covers the pipeline and [SCOPING.md](../SCOPING.md) is the design document.

## Run it

You need bun and a built payload. If `../site/data.json` does not exist yet, run `uv sync` and `uv run lore all` at the repo root first.

```bash
cd app
bun install
bun run web      # web at http://localhost:8081
bun run ios      # iOS simulator
bun run android  # Android emulator
bun run start    # Expo dev server, pick a platform there
```

Every start script runs `sync-data` first. That script copies `../site/data.json` to `public/data.json` (served same-origin on web) and to `src/lib/data/snapshot.json` (bundled into native builds). Both copies are gitignored. If the source file is missing, the script exits with an error that names the pipeline command. To refresh the payload, run `uv run lore all` at the repo root, then run `bun run sync-data` or restart the dev server.

## Sign-in and environment

Two variables control auth. Copy `.env.example` to `.env` and fill in both from the Supabase dashboard (Settings, API Keys). Expo inlines `EXPO_PUBLIC_*` values at bundle time, so restart the dev server after a change.

- `EXPO_PUBLIC_SUPABASE_URL`: the project URL.
- `EXPO_PUBLIC_SUPABASE_KEY`: the publishable (or legacy anon) key. Never put the secret or service role key here.

When either value is missing, the app runs open with auth disabled. This is the local development fallback, and it is how the app ran before auth existed.

When both are set, route guards in `src/app/_layout.tsx` send a signed-out visitor to the login screen (email and password, with sign-in and sign-up). A signed-in member who has not finished onboarding goes to the onboarding screen. There the member picks the Letterboxd export zip. The app reads the zip on the device with fflate and shows a summary, then uploads the file to the `exports` storage bucket, records it in the `uploads` table and marks the profile as onboarded. The pipeline command `lore pull` imports the zip on its next run. The Crew tab handles friend search and friend requests through the `friendships` table. The table and bucket definitions are in `../supabase/migrations`.

## Where the data comes from

A signed-in member reads `data.json` from the private Supabase `site-data` bucket, where `lore publish` puts it after each pipeline run. A data refresh therefore needs no app redeploy. Any miss (auth unconfigured, signed out, nothing published yet, offline) falls back to a bundled copy. Web fetches the same-origin `/data.json` from `public/`. Native uses `snapshot.json`. The web bundle does not carry the snapshot.

Data flows one way: pipeline to `data.json`, then TanStack Query, then pure selectors, then screens. Choosing who is in the room tonight re-aggregates in memory with no network call.

## Checks

```bash
bun run test       # vitest
bun run typecheck  # tsc --noEmit, strict
bun run lint       # expo lint
```

The vitest files sit next to the code they pin: the scoring, filter, reason and formatting logic in `src/lib/lore/` and the export parser in `src/lib/letterboxd/`. From the repo root, `scripts/lore gates` runs a web export, these three checks and the pipeline's pytest suite in one pass.

## Deploy

Only web ships today. Pushing to `main` triggers a Vercel build of the `lore` project (https://lorenight.vercel.app) from the repo-root `vercel.json`. That file runs `cd app && bun install --frozen-lockfile && bun run vercel-build` and serves `app/dist`. The build script does three things in order:

1. `sync-data --optional`, which skips the sync with a warning because the Git build has no `site/data.json` (the pipeline output is private and gitignored).
2. `expo export --platform web`, which prerenders the static routes.
3. `scripts/post-export.mjs`, which copies `dist/film/[id].html` to `dist/film/detail.html`. The rewrite in `vercel.json` sends `/film/:id` to that file.

Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_KEY` on the Vercel project. Without them the export ships with auth disabled and no way to reach the published payload.

`bun run deploy:web` is the manual escape hatch. It exports the site, runs `scripts/prepare-deploy.mjs` to stage `dist/` into `.deploy/lore`, and uploads that folder with `vercel deploy --prod`. The staging step strips the build fields from `vercel.json` and writes a `.vercel/project.json` that pins the upload to the existing project by id, so the folder name cannot pick the wrong project. This path needs the Vercel CLI signed in. `bun run export:web` alone produces `dist/` for any other static host.

The repo has no EAS configuration, so native store builds are not set up.

## Layout

- `src/app/`: Expo Router routes only. The tabs are Tonight (`(tabs)/index.tsx`) and Crew. `film/[id]` opens as a modal, `filters` as a form sheet, and `login` and `onboarding` are the guarded auth screens.
- `src/screens/<name>/`: the screen bodies with their private components and hooks.
- `src/components/`: shared UI such as chips, poster, data states and the tab bar (`app-tabs.tsx`, with a `.web.tsx` sibling).
- `src/lib/lore/`: the typed domain port of the retired static site's client logic (modes, aggregation, misery floor, filters, reasons), with colocated tests.
- `src/lib/data/`: payload loading (split into web and native files), parsing and query keys.
- `src/lib/auth/`, `src/lib/supabase/`, `src/lib/friends/`: Supabase client, auth context and profile, and the friend graph.
- `src/lib/letterboxd/` and `src/lib/files/`: the on-device export parser and the platform-split file reader.
- `src/lib/session/`: the tonight's crew, mode and filter state, persisted locally.
- `src/lib/strings.ts`: all user-facing copy.
- `src/tw/`: className-enabled primitives for NativeWind and react-native-css.
- `src/global.css`: the design tokens. `src/theme.ts` mirrors them for JavaScript-only consumers such as the tab bar and navigation theme. Change both together.
- `scripts/`: `sync-data.mjs`, `post-export.mjs` and `prepare-deploy.mjs`, described above.

## Conventions

House rules for code in this folder are in [AGENTS.md](AGENTS.md). It also asks you to read the versioned Expo docs at https://docs.expo.dev/versions/v57.0.0/ before writing code. Use bun as the package manager, add packages with `bunx expo install <pkg>`, and keep the `lightningcss` entry under `resolutions` in `package.json`, because native bundling breaks without it.
