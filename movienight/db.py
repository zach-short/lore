"""SQLite layer: schema, migrations, and the upsert helpers that make CSV
re-imports and RSS replays idempotent (SCOPING §6)."""

from __future__ import annotations

import json
import re
import sqlite3
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

SCHEMA_VERSION = 1

DDL = """
CREATE TABLE IF NOT EXISTS member (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  added_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS film (
  id INTEGER PRIMARY KEY,
  lb_slug TEXT UNIQUE,
  tmdb_id INTEGER UNIQUE,
  imdb_id TEXT,
  title TEXT,
  title_norm TEXT,
  year INTEGER,
  kind TEXT NOT NULL DEFAULT 'movie',            -- movie | tv | short
  resolution_status TEXT NOT NULL DEFAULT 'pending',  -- resolved|ambiguous|unmatched|pending
  resolution_method TEXT,                        -- rss | search | override | discover
  resolved_at TEXT,
  pool INTEGER NOT NULL DEFAULT 0                -- 1 = entered via TMDB discover
);
CREATE INDEX IF NOT EXISTS idx_film_title_norm ON film(title_norm, year);
CREATE TABLE IF NOT EXISTS film_tmdb (
  film_id INTEGER PRIMARY KEY REFERENCES film(id),
  runtime_min INTEGER,
  original_language TEXT,
  release_date TEXT,
  genres TEXT, keywords TEXT, cast_top TEXT, directors TEXT, writers TEXT,
  popularity REAL, vote_average REAL, vote_count INTEGER,
  poster_path TEXT, overview TEXT,
  fetched_at TEXT
);
CREATE TABLE IF NOT EXISTS providers (
  film_id INTEGER REFERENCES film(id),
  region TEXT,
  flatrate TEXT, rent TEXT, buy TEXT,
  fetched_at TEXT,
  PRIMARY KEY (film_id, region)
);
CREATE TABLE IF NOT EXISTS interaction (
  member_id INTEGER REFERENCES member(id),
  film_id INTEGER REFERENCES film(id),
  watched INTEGER NOT NULL DEFAULT 0,
  rating REAL,
  liked INTEGER NOT NULL DEFAULT 0,
  in_watchlist INTEGER NOT NULL DEFAULT 0,
  first_watched TEXT,
  last_watched TEXT,
  rewatch_count INTEGER NOT NULL DEFAULT 0,
  source TEXT,
  rating_activity_at TEXT,   -- date of the activity that set the current rating (latest-wins)
  updated_at TEXT,
  PRIMARY KEY (member_id, film_id)
);
CREATE TABLE IF NOT EXISTS diary_entry (
  id INTEGER PRIMARY KEY,
  member_id INTEGER REFERENCES member(id),
  film_id INTEGER REFERENCES film(id),
  watched_date TEXT,
  rating REAL,
  rewatch INTEGER NOT NULL DEFAULT 0,
  tags TEXT,
  source TEXT,
  UNIQUE (member_id, film_id, watched_date)
);
CREATE TABLE IF NOT EXISTS rss_state (
  member_id INTEGER PRIMARY KEY REFERENCES member(id),
  last_seen_guid TEXT,
  last_polled_at TEXT
);
CREATE TABLE IF NOT EXISTS score (
  member_id INTEGER,
  film_id INTEGER,
  model_version TEXT,
  z REAL, stars REAL, confidence REAL,
  components TEXT,
  computed_at TEXT,
  PRIMARY KEY (member_id, film_id, model_version)
);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
"""


def utcnow() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript(DDL)
    cur = conn.execute("SELECT value FROM meta WHERE key='schema_version'")
    row = cur.fetchone()
    if row is None:
        conn.execute(
            "INSERT INTO meta (key, value) VALUES ('schema_version', ?)",
            (str(SCHEMA_VERSION),),
        )
        conn.commit()
    return conn


def normalize_title(title: str) -> str:
    """Fold case, diacritics, punctuation, and whitespace for matching
    (SCOPING §5 step 2)."""
    t = unicodedata.normalize("NFKD", title or "")
    t = "".join(c for c in t if not unicodedata.combining(c))
    t = t.lower()
    t = re.sub(r"[&]", " and ", t)
    t = re.sub(r"[^a-z0-9]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def get_member(conn: sqlite3.Connection, username: str) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT * FROM member WHERE username=?", (username,)
    ).fetchone()


def upsert_member(
    conn: sqlite3.Connection, username: str, display_name: str | None = None
) -> int:
    row = get_member(conn, username)
    if row:
        if display_name and not row["display_name"]:
            conn.execute(
                "UPDATE member SET display_name=? WHERE id=?",
                (display_name, row["id"]),
            )
        return row["id"]
    cur = conn.execute(
        "INSERT INTO member (username, display_name, added_at) VALUES (?,?,?)",
        (username, display_name, utcnow()),
    )
    return cur.lastrowid


def get_or_create_film(
    conn: sqlite3.Connection,
    *,
    slug: str | None = None,
    tmdb_id: int | None = None,
    title: str | None = None,
    year: int | None = None,
    kind: str | None = None,
) -> int:
    """Film identity ladder: slug → tmdb_id → (normalized title, year).

    The export CSVs may carry boxd.it short URIs instead of slugs, so slugless
    rows fall back to (title_norm, year) identity; when RSS later supplies the
    slug + tmdb id for the same film, the rows converge instead of duplicating.
    """
    title_norm = normalize_title(title) if title else None
    row = None
    if slug:
        row = conn.execute("SELECT * FROM film WHERE lb_slug=?", (slug,)).fetchone()
    if row is None and tmdb_id:
        row = conn.execute("SELECT * FROM film WHERE tmdb_id=?", (tmdb_id,)).fetchone()
    if row is None and title_norm and not slug and not tmdb_id:
        row = conn.execute(
            "SELECT * FROM film WHERE title_norm=? AND year IS ? AND lb_slug IS NULL",
            (title_norm, year),
        ).fetchone()
    if row is None and title_norm and year is not None:
        # Converge with a row known by other keys: a slugless CSV stub can match
        # a slugged film, and an RSS row (slug+tmdb) can adopt a CSV stub.
        candidates = conn.execute(
            "SELECT * FROM film WHERE title_norm=? AND year=?", (title_norm, year)
        ).fetchall()
        viable = [
            c
            for c in candidates
            if (not slug or c["lb_slug"] in (None, slug))
            and (not tmdb_id or c["tmdb_id"] in (None, tmdb_id))
        ]
        if len(viable) == 1:
            row = viable[0]

    if row is None:
        cur = conn.execute(
            """INSERT INTO film (lb_slug, tmdb_id, title, title_norm, year, kind,
                                 resolution_status, resolution_method, resolved_at)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (
                slug,
                tmdb_id,
                title,
                title_norm,
                year,
                kind or "movie",
                "resolved" if tmdb_id else "pending",
                "rss" if tmdb_id else None,
                utcnow() if tmdb_id else None,
            ),
        )
        return cur.lastrowid

    film_id = row["id"]
    updates: dict[str, object] = {}
    if slug and not row["lb_slug"]:
        updates["lb_slug"] = slug
    if tmdb_id and not row["tmdb_id"]:
        clash = conn.execute(
            "SELECT id FROM film WHERE tmdb_id=? AND id<>?", (tmdb_id, film_id)
        ).fetchone()
        if clash is None:
            updates["tmdb_id"] = tmdb_id
            updates["resolution_status"] = "resolved"
            updates["resolution_method"] = row["resolution_method"] or "rss"
            updates["resolved_at"] = utcnow()
        else:
            merge_films(conn, keep_id=film_id, drop_id=clash["id"])
            updates["tmdb_id"] = tmdb_id
            updates["resolution_status"] = "resolved"
            updates["resolution_method"] = row["resolution_method"] or "rss"
            updates["resolved_at"] = utcnow()
    if title and not row["title"]:
        updates["title"] = title
        updates["title_norm"] = title_norm
    if year is not None and row["year"] is None:
        updates["year"] = year
    if updates:
        cols = ", ".join(f"{k}=?" for k in updates)
        conn.execute(f"UPDATE film SET {cols} WHERE id=?", (*updates.values(), film_id))
    return film_id


def merge_films(conn: sqlite3.Connection, *, keep_id: int, drop_id: int) -> None:
    """Fold a duplicate film row (e.g. discover-created, slugless) into the
    canonical one, re-pointing references."""
    drop = conn.execute("SELECT * FROM film WHERE id=?", (drop_id,)).fetchone()
    if drop is None:
        return
    conn.execute("UPDATE film SET tmdb_id=NULL WHERE id=?", (drop_id,))
    for table, cols in (
        ("film_tmdb", "film_id"),
        ("providers", "film_id"),
        ("score", "film_id"),
    ):
        conn.execute(
            f"UPDATE OR IGNORE {table} SET {cols}=? WHERE {cols}=?", (keep_id, drop_id)
        )
        conn.execute(f"DELETE FROM {table} WHERE {cols}=?", (drop_id,))
    for table in ("interaction", "diary_entry"):
        conn.execute(
            f"UPDATE OR IGNORE {table} SET film_id=? WHERE film_id=?",
            (keep_id, drop_id),
        )
        conn.execute(f"DELETE FROM {table} WHERE film_id=?", (drop_id,))
    if drop["pool"]:
        conn.execute("UPDATE film SET pool=1 WHERE id=?", (keep_id,))
    conn.execute("DELETE FROM film WHERE id=?", (drop_id,))


def upsert_interaction(
    conn: sqlite3.Connection,
    member_id: int,
    film_id: int,
    *,
    watched: bool | None = None,
    rating: float | None = None,
    rating_date: str | None = None,
    liked: bool | None = None,
    in_watchlist: bool | None = None,
    watched_date: str | None = None,
    source: str,
) -> None:
    """Merge one observation into the (member, film) row.

    Rules (SCOPING §4a/§6): booleans OR in; the rating with the latest
    activity date wins (so a fresh export supersedes old RSS and vice versa);
    watch dates min/max-merge. rewatch_count is recomputed from diary_entry
    by finalize_member()."""
    row = conn.execute(
        "SELECT * FROM interaction WHERE member_id=? AND film_id=?",
        (member_id, film_id),
    ).fetchone()
    now = utcnow()
    if row is None:
        conn.execute(
            """INSERT INTO interaction
               (member_id, film_id, watched, rating, liked, in_watchlist,
                first_watched, last_watched, rewatch_count, source,
                rating_activity_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,0,?,?,?)""",
            (
                member_id,
                film_id,
                1 if watched else 0,
                rating,
                1 if liked else 0,
                1 if in_watchlist else 0,
                watched_date,
                watched_date,
                source,
                rating_date if rating is not None else None,
                now,
            ),
        )
        return

    new_watched = row["watched"] or (1 if watched else 0)
    new_liked = row["liked"] or (1 if liked else 0)
    new_wl = row["in_watchlist"] if in_watchlist is None else (1 if in_watchlist else 0)

    new_rating = row["rating"]
    new_rating_at = row["rating_activity_at"]
    if rating is not None:
        if row["rating"] is None or (rating_date or "") >= (new_rating_at or ""):
            new_rating = rating
            new_rating_at = rating_date

    dates = [d for d in (row["first_watched"], row["last_watched"], watched_date) if d]
    first = min(dates) if dates else None
    last = max(dates) if dates else None

    conn.execute(
        """UPDATE interaction SET watched=?, rating=?, liked=?, in_watchlist=?,
           first_watched=?, last_watched=?, source=?, rating_activity_at=?,
           updated_at=? WHERE member_id=? AND film_id=?""",
        (
            new_watched,
            new_rating,
            new_liked,
            new_wl,
            first,
            last,
            source,
            new_rating_at,
            now,
            member_id,
            film_id,
        ),
    )


def add_diary_entry(
    conn: sqlite3.Connection,
    member_id: int,
    film_id: int,
    *,
    watched_date: str | None,
    rating: float | None,
    rewatch: bool,
    tags: list[str] | None,
    source: str,
) -> None:
    conn.execute(
        """INSERT OR IGNORE INTO diary_entry
           (member_id, film_id, watched_date, rating, rewatch, tags, source)
           VALUES (?,?,?,?,?,?,?)""",
        (
            member_id,
            film_id,
            watched_date,
            rating,
            1 if rewatch else 0,
            json.dumps(tags) if tags else None,
            source,
        ),
    )


def finalize_member(conn: sqlite3.Connection, member_id: int) -> None:
    """Recompute derived interaction fields from diary entries (idempotent)."""
    conn.execute(
        """UPDATE interaction SET rewatch_count =
             (SELECT count(*) FROM diary_entry d
               WHERE d.member_id = interaction.member_id
                 AND d.film_id = interaction.film_id AND d.rewatch = 1)
           WHERE member_id=?""",
        (member_id,),
    )
