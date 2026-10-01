# Lore

Lore is a group movie recommender for a Letterboxd friend group. It ingests each member's public history (a one-time CSV export plus a daily RSS poll), enriches the films with TMDB, scores every candidate per person with an explainable content model, and writes one JSON payload. An Expo app for web, iOS and Android reads that payload. You pick who is in the room tonight, and the app shows ranked, filtered picks with a reason for each.

[SCOPING.md](SCOPING.md) is the design document. This README is the runbook. The app has its own [README](app/README.md).

## How it fits together

The Python pipeline in `lore/` keeps its state in SQLite (`data/movies.db`) and ends by writing `site/data.json`. `lore publish` uploads that file to a private Supabase storage bucket (`site-data`), and the app downloads it at runtime for signed-in members. A data refresh therefore never needs an app redeploy. Members sign up in the app, which stores their export zips in a second private bucket (`exports`). `lore pull` downloads those zips so the pipeline can import them.

## Requirements

- Python 3.12 or newer, with [uv](https://docs.astral.sh/uv/).
- Bun, and Node (the app scripts call `node`).
- A TMDB API key. Registration is free at themoviedb.org/settings/api. The v3 API key and the v4 read access token both work.
- A Supabase project, only if you want app sign-in, in-app uploads and `lore publish`.

## Quickstart

```bash
uv sync                       # once: install dependencies into .venv
cp .env.example .env          # once: add your TMDB key
uv run lore all               # pull, import, sync, enrich, score, build, publish
cd app && bun install         # once: install the app dependencies
bun run web                   # the app, at http://localhost:8081
```

The first run needs each member's export zip (see Member onboarding), because the RSS feed carries only about 50 recent entries per member. `lore all` is idempotent, so run it whenever you want fresh data.

Without Supabase credentials, `pull` and `publish` announce that they are skipping and the rest of the pipeline still runs. `bun run web` copies `site/data.json` into the app before it starts and stops with an error if that file does not exist, so run the pipeline first. Without `app/.env` the app runs open, with auth disabled.

The pipeline command is `lore`, installed into the project environment by uv, so run it as `uv run lore <command>`. The table below uses the bare name for brevity. A separate shell dispatcher, `scripts/lore`, wraps the everyday tasks: `dev`, `build`, `test`, `typecheck`, `lint`, `pipeline` (which runs `uv run lore all`), `deploy` and `gates`. Run `scripts/lore shell` to print a `~/.zshrc` snippet that defines a `lore` shell function and completion for it. Once that function exists, a bare `lore pull` prints the dispatcher's help, so keep the `uv run` prefix for the pipeline steps below.

## Environment variables

| Variable | File | Purpose |
|---|---|---|
| `TMDB_API_KEY` | `.env` | Used by `enrich`. Without it, `enrich` applies `overrides.yaml` and prints a notice. |
| `SUPABASE_URL` | `.env` | Used by `pull`, `publish` and the profile-to-member sync that every command runs. When unset, those steps skip. |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env` | The service key for the same steps. It stays on this machine and never goes in `app/.env`. |
| `EXPO_PUBLIC_SUPABASE_URL` | `app/.env`, Vercel project | The app's Supabase project. When unset, the app runs with auth disabled. |
| `EXPO_PUBLIC_SUPABASE_KEY` | `app/.env`, Vercel project | The publishable (or legacy anon) key, never the service key. |

## Pipeline commands

| Command | What it does |
|---|---|
| `lore pull` | Download the export zips that members uploaded through the app into `data/exports/`, import them, and mark each upload imported or rejected. Skips itself when the Supabase credentials are unset. |
| `lore import` | Parse Letterboxd account-export zips (default `data/exports/*.zip`, or pass paths; `--member` forces the username). Upserts are idempotent, so importing a fresh zip again is safe. |
| `lore sync` | Poll each member's public RSS feed. It makes one request per member, 2 seconds apart, and the entries arrive with TMDB ids. |
| `lore enrich` | Resolve films to TMDB ids (search plus `overrides.yaml`), fetch metadata once per film, refresh streaming providers older than 7 days, build the discover candidate pool, and write `data/resolution_report.md`. |
| `lore score` | Fit a content-based taste model per member and score every enriched film for each of them (model version `content-v1`). `--eval` runs the temporal-holdout evaluation instead. |
| `lore build` | Write `site/data.json`, the payload the app reads. |
| `lore publish` | Upload `site/data.json` to the Supabase `site-data` bucket. Same skip rule as `pull`. |
| `lore all` | Run pull, import, sync, enrich, score, build and publish in that order. |

Run the commands from the project root, where `config.toml` lives. To use another directory, pass `--root <dir>` before the command name.

## Member onboarding

Each member spends about two minutes, once.

1. In Letterboxd, open Settings, then Data, then "Export your data".
2. Hand over the zip. The preferred way is the app: sign in, and onboarding walks you through the upload. The app parses the zip on your device for a summary and stores it in the group's private Supabase bucket. `lore pull`, which is part of `lore all`, imports it on the next pipeline run. The alternative is to send the zip to Zach, who places it in `data/exports/`.
3. Leave the file name alone. The importer reads the username from `profile.csv` inside the zip and falls back to the `letterboxd-<user>-...` file name.

That is the whole backfill. RSS keeps each member current from then on. Re-export a fresh zip a couple of times a year to catch what RSS misses, such as watchlist changes and ratings made without a diary entry.

Membership is self-serve. Every command merges onboarded app profiles into the roster, so signing up in the app is the whole onboarding and nobody edits config for a new member. The `[[members]]` entries in `config.toml` remain as seeds, overrides and the offline fallback. The import rejects a zip whose username has no app profile and no `config.toml` entry.

## Files that are yours to edit

- `config.toml` holds the members, the watch region, the contact address for the polite User-Agent, the pre-checked streaming services, and the `[pool]` caps (`max_films`, `vote_floor`) for candidate discovery.
- `veto.yaml` lists group-wide permanent vetoes (slug mapped to who and why). A vetoed film never renders in any mode.
- `overrides.yaml` holds manual film-identity fixes for whatever `data/resolution_report.md` could not resolve automatically (slug or `~id` mapped to a TMDB id). Re-run `lore enrich` after an edit.

## Tests

```bash
uv run pytest                 # pipeline tests, from the repo root
cd app
bun run test                  # app tests (vitest)
bun run typecheck             # tsc --noEmit
bun run lint                  # expo lint
```

`scripts/lore gates` runs the app export, typecheck, lint and tests, and then `uv run pytest`, in one pass.

If `uv run pytest` fails with "Failed to spawn: `pytest`", the virtual environment predates the folder rename from `movies` to `lore`: `.venv/bin/pytest` still points at the old interpreter path. `uv run python -m pytest` works around it. Recreating the environment with `rm -rf .venv && uv sync` fixes it.

## Code layout

- `lore/` is the pipeline package. `cli.py` is the entry point and `config.py` loads the config files and `.env`. `db.py` defines the SQLite schema. The stages live in `ingest/` (`importer.py`, `rss.py`, `pull.py`), `enrich/` (`resolve.py`, `tmdb.py`, `pool.py`), `model/` (`features.py`, `score.py`, `evaluate.py`) and `build/builder.py`. `publish.py` does the upload.
- `app/` is the Expo app, with its routes in `app/src/app/` and the scoring logic in `app/src/lib/lore/`.
- `supabase/` holds `config.toml` and the migrations. They create the profiles, uploads and friendships tables, the private `exports` and `site-data` buckets, and the service-role grants.
- `tests/` holds the pytest suites for ingest, the end-to-end pipeline and `pull`.
- `scripts/lore` is the shell dispatcher described in the Quickstart.
- `data/` and `site/` are gitignored. `data/` has `movies.db`, `exports/`, `resolution_report.md` and `pipeline.log`. `site/` has `data.json`.
- `vercel.json` at the root holds the web build command and the routing rules.
- `CLAUDE.md`, `HANDOFF.md`, `PASSOFF.md` and `docs/` are working notes for coding sessions in this repo.

## Running unattended

A LaunchAgent, `~/Library/LaunchAgents/com.lore.pipeline.plist`, runs `uv run lore all` daily at 6:30 AM. A run missed while the machine sleeps fires on wake. The loop is short: members upload zips in the app, `pull` imports them, and `publish` puts fresh scores where the app reads them.

As of 2026-09-30 the plist still points at `/Users/zachshort/Projects/movies`, the old location of this project. That folder no longer holds the pipeline, so every run fails with "Failed to spawn: `lore`", and the log there is the only record. The last successful run in this repo's `data/pipeline.log` is 2026-08-27. To repair it, change the `cd` target and the two log paths in the plist to `/Users/zachshort/Projects/lore`, then reload the agent:

```bash
launchctl bootout gui/$(id -u)/com.lore.pipeline
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.lore.pipeline.plist
```

To remove the agent, run only the `bootout` line.

## Deploy

The web app deploys when you push to `main`. Vercel (the `lore` project, https://lorenight.vercel.app) builds from the root `vercel.json`: `cd app && bun install --frozen-lockfile && bun run vercel-build`, with output in `app/dist`. Redeploy only for code changes. Data refreshes flow through `lore publish`.

The Git build has no `site/data.json`, because the pipeline output is private and gitignored, so `vercel-build` runs `sync-data --optional` and skips it. The web app then has no same-origin `/data.json` fallback and reads the payload that `lore publish` put in Supabase. The build also needs `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_KEY` set on the Vercel project. Without them the export ships with auth disabled and no way to reach that payload.

For a manual deploy, `cd app && bun run deploy:web` exports the app (this run does need `site/data.json`), stages `dist/` into `app/.deploy/lore`, and uploads it prebuilt with `vercel deploy --prod`. It pins the deploy to the Vercel project id through `.vercel/project.json`, so the name of the staging folder no longer decides which project receives it. That was the case before the `movienight` to `lore` rename. Routing has one source, the root `vercel.json`, with the build fields stripped on the way into the staging folder.

If the URL ever moves, three things must change together: the domain, `supabase/config.toml` (`site_url` and `additional_redirect_urls`), and the hosted project's Auth URL Configuration. Otherwise auth redirects break.

The Jinja-rendered static site that the pipeline once emitted beside `data.json` was removed in commit `1359022` once the app became the product. Recover it with `git show 1359022^:lore/build/templates/index.html.j2`. The same folder held `app.js` and `style.css`.

## Design notes and deviations from SCOPING

- Dependencies are `httpx`, `feedparser`, `pyyaml` and `tenacity`. pandas was dropped because the stdlib `csv` and `zipfile` modules are enough for these small files. numpy and scipy are planned for the phase 2 MovieLens work and are not installed.
- Conditional GET was dropped. Letterboxd RSS was verified live on 2026-08-25 to send `cache-control: no-store` and no validators, so the poller makes one plain GET per member per day.
- The page-fetch fallback in SCOPING section 5, step 4, was not built, because it sits inside the ToS prohibition. Unresolved films go to the resolution report for a 20-second manual override.
- The importer handles both full film URLs and `boxd.it` short links. Rows without a slug key on title and year, and they converge with the RSS rows later.
- TV entries (RSS `tmdb:tvId`) are stored, excluded from scoring and listed in the resolution report, following SCOPING's `kind` reservation.

## Attribution

The app credits TMDB for metadata and posters, and JustWatch via TMDB for streaming availability (on the film screen, `app/src/screens/film/film-screen.tsx`). These credits are required by the upstream terms, so keep them if you restyle.

## Phase 2

SCOPING section 8 plans a nightly GitHub Actions cron, a weekly provider refresh, MovieLens ml-32m item-item collaborative filtering (gated on support), drift detection and the eval in CI. The cron needs a home for the `data/movies.db` state first.
