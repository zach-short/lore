"""Poll each member's public Letterboxd RSS feed (SCOPING §4c/§4e).

Verified live 2026-08-25: feeds carry letterboxd:filmTitle/filmYear/
memberRating/watchedDate/rewatch/memberLike and tmdb:movieId; ~50 items deep;
server sends cache-control: no-store and no validators, so conditional GET is
pointless — one plain GET per member per day, 2s apart, honest User-Agent,
skip the cycle on 403/429."""

from __future__ import annotations

import re
import sqlite3
import time

import feedparser
import httpx
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from .. import db
from ..config import Config

FILM_LINK_RE = re.compile(r"letterboxd\.com/[^/]+/film/([^/]+)")


@retry(
    retry=retry_if_exception_type(httpx.TransportError),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, max=8),
    reraise=True,
)
def _get(client: httpx.Client, url: str) -> httpx.Response:
    return client.get(url)


def parse_feed(content: bytes) -> tuple[str | None, list[dict]]:
    """Return (author display name, film activity items). List items skipped."""
    parsed = feedparser.parse(content)
    author = None
    items: list[dict] = []
    for e in parsed.entries:
        guid = e.get("id") or ""
        author = author or e.get("author")
        if not guid.startswith(("letterboxd-watch-", "letterboxd-review-")):
            continue
        link = e.get("link") or ""
        m = FILM_LINK_RE.search(link)
        year = (e.get("letterboxd_filmyear") or "").strip()
        rating = (e.get("letterboxd_memberrating") or "").strip()
        tmdb_movie = (e.get("tmdb_movieid") or "").strip()
        tmdb_tv = (e.get("tmdb_tvid") or "").strip()
        items.append(
            {
                "guid": guid,
                "slug": m.group(1) if m else None,
                "title": (e.get("letterboxd_filmtitle") or "").strip() or None,
                "year": int(year) if year.isdigit() else None,
                "rating": float(rating) if rating else None,
                "watched_date": (e.get("letterboxd_watcheddate") or "").strip() or None,
                "rewatch": (e.get("letterboxd_rewatch") or "").strip().lower() == "yes",
                "liked": (e.get("letterboxd_memberlike") or "").strip().lower() == "yes",
                "tmdb_id": int(tmdb_movie) if tmdb_movie.isdigit() else None,
                "tmdb_tv_id": int(tmdb_tv) if tmdb_tv.isdigit() else None,
            }
        )
    return author, items


def apply_items(
    conn: sqlite3.Connection, member_id: int, items: list[dict]
) -> int:
    applied = 0
    for it in items:
        if it["tmdb_id"] is None and it["tmdb_tv_id"] is not None:
            film_id = db.get_or_create_film(
                conn, slug=it["slug"], title=it["title"], year=it["year"], kind="tv"
            )
            conn.execute(
                "UPDATE film SET kind='tv', resolution_status='unmatched' "
                "WHERE id=? AND tmdb_id IS NULL",
                (film_id,),
            )
        else:
            film_id = db.get_or_create_film(
                conn,
                slug=it["slug"],
                tmdb_id=it["tmdb_id"],
                title=it["title"],
                year=it["year"],
            )
        rating_date = it["watched_date"]
        db.upsert_interaction(
            conn,
            member_id,
            film_id,
            watched=True,
            rating=it["rating"],
            rating_date=rating_date,
            liked=it["liked"] or None,
            watched_date=it["watched_date"],
            source="rss",
        )
        db.add_diary_entry(
            conn,
            member_id,
            film_id,
            watched_date=it["watched_date"],
            rating=it["rating"],
            rewatch=it["rewatch"],
            tags=None,
            source="rss",
        )
        applied += 1
    db.finalize_member(conn, member_id)
    return applied


def run(conn: sqlite3.Connection, cfg: Config) -> None:
    headers = {"User-Agent": cfg.user_agent, "Accept": "application/rss+xml, */*"}
    with httpx.Client(headers=headers, timeout=20, follow_redirects=True) as client:
        for i, member in enumerate(cfg.members):
            if i:
                time.sleep(2)  # politeness spec §4e
            url = f"https://letterboxd.com/{member.username}/rss/"
            try:
                resp = _get(client, url)
            except httpx.TransportError as exc:
                print(f"sync: {member.username}: network error, skipping ({exc})")
                continue
            if resp.status_code in (403, 429):
                print(
                    f"sync: {member.username}: HTTP {resp.status_code} — backing off, "
                    "skipping this cycle (politeness spec)"
                )
                continue
            if resp.status_code == 404:
                print(
                    f"sync: {member.username}: HTTP 404 — profile missing/renamed? "
                    "Check the username in config.toml."
                )
                continue
            if resp.status_code != 200:
                print(f"sync: {member.username}: HTTP {resp.status_code}, skipping")
                continue

            author, items = parse_feed(resp.content)
            member_id = db.upsert_member(conn, member.username, display_name=author)
            applied = apply_items(conn, member_id, items)
            first_guid = items[0]["guid"] if items else None
            conn.execute(
                """INSERT INTO rss_state (member_id, last_seen_guid, last_polled_at)
                   VALUES (?,?,?)
                   ON CONFLICT(member_id) DO UPDATE SET
                     last_seen_guid=excluded.last_seen_guid,
                     last_polled_at=excluded.last_polled_at""",
                (member_id, first_guid, db.utcnow()),
            )
            conn.commit()
            print(f"sync: {member.username}: {applied} film items upserted")
