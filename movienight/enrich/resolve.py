"""Resolution ladder (SCOPING §5): RSS ids are free; overrides.yaml is step 3;
TMDB search with a conservative acceptance rule is step 2. The page-fetch
fallback (step 4) is deliberately not shipped — unresolved films land in
data/resolution_report.md for a 20-second manual override instead."""

from __future__ import annotations

import sqlite3
from urllib.parse import quote_plus

from .. import db
from ..config import Config
from .tmdb import Tmdb, TmdbNotFound


def apply_overrides(conn: sqlite3.Connection, overrides: dict[str, int]) -> int:
    applied = 0
    for slug, tmdb_id in overrides.items():
        if slug.startswith("~") and slug[1:].isdigit():
            # slugless film (boxd.it-style export URI): keyed by internal id,
            # as printed in the resolution report
            film = conn.execute(
                "SELECT * FROM film WHERE id=?", (int(slug[1:]),)
            ).fetchone()
        else:
            film = conn.execute(
                "SELECT * FROM film WHERE lb_slug=?", (slug,)
            ).fetchone()
        if film is None or film["tmdb_id"] == tmdb_id:
            continue
        clash = conn.execute(
            "SELECT id FROM film WHERE tmdb_id=? AND id<>?", (tmdb_id, film["id"])
        ).fetchone()
        if clash:
            db.merge_films(conn, keep_id=film["id"], drop_id=clash["id"])
        conn.execute(
            """UPDATE film SET tmdb_id=?, resolution_status='resolved',
               resolution_method='override', resolved_at=? WHERE id=?""",
            (tmdb_id, db.utcnow(), film["id"]),
        )
        applied += 1
    return applied


def _year_of(candidate: dict) -> int | None:
    rd = candidate.get("release_date") or ""
    return int(rd[:4]) if rd[:4].isdigit() else None


def resolve_by_search(conn: sqlite3.Connection, tmdb: Tmdb) -> dict[str, int]:
    """SCOPING §5 step 2. Accept only unambiguous matches; everything else is
    marked ambiguous/unmatched for the report."""
    pending = conn.execute(
        """SELECT * FROM film WHERE resolution_status='pending'
           AND tmdb_id IS NULL AND kind != 'tv' AND title IS NOT NULL"""
    ).fetchall()
    stats = {"resolved": 0, "ambiguous": 0, "unmatched": 0}
    for film in pending:
        results = tmdb.search_movie(film["title"], film["year"])
        matches = []
        for c in results:
            title_ok = db.normalize_title(c.get("title") or "") == film["title_norm"] or (
                db.normalize_title(c.get("original_title") or "") == film["title_norm"]
            )
            cy = _year_of(c)
            year_ok = (
                film["year"] is None or cy is None or abs(cy - film["year"]) <= 1
            )
            if title_ok and year_ok:
                matches.append(c)

        chosen, status = None, "unmatched"
        if len(matches) == 1:
            chosen = matches[0]
        elif len(matches) > 1:
            exact_year = [c for c in matches if _year_of(c) == film["year"]]
            if len(exact_year) == 1:
                chosen = exact_year[0]
            else:
                ranked = sorted(
                    matches, key=lambda c: c.get("vote_count") or 0, reverse=True
                )
                top, second = ranked[0], ranked[1]
                if (top.get("vote_count") or 0) >= 50 and (
                    top.get("vote_count") or 0
                ) >= 3 * ((second.get("vote_count") or 0) or 1):
                    chosen = top
                else:
                    status = "ambiguous"

        if chosen is not None:
            clash = conn.execute(
                "SELECT id FROM film WHERE tmdb_id=? AND id<>?",
                (chosen["id"], film["id"]),
            ).fetchone()
            if clash:
                db.merge_films(conn, keep_id=film["id"], drop_id=clash["id"])
            conn.execute(
                """UPDATE film SET tmdb_id=?, resolution_status='resolved',
                   resolution_method='search', resolved_at=? WHERE id=?""",
                (chosen["id"], db.utcnow(), film["id"]),
            )
            stats["resolved"] += 1
        else:
            conn.execute(
                "UPDATE film SET resolution_status=? WHERE id=?",
                (status, film["id"]),
            )
            stats[status] += 1
    return stats


def fetch_metadata(
    conn: sqlite3.Connection, tmdb: Tmdb, cfg: Config, film_ids: list[int]
) -> int:
    """One cached TMDB call per film, ever."""
    from .tmdb import store_movie

    fetched = 0
    for film_id in film_ids:
        film = conn.execute("SELECT * FROM film WHERE id=?", (film_id,)).fetchone()
        if film is None or not film["tmdb_id"]:
            continue
        try:
            payload = tmdb.movie(film["tmdb_id"])
        except TmdbNotFound:
            conn.execute(
                "UPDATE film SET resolution_status='unmatched', tmdb_id=NULL "
                "WHERE id=?",
                (film_id,),
            )
            print(f"enrich: tmdb id {film['tmdb_id']} for {film['title']!r} is gone; unmatched")
            continue
        store_movie(conn, film_id, payload, cfg.region)
        fetched += 1
        if fetched % 100 == 0:
            conn.commit()
            print(f"enrich: …{fetched} films fetched")
    conn.commit()
    return fetched


def write_report(conn: sqlite3.Connection, cfg: Config) -> None:
    total = conn.execute(
        "SELECT count(*) c FROM film WHERE kind != 'tv' AND id IN "
        "(SELECT film_id FROM interaction)"
    ).fetchone()["c"]
    resolved = conn.execute(
        "SELECT count(*) c FROM film WHERE kind != 'tv' AND tmdb_id IS NOT NULL "
        "AND id IN (SELECT film_id FROM interaction)"
    ).fetchone()["c"]
    problems = conn.execute(
        """SELECT f.*, group_concat(m.username) AS members
           FROM film f
           LEFT JOIN interaction i ON i.film_id = f.id
           LEFT JOIN member m ON m.id = i.member_id
           WHERE f.resolution_status IN ('ambiguous','unmatched') AND f.kind != 'tv'
           GROUP BY f.id ORDER BY f.title"""
    ).fetchall()
    tv = conn.execute(
        "SELECT * FROM film WHERE kind='tv' ORDER BY title"
    ).fetchall()

    lines = [
        "# Film resolution report",
        "",
        f"Generated {db.utcnow()}. Interacted films resolved to TMDB: "
        f"**{resolved}/{total}**"
        + (f" ({resolved / total:.1%})" if total else "")
        + ".",
        "",
    ]
    if problems:
        lines += [
            "## Needs a manual override",
            "",
            "Find the film on TMDB, then add `slug: tmdb_id` to `overrides.yaml`",
            "and re-run `movienight enrich`.",
            "",
            "| Film | Year | Slug | Status | Who | Search |",
            "|---|---|---|---|---|---|",
        ]
        for f in problems:
            q = quote_plus(f"{f['title'] or ''} {f['year'] or ''}".strip())
            key = f["lb_slug"] or f"~{f['id']}"
            lines.append(
                f"| {f['title']} | {f['year'] or '?'} | `{key}` "
                f"| {f['resolution_status']} | {f['members'] or '—'} "
                f"| [TMDB](https://www.themoviedb.org/search?query={q}) |"
            )
        lines.append("")
    else:
        lines += ["No unresolved films. 🎉", ""]
    if tv:
        lines += [
            "## TV / miniseries entries (excluded from scoring by design)",
            "",
            *[f"- {f['title']} ({f['year'] or '?'}) — `{f['lb_slug'] or '?'}`" for f in tv],
            "",
        ]
    cfg.report_path.parent.mkdir(parents=True, exist_ok=True)
    cfg.report_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"enrich: report → {cfg.report_path.relative_to(cfg.root)}")
