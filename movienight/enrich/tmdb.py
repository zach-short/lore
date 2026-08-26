"""TMDB client (SCOPING §5): one cached call per film, self-limited to
~10 req/s, retries with backoff on 429/5xx. Works with either a v3 API key
or a v4 read-access token."""

from __future__ import annotations

import json
import sqlite3
import time

import httpx
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from .. import db

BASE = "https://api.themoviedb.org/3"


class TmdbRetryable(Exception):
    pass


class TmdbNotFound(Exception):
    pass


class Tmdb:
    def __init__(
        self,
        key: str,
        user_agent: str,
        min_interval: float = 0.1,
        transport: httpx.BaseTransport | None = None,
    ):
        headers = {"User-Agent": user_agent, "Accept": "application/json"}
        self._params: dict[str, str] = {}
        if key.startswith("eyJ"):  # v4 read access token
            headers["Authorization"] = f"Bearer {key}"
        else:
            self._params["api_key"] = key
        self.client = httpx.Client(
            base_url=BASE, headers=headers, timeout=20, transport=transport
        )
        self.min_interval = min_interval
        self._last = 0.0
        self.calls = 0

    def close(self) -> None:
        self.client.close()

    @retry(
        retry=retry_if_exception_type((TmdbRetryable, httpx.TransportError)),
        stop=stop_after_attempt(5),
        wait=wait_exponential(multiplier=1, max=30),
        reraise=True,
    )
    def _get(self, path: str, **params) -> dict:
        wait = self.min_interval - (time.monotonic() - self._last)
        if wait > 0:
            time.sleep(wait)
        self._last = time.monotonic()
        self.calls += 1
        resp = self.client.get(path, params={**self._params, **params})
        if resp.status_code == 404:
            raise TmdbNotFound(path)
        if resp.status_code == 429 or resp.status_code >= 500:
            raise TmdbRetryable(f"HTTP {resp.status_code} on {path}")
        resp.raise_for_status()
        return resp.json()

    def search_movie(self, title: str, year: int | None = None) -> list[dict]:
        # Search without a year filter and check ±1 locally — Letterboxd and
        # TMDB disagree on festival-vs-release years (SCOPING §5 step 2).
        data = self._get(
            "/search/movie", query=title, include_adult="false", language="en-US"
        )
        return data.get("results", [])

    def movie(self, tmdb_id: int) -> dict:
        return self._get(
            f"/movie/{tmdb_id}",
            append_to_response="credits,keywords,watch/providers",
            language="en-US",
        )

    def providers(self, tmdb_id: int) -> dict:
        return self._get(f"/movie/{tmdb_id}/watch/providers")

    def discover(self, page: int, **params) -> dict:
        return self._get(
            "/discover/movie", page=page, include_adult="false",
            language="en-US", **params,
        )


def _names(seq: list[dict], limit: int | None = None) -> list[dict]:
    out = [{"id": p.get("id"), "name": p.get("name")} for p in seq if p.get("name")]
    return out[:limit] if limit else out


def store_movie(
    conn: sqlite3.Connection, film_id: int, payload: dict, region: str
) -> None:
    credits = payload.get("credits") or {}
    crew = credits.get("crew") or []
    directors, writers, seen_d, seen_w = [], [], set(), set()
    for p in crew:
        if p.get("job") == "Director" and p.get("id") not in seen_d:
            directors.append({"id": p["id"], "name": p.get("name")})
            seen_d.add(p["id"])
        elif p.get("department") == "Writing" and p.get("id") not in seen_w:
            writers.append({"id": p["id"], "name": p.get("name")})
            seen_w.add(p["id"])
    keywords = (payload.get("keywords") or {}).get("keywords") or []
    runtime = payload.get("runtime") or None
    release = payload.get("release_date") or None

    conn.execute(
        """INSERT INTO film_tmdb (film_id, runtime_min, original_language,
             release_date, genres, keywords, cast_top, directors, writers,
             popularity, vote_average, vote_count, poster_path, overview, fetched_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(film_id) DO UPDATE SET
             runtime_min=excluded.runtime_min,
             original_language=excluded.original_language,
             release_date=excluded.release_date,
             genres=excluded.genres, keywords=excluded.keywords,
             cast_top=excluded.cast_top, directors=excluded.directors,
             writers=excluded.writers, popularity=excluded.popularity,
             vote_average=excluded.vote_average, vote_count=excluded.vote_count,
             poster_path=excluded.poster_path, overview=excluded.overview,
             fetched_at=excluded.fetched_at""",
        (
            film_id,
            runtime,
            payload.get("original_language"),
            release,
            json.dumps(_names(payload.get("genres") or [])),
            json.dumps(_names(keywords)),
            json.dumps(_names(credits.get("cast") or [], limit=10)),
            json.dumps(directors[:4]),
            json.dumps(writers[:4]),
            payload.get("popularity"),
            payload.get("vote_average"),
            payload.get("vote_count"),
            payload.get("poster_path"),
            (payload.get("overview") or "")[:400],
            db.utcnow(),
        ),
    )
    store_providers(
        conn, film_id, (payload.get("watch/providers") or {}).get("results") or {},
        region,
    )
    # Fill film-level gaps from TMDB and flag shorts (SCOPING §5 edge cases).
    year = int(release[:4]) if release and release[:4].isdigit() else None
    film = conn.execute("SELECT * FROM film WHERE id=?", (film_id,)).fetchone()
    kind = film["kind"]
    if kind == "movie" and runtime and runtime < 40:
        kind = "short"
    conn.execute(
        "UPDATE film SET imdb_id=COALESCE(?, imdb_id), year=COALESCE(year, ?), "
        "title=COALESCE(title, ?), title_norm=COALESCE(title_norm, ?), kind=? "
        "WHERE id=?",
        (
            payload.get("imdb_id"),
            year,
            payload.get("title"),
            db.normalize_title(payload.get("title") or "") or None,
            kind,
            film_id,
        ),
    )


def store_providers(
    conn: sqlite3.Connection, film_id: int, results: dict, region: str
) -> None:
    block = results.get(region) or {}

    def names(kind: str) -> str:
        return json.dumps(
            [p.get("provider_name") for p in block.get(kind) or [] if p.get("provider_name")]
        )

    conn.execute(
        """INSERT INTO providers (film_id, region, flatrate, rent, buy, fetched_at)
           VALUES (?,?,?,?,?,?)
           ON CONFLICT(film_id, region) DO UPDATE SET
             flatrate=excluded.flatrate, rent=excluded.rent, buy=excluded.buy,
             fetched_at=excluded.fetched_at""",
        (film_id, region, names("flatrate"), names("rent"), names("buy"), db.utcnow()),
    )
