"""Import Letterboxd account-export zips (SCOPING §4a).

Merge rule: ratings.csv wins for current taste, diary supplies dates and
rewatches, watchlist.csv is an authoritative snapshot (member's watchlist
flags are reset before applying it). All upserts are idempotent."""

from __future__ import annotations

import csv
import io
import re
import sqlite3
import zipfile
from pathlib import Path

from .. import db
from ..config import Config

FILM_URL_RE = re.compile(r"letterboxd\.com/(?:[^/]+/)?film/([^/]+)")
ZIPNAME_RE = re.compile(r"letterboxd-([A-Za-z0-9_]+)-\d{4}")


def slug_from_uri(uri: str | None) -> str | None:
    """Extract the film slug when the URI is a full letterboxd.com film URL.
    Export zips may instead carry boxd.it short links, which we can't expand
    without a page fetch (ToS §4b) — those rows fall back to title+year
    identity and the TMDB search ladder."""
    if not uri:
        return None
    m = FILM_URL_RE.search(uri)
    return m.group(1) if m else None


def _member_from_zip(zf: zipfile.ZipFile, path: Path) -> str | None:
    profile = _find(zf, "profile.csv")
    if profile:
        for row in _rows(zf, profile):
            for key in ("Username", "username"):
                if row.get(key):
                    return row[key].strip()
    m = ZIPNAME_RE.search(path.name)
    return m.group(1) if m else None


def _find(zf: zipfile.ZipFile, name: str) -> str | None:
    for n in zf.namelist():
        if n == name or n.endswith("/" + name):
            return n
    return None


def _rows(zf: zipfile.ZipFile, name: str):
    with zf.open(name) as f:
        text = io.TextIOWrapper(f, encoding="utf-8-sig", newline="")
        yield from csv.DictReader(text)


def _year(row: dict) -> int | None:
    y = (row.get("Year") or "").strip()
    return int(y) if y.isdigit() else None


def _rating(value: str | None) -> float | None:
    v = (value or "").strip()
    try:
        return float(v) if v else None
    except ValueError:
        return None


def _film(conn: sqlite3.Connection, row: dict) -> int:
    return db.get_or_create_film(
        conn,
        slug=slug_from_uri(row.get("Letterboxd URI")),
        title=(row.get("Name") or "").strip() or None,
        year=_year(row),
    )


def import_zip(conn: sqlite3.Connection, cfg: Config, path: Path,
               member_override: str | None = None) -> dict:
    with zipfile.ZipFile(path) as zf:
        username = member_override or _member_from_zip(zf, path)
        if not username:
            raise SystemExit(
                f"{path.name}: can't tell whose export this is — no profile.csv "
                "and the filename isn't letterboxd-<user>-….zip. "
                "Re-run with --member <username>."
            )
        known = {m.username.lower(): m.username for m in cfg.members}
        if username.lower() not in known:
            raise SystemExit(
                f"{path.name}: username '{username}' is not in config.toml "
                f"members ({', '.join(known.values())}). Add them first."
            )
        username = known[username.lower()]
        member_id = db.upsert_member(conn, username)
        counts = {"watched": 0, "diary": 0, "ratings": 0, "watchlist": 0, "likes": 0}

        name = _find(zf, "watched.csv")
        if name:
            for row in _rows(zf, name):
                film_id = _film(conn, row)
                db.upsert_interaction(
                    conn, member_id, film_id,
                    watched=True,
                    watched_date=(row.get("Date") or "").strip() or None,
                    source="csv",
                )
                counts["watched"] += 1

        name = _find(zf, "diary.csv")
        if name:
            for row in _rows(zf, name):
                film_id = _film(conn, row)
                wd = (row.get("Watched Date") or row.get("Date") or "").strip() or None
                tags = [t.strip() for t in (row.get("Tags") or "").split(",") if t.strip()]
                db.add_diary_entry(
                    conn, member_id, film_id,
                    watched_date=wd,
                    rating=_rating(row.get("Rating")),
                    rewatch=(row.get("Rewatch") or "").strip().lower() == "yes",
                    tags=tags or None,
                    source="csv",
                )
                db.upsert_interaction(
                    conn, member_id, film_id,
                    watched=True, watched_date=wd, source="csv",
                )
                counts["diary"] += 1

        name = _find(zf, "ratings.csv")
        if name:
            for row in _rows(zf, name):
                film_id = _film(conn, row)
                db.upsert_interaction(
                    conn, member_id, film_id,
                    watched=True,
                    rating=_rating(row.get("Rating")),
                    rating_date=(row.get("Date") or "").strip() or None,
                    source="csv",
                )
                counts["ratings"] += 1

        name = _find(zf, "watchlist.csv")
        if name:
            conn.execute(
                "UPDATE interaction SET in_watchlist=0 WHERE member_id=?", (member_id,)
            )
            for row in _rows(zf, name):
                film_id = _film(conn, row)
                db.upsert_interaction(
                    conn, member_id, film_id, in_watchlist=True, source="csv"
                )
                counts["watchlist"] += 1

        name = _find(zf, "likes/films.csv") or _find(zf, "films.csv")
        if name and "likes" in name:
            for row in _rows(zf, name):
                film_id = _film(conn, row)
                db.upsert_interaction(conn, member_id, film_id, liked=True, source="csv")
                counts["likes"] += 1

        db.finalize_member(conn, member_id)
        conn.commit()
        return {"username": username, **counts}


def run(conn: sqlite3.Connection, cfg: Config, paths: list[Path],
        member_override: str | None = None) -> None:
    if not paths:
        print(f"import: no export zips found in {cfg.exports_dir} — nothing to do.")
        print("        (each member: Letterboxd Settings → Data → Export, then drop the zip there)")
        return
    for path in paths:
        result = import_zip(conn, cfg, path, member_override)
        user = result.pop("username")
        pretty = ", ".join(f"{k} {v}" for k, v in result.items())
        print(f"import: {user} ← {path.name}: {pretty}")
