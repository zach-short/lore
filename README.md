# movienight

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
uv run movienight all         # import → sync → enrich → score → build
open site/index.html          # the product
```

`movienight all` is idempotent — run it whenever you want fresh data.

## Commands

| Command | What it does |
|---|---|
| `movienight import` | Parse `data/exports/*.zip` (Letterboxd account exports). Idempotent upserts; re-import a fresh zip any time. |
| `movienight sync` | Poll each member's public RSS feed (≈50 recent diary entries, arrives with TMDB ids). One polite request per member. |
| `movienight enrich` | Resolve films → TMDB ids (search + `overrides.yaml`), fetch metadata/providers (one cached call per film ever), build the discover candidate pool, write `data/resolution_report.md`. |
| `movienight score` | Fit per-member taste models, score every enriched film per member. `--eval` runs the temporal-holdout evaluation instead. |
| `movienight build` | Emit `site/` (index.html + data.js). Works from `file://`. |

## Member onboarding (one-time, ~2 min each)

1. Letterboxd → Settings → Data → **Export your data**.
2. Send the zip to Zach; it lands in `data/exports/` (don't rename — the
   `letterboxd-<user>-…` filename identifies whose it is).
3. That's the whole backfill. RSS keeps it current daily from then on;
   re-export a fresh zip a couple times a year to catch anything RSS missed
   (watchlist changes, rate-without-diary edits).

Members live in `config.toml`. Watch-region and pre-checked streaming
services live there too.

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

## Deploy (when wanted)

The site is static. Per SCOPING: `wrangler pages deploy site/` (Cloudflare
Pages, unlisted URL). Any static host works identically.
