"""Candidate-pool discovery (SCOPING §7c): ~12 TMDB Discover queries seeded by
the group's top genres, keywords, directors, and non-English languages, each
taking the top pages by popularity and by damped rating."""

from __future__ import annotations

import json
import sqlite3
from datetime import date

from .. import db
from ..config import Config
from .tmdb import Tmdb

PAGES_PER_SORT = 4  # ~80 films per sort per seed


def _liked_films(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    """Films some member rated at or above their own mean — the seed corpus."""
    return conn.execute(
        """WITH mu AS (
             SELECT member_id, avg(rating) AS mean_r
             FROM interaction WHERE rating IS NOT NULL GROUP BY member_id
           )
           SELECT ft.genres, ft.keywords, ft.directors, ft.original_language
           FROM interaction i
           JOIN mu ON mu.member_id = i.member_id
           JOIN film_tmdb ft ON ft.film_id = i.film_id
           WHERE i.rating IS NOT NULL AND i.rating >= mu.mean_r"""
    ).fetchall()


def build_seeds(conn: sqlite3.Connection) -> list[dict]:
    rows = _liked_films(conn)
    genres: dict[int, tuple[str, int]] = {}
    keywords: dict[int, tuple[str, int]] = {}
    directors: dict[int, tuple[str, int]] = {}
    languages: dict[str, int] = {}
    for r in rows:
        for g in json.loads(r["genres"] or "[]"):
            c = genres.get(g["id"], (g["name"], 0))[1]
            genres[g["id"]] = (g["name"], c + 1)
        for k in json.loads(r["keywords"] or "[]"):
            c = keywords.get(k["id"], (k["name"], 0))[1]
            keywords[k["id"]] = (k["name"], c + 1)
        for d in json.loads(r["directors"] or "[]"):
            c = directors.get(d["id"], (d["name"], 0))[1]
            directors[d["id"]] = (d["name"], c + 1)
        lang = r["original_language"]
        if lang and lang != "en":
            languages[lang] = languages.get(lang, 0) + 1

    def top(d: dict, n: int, min_count: int) -> list[tuple]:
        items = [(k, v[0], v[1]) for k, v in d.items() if v[1] >= min_count]
        return sorted(items, key=lambda t: t[2], reverse=True)[:n]

    seeds: list[dict] = []
    for gid, name, _ in top(genres, 4, 2):
        seeds.append({"label": f"genre {name}", "params": {"with_genres": str(gid)}})
    for kid, name, _ in top(keywords, 4, 3):
        seeds.append({"label": f"keyword {name}", "params": {"with_keywords": str(kid)}})
    for pid, name, _ in top(directors, 2, 2):
        seeds.append({"label": f"director {name}", "params": {"with_people": str(pid)}})
    langs = sorted(languages.items(), key=lambda t: t[1], reverse=True)
    for code, count in langs[:2]:
        if count >= 5:
            seeds.append(
                {"label": f"language {code}", "params": {"with_original_language": code}}
            )
    return seeds


def run(conn: sqlite3.Connection, tmdb: Tmdb, cfg: Config) -> list[int]:
    """Discover new candidate films; returns film ids created (need metadata)."""
    seeds = build_seeds(conn)
    if not seeds:
        print("pool: no rated+enriched films to seed discovery yet — skipping")
        return []
    today = date.today().isoformat()
    existing = {
        r["tmdb_id"]
        for r in conn.execute("SELECT tmdb_id FROM film WHERE tmdb_id IS NOT NULL")
    }
    pool_count = conn.execute("SELECT count(*) c FROM film WHERE pool=1").fetchone()["c"]
    budget = max(0, cfg.pool_max_films - pool_count)
    created: list[int] = []
    sorts = [
        {"sort_by": "popularity.desc", "vote_count.gte": "50"},
        {"sort_by": "vote_average.desc", "vote_count.gte": str(cfg.pool_vote_floor)},
    ]
    for seed in seeds:
        for sort in sorts:
            for page in range(1, PAGES_PER_SORT + 1):
                if len(created) >= budget:
                    break
                data = tmdb.discover(
                    page,
                    **seed["params"],
                    **sort,
                    **{"primary_release_date.lte": today},
                )
                for c in data.get("results", []):
                    if len(created) >= budget:
                        break
                    tid = c.get("id")
                    if not tid or tid in existing:
                        continue
                    existing.add(tid)
                    rd = c.get("release_date") or ""
                    cur = conn.execute(
                        """INSERT INTO film (tmdb_id, title, title_norm, year, kind,
                             resolution_status, resolution_method, resolved_at, pool)
                           VALUES (?,?,?,?, 'movie', 'resolved', 'discover', ?, 1)""",
                        (
                            tid,
                            c.get("title"),
                            db.normalize_title(c.get("title") or "") or None,
                            int(rd[:4]) if rd[:4].isdigit() else None,
                            db.utcnow(),
                        ),
                    )
                    created.append(cur.lastrowid)
                if page >= data.get("total_pages", 1):
                    break
    conn.commit()
    print(
        f"pool: {len(seeds)} seeds ({', '.join(s['label'] for s in seeds)}) "
        f"→ {len(created)} new candidates"
    )
    return created
