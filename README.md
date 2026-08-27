# Lore

Group movie recommender for our Letterboxd friend group. Ingests everyone's
public histories (one-time CSV export + daily RSS), enriches with TMDB,
scores every candidate per person with an explainable content model, and
emits a static site where you pick who's in the room tonight and get ranked,
filtered, justified picks.

**[SCOPING.md](SCOPING.md) is the design document.** This README is the runbook.

## Quickstart

```bash
uv sync                       # once: install deps into .venv
cp .env.example .env          # once: add your TMDB key (themoviedb.org/settings/api)
uv run lore all         # import → sync → enrich → score → build → publish
cd app && bun run web         # the product, at localhost:8081
```

`lore all` is idempotent — run it whenever you want fresh data.

## Commands

| Command | What it does |
|---|---|
| `lore pull` | Download export zips members uploaded through the app (Supabase bucket) into `data/exports/` and import them. Skips itself when `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are unset. |
| `lore publish` | Upload `site/data.json` to the Supabase `site-data` bucket, where the app reads it at runtime — data refreshes never need an app redeploy. Same skip rule as `pull`. |
| `lore import` | Parse `data/exports/*.zip` (Letterboxd account exports). Idempotent upserts; re-import a fresh zip any time. |
| `lore sync` | Poll each member's public RSS feed (≈50 recent diary entries, arrives with TMDB ids). One polite request per member. |
| `lore enrich` | Resolve films → TMDB ids (search + `overrides.yaml`), fetch metadata/providers (one cached call per film ever), build the discover candidate pool, write `data/resolution_report.md`. |
| `lore score` | Fit per-member taste models, score every enriched film per member. `--eval` runs the temporal-holdout evaluation instead. |
| `lore build` | Emit `site/data.json` — the payload the app reads (and `lore publish` uploads). |

## Member onboarding (one-time, ~2 min each)

1. Letterboxd → Settings → Data → **Export your data**.
2. Hand over the zip, either way:
   - **In the app** (preferred): sign in, and onboarding walks you through
     uploading the zip. It's parsed on your device for a summary, stored in
     the group's private Supabase bucket, and `lore pull` (part of
     `lore all`) imports it on the next pipeline run.
   - **Old school**: send the zip to Zach; it lands in `data/exports/`
     (don't rename — the `letterboxd-<user>-…` filename identifies whose it
     is).
3. That's the whole backfill. RSS keeps it current daily from then on;
   re-export a fresh zip a couple times a year to catch anything RSS missed
   (watchlist changes, rate-without-diary edits).

Membership is self-serve: every command merges onboarded app profiles into
the roster, so signing up in the app is the whole onboarding — nobody edits
config for a new member. `config.toml`'s `[[members]]` entries remain as
seeds/overrides (and the offline fallback). Watch-region and pre-checked
streaming services live there too. Zips that resolve to a username with no
profile and no config entry are marked rejected.

## Files that are yours to edit

- `config.toml` — members, region, contact for the polite User-Agent, services.
- `veto.yaml` — group-wide permanent vetoes (slug → who/why). Vetoed films
  never render in any mode.
- `overrides.yaml` — manual film-identity fixes for whatever
  `data/resolution_report.md` couldn't auto-resolve (slug or `~id` → TMDB id).

## Design notes / deviations from SCOPING

- **Deps**: dropped pandas — the CSVs are tiny and stdlib `csv`/`zipfile`
  suffice; numpy/scipy arrive with phase 2's MovieLens CF as planned.
- **Conditional GET dropped**: verified live (2026-08-25) that Letterboxd RSS
  sends `cache-control: no-store` and no validators, so the poller does one
  plain GET per member per day.
- **§5 step-4 page-fetch fallback not shipped** (it sits inside the ToS
  prohibition); unresolved films go to the report for a 20-second manual
  override instead.
- **Export URIs**: importer handles both full film URLs and `boxd.it` short
  links (slugless rows key on title+year and converge with RSS rows later).
- **TV entries** (RSS `tmdb:tvId`): stored, excluded from scoring, listed in
  the resolution report — per SCOPING's `kind` reservation.

## Attribution (required by upstream terms)

The site footer credits TMDB (metadata/posters) and JustWatch-via-TMDB
(streaming availability, also tagged per card). Keep them if you restyle.

## Phase 2 (later, see SCOPING §8)

Nightly GitHub Actions cron, weekly provider refresh, MovieLens ml-32m
item-item CF (support-gated), drift detection, eval in CI.

## Running unattended

A LaunchAgent (`~/Library/LaunchAgents/com.lore.pipeline.plist`) runs
`lore all` daily at 6:30 AM (missed runs fire on wake), logging to
`data/pipeline.log`. That's the whole loop: members upload zips in the app →
`pull` imports them → `publish` puts fresh scores where the app reads them.
Remove with `launchctl bootout gui/$(id -u)/com.lore.pipeline`.
Phase 2 moves this to a GitHub Actions cron (needs a home for `data/movies.db`
state first — see SCOPING §8).

## Deploy

**The app (web)**: push to `main`. Vercel (`lore` project,
https://lorenight.vercel.app) builds from the repo-root `vercel.json` —
`cd app && bun install && bun run vercel-build` → `app/dist`. Redeploy only for
code changes; data refreshes flow through `lore publish`.

The Git build has no `site/data.json` — the pipeline's output is private and
gitignored — so `vercel-build` runs `sync-data --optional` and skips it. Web
then has no same-origin `/data.json` fallback and reads the payload `lore
publish` put in Supabase. The build also needs `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_KEY` set on the Vercel project: without them the export
ships with auth disabled and no way to reach that payload.

`cd app && bun run deploy:web` is the manual escape hatch — export, stage into
`.deploy/lore`, upload prebuilt. It pins the deploy to the project *id* through
`.vercel/project.json`, so the staging dir's name no longer decides which
project it lands on (it did, before the `movienight` → `lore` rename). Routing
config has one source of truth, the repo-root `vercel.json`, with the build
fields stripped on the way into the staging dir.

If the URL ever moves, three things move together — the domain,
`supabase/config.toml` (`site_url` + `additional_redirect_urls`), and the hosted
project's Auth URL Configuration — or auth redirects break.

The Jinja-rendered static site this pipeline used to emit alongside
`data.json` was archived once the app became the product — it lives in
`~/Projects/archives/lore-legacy-static-site/` if it is ever wanted back.
