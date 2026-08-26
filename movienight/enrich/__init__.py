"""Enrich orchestrator: overrides → search resolution → metadata fetch →
candidate-pool discovery → weekly provider refresh → resolution report."""

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone

from ..config import Config
from . import pool as pool_mod
from . import resolve
from .tmdb import Tmdb, TmdbNotFound, store_providers

PROVIDER_REFRESH_DAYS = 7


def _films_missing_metadata(conn: sqlite3.Connection) -> list[int]:
    return [
        r["id"]
        for r in conn.execute(
            """SELECT f.id FROM film f
               LEFT JOIN film_tmdb ft ON ft.film_id = f.id
               WHERE f.tmdb_id IS NOT NULL AND ft.film_id IS NULL
                 AND f.kind != 'tv'"""
        )
    ]


def _providers_stale(conn: sqlite3.Connection, cfg: Config) -> list[sqlite3.Row]:
    """Candidate-scope films (pool or on a watchlist, unwatched-ish) whose
    provider data is older than the refresh window (SCOPING §5)."""
    cutoff = (
        datetime.now(timezone.utc) - timedelta(days=PROVIDER_REFRESH_DAYS)
    ).strftime("%Y-%m-%dT%H:%M:%SZ")
    return conn.execute(
        """SELECT DISTINCT f.id, f.tmdb_id FROM film f
           JOIN providers p ON p.film_id = f.id AND p.region = ?
           WHERE f.tmdb_id IS NOT NULL
             AND (f.pool = 1 OR f.id IN
                  (SELECT film_id FROM interaction WHERE in_watchlist = 1))
             AND p.fetched_at < ?""",
        (cfg.region, cutoff),
    ).fetchall()


def run(conn: sqlite3.Connection, cfg: Config, tmdb_factory=None) -> None:
    overrides = cfg.overrides()
    applied = resolve.apply_overrides(conn, overrides)
    if applied:
        print(f"enrich: {applied} manual overrides applied")
    conn.commit()

    key = cfg.tmdb_key
    if not key:
        print(
            "enrich: no TMDB_API_KEY set — skipping search resolution, metadata,\n"
            "        and pool discovery. Register a free key at\n"
            "        https://www.themoviedb.org/settings/api and put it in .env\n"
            "        (see .env.example), then re-run `movienight enrich`."
        )
        resolve.write_report(conn, cfg)
        return

    tmdb = (tmdb_factory or Tmdb)(key, cfg.user_agent)
    try:
        stats = resolve.resolve_by_search(conn, tmdb)
        conn.commit()
        if any(stats.values()):
            print(
                f"enrich: search resolution — {stats['resolved']} resolved, "
                f"{stats['ambiguous']} ambiguous, {stats['unmatched']} unmatched"
            )

        missing = _films_missing_metadata(conn)
        if missing:
            print(f"enrich: fetching metadata for {len(missing)} films…")
            n = resolve.fetch_metadata(conn, tmdb, cfg, missing)
            print(f"enrich: {n} films enriched")

        created = pool_mod.run(conn, tmdb, cfg)
        if created:
            print(f"enrich: fetching metadata for {len(created)} pool films…")
            resolve.fetch_metadata(conn, tmdb, cfg, created)

        stale = _providers_stale(conn, cfg)
        if stale:
            print(f"enrich: refreshing providers for {len(stale)} candidate films…")
            for row in stale:
                try:
                    data = tmdb.providers(row["tmdb_id"])
                except TmdbNotFound:
                    continue
                store_providers(
                    conn, row["id"], data.get("results") or {}, cfg.region
                )
            conn.commit()
    finally:
        tmdb.close()

    resolve.write_report(conn, cfg)
    print(f"enrich: done ({tmdb.calls} TMDB calls this run)")
