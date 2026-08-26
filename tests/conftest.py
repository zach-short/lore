"""Shared fixtures: a temp project, a synthetic film catalog behind a mock
TMDB transport, and a Letterboxd export-zip builder."""

from __future__ import annotations

import csv
import io
import json
import math
import zipfile
from pathlib import Path

import httpx
import pytest

from movienight import config as config_mod
from movienight import db as db_mod

GENRE_IDS = {
    "Thriller": 53, "Crime": 80, "Drama": 18, "Comedy": 35,
    "Horror": 27, "Science Fiction": 878, "Romance": 10749,
}
KW_IDS = {
    "heist": 1001, "neo-noir": 1002, "serial killer": 1003, "slow burn": 1004,
    "road trip": 1005, "romance": 1006, "coming of age": 1007, "space": 1008,
    "revenge": 1009, "con artist": 1010,
}
PEOPLE = {
    "Mira Chase": 501, "Dominic Vale": 502, "Harold Plum": 503,
    "Sun-hee Park": 504,
}
ACTORS = {f"Actor {c}": 600 + i for i, c in enumerate("ABCDEFGHJK")}


def _movie(i, title, year, genres, kws, director, cast, lang, runtime, va, vc,
           pop, providers):
    return {
        "id": 9000 + i,
        "title": title,
        "original_title": title,
        "imdb_id": f"tt{7000000 + i}",
        "release_date": f"{year}-06-15",
        "runtime": runtime,
        "original_language": lang,
        "genres": [{"id": GENRE_IDS[g], "name": g} for g in genres],
        "keywords": {"keywords": [{"id": KW_IDS[k], "name": k} for k in kws]},
        "credits": {
            "cast": [{"id": ACTORS[a], "name": a} for a in cast],
            "crew": [{"id": PEOPLE[director], "name": director, "job": "Director",
                      "department": "Directing"}],
        },
        "popularity": pop,
        "vote_average": va,
        "vote_count": vc,
        "poster_path": f"/poster{i}.jpg",
        "overview": f"Synthetic overview for {title}.",
        "watch/providers": {
            "results": {
                "US": {
                    "flatrate": [{"provider_name": p} for p in providers],
                    "rent": [{"provider_name": "Apple TV"}],
                    "buy": [],
                }
            }
        },
    }


def build_catalog() -> dict[int, dict]:
    films = []
    thriller_kws = [["heist", "neo-noir"], ["serial killer", "slow burn"],
                    ["heist", "con artist"], ["neo-noir", "revenge"],
                    ["slow burn", "revenge"], ["heist", "serial killer"]]
    for i in range(24):  # english thrillers
        films.append(_movie(
            i, f"Nightfall {i}", 1990 + i, ["Thriller", "Crime"],
            thriller_kws[i % 6],
            "Mira Chase" if i % 2 == 0 else "Dominic Vale",
            [f"Actor {c}" for c in ("ABC" if i % 2 else "DEF")],
            "en", 96 + (i % 5) * 12, 6.4 + (i % 5) * 0.4, 350 + i * 90,
            40 + i, ["Netflix"] if i % 3 == 0 else (["Max"] if i % 3 == 1 else []),
        ))
    for i in range(24, 34):  # comedies
        films.append(_movie(
            i, f"Sunny Side {i}", 2000 + i - 24, ["Comedy", "Romance"],
            [["road trip", "romance"], ["romance", "coming of age"]][i % 2],
            "Harold Plum", ["Actor G", "Actor H"], "en",
            88 + (i % 4) * 6, 5.9 + (i % 4) * 0.3, 260 + i * 40, 30 + i,
            ["Hulu"] if i % 2 else [],
        ))
    for i in range(34, 42):  # korean thrillers
        films.append(_movie(
            i, f"Han River {i}", 2005 + i - 34, ["Thriller", "Drama"],
            [["revenge", "slow burn"], ["serial killer", "neo-noir"]][i % 2],
            "Sun-hee Park", ["Actor J", "Actor K"], "ko",
            110 + (i % 3) * 10, 7.0 + (i % 3) * 0.3, 420 + i * 60, 55 + i,
            ["Netflix"] if i % 2 else [],
        ))
    # Deliberate resolution traps:
    films.append(_movie(90, "The Double", 2013, ["Thriller"], [["neo-noir"]][0],
                        "Mira Chase", ["Actor A"], "en", 93, 6.8, 900, 20, []))
    films.append(_movie(91, "The Double", 2013, ["Drama"], [["slow burn"]][0],
                        "Dominic Vale", ["Actor B"], "en", 101, 6.5, 850, 19, []))
    return {f["id"]: f for f in films}


CATALOG = build_catalog()


def mock_transport() -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        q = dict(request.url.params)
        if path == "/3/search/movie":
            query = (q.get("query") or "").lower()
            hits = [
                _brief(f) for f in CATALOG.values() if query == f["title"].lower()
            ] or [
                _brief(f) for f in CATALOG.values() if query in f["title"].lower()
            ]
            return httpx.Response(200, json={"results": hits[:20]})
        if path.startswith("/3/movie/") and path.endswith("/watch/providers"):
            mid = int(path.split("/")[3])
            f = CATALOG.get(mid)
            if not f:
                return httpx.Response(404, json={})
            return httpx.Response(200, json=f["watch/providers"])
        if path.startswith("/3/movie/"):
            mid = int(path.split("/")[3])
            f = CATALOG.get(mid)
            if not f:
                return httpx.Response(404, json={})
            return httpx.Response(200, json=f)
        if path == "/3/discover/movie":
            films = list(CATALOG.values())
            if "with_genres" in q:
                gid = int(q["with_genres"])
                films = [f for f in films
                         if any(g["id"] == gid for g in f["genres"])]
            if "with_keywords" in q:
                kid = int(q["with_keywords"])
                films = [f for f in films
                         if any(k["id"] == kid for k in f["keywords"]["keywords"])]
            if "with_people" in q:
                pid = int(q["with_people"])
                films = [f for f in films
                         if any(p["id"] == pid for p in f["credits"]["crew"])]
            if "with_original_language" in q:
                films = [f for f in films
                         if f["original_language"] == q["with_original_language"]]
            vmin = int(float(q.get("vote_count.gte", 0)))
            films = [f for f in films if f["vote_count"] >= vmin]
            key = "popularity" if q.get("sort_by", "").startswith("popularity") \
                else "vote_average"
            films.sort(key=lambda f: f[key], reverse=True)
            page = int(q.get("page", 1))
            total_pages = max(1, math.ceil(len(films) / 20))
            chunk = films[(page - 1) * 20 : page * 20]
            return httpx.Response(
                200,
                json={"page": page, "total_pages": total_pages,
                      "results": [_brief(f) for f in chunk]},
            )
        return httpx.Response(404, json={"error": f"unmocked {path}"})

    return httpx.MockTransport(handler)


def _brief(f: dict) -> dict:
    return {
        "id": f["id"], "title": f["title"], "original_title": f["original_title"],
        "release_date": f["release_date"], "popularity": f["popularity"],
        "vote_average": f["vote_average"], "vote_count": f["vote_count"],
    }


def make_zip(
    path: Path,
    username: str,
    ratings: list[tuple],          # (title, year, rating, date, slug_or_none)
    watchlist: list[tuple] = (),   # (title, year, slug_or_none)
    likes: list[tuple] = (),
    uri_style: str = "slug",
) -> Path:
    def uri(title, year, slug):
        if uri_style == "boxd":
            return f"https://boxd.it/{abs(hash((title, year))) % 99999:x}"
        s = slug or title.lower().replace(" ", "-") + f"-{year}"
        return f"https://letterboxd.com/film/{s}/"

    def sheet(headers, rows):
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(headers)
        w.writerows(rows)
        return buf.getvalue()

    with zipfile.ZipFile(path, "w") as zf:
        zf.writestr("profile.csv", sheet(["Date Joined", "Username"],
                                         [["2020-01-01", username]]))
        zf.writestr(
            "watched.csv",
            sheet(["Date", "Name", "Year", "Letterboxd URI"],
                  [[d, t, y, uri(t, y, s)] for t, y, r, d, s in ratings]),
        )
        zf.writestr(
            "ratings.csv",
            sheet(["Date", "Name", "Year", "Letterboxd URI", "Rating"],
                  [[d, t, y, uri(t, y, s), r] for t, y, r, d, s in ratings]),
        )
        zf.writestr(
            "diary.csv",
            sheet(["Date", "Name", "Year", "Letterboxd URI", "Rating",
                   "Rewatch", "Tags", "Watched Date"],
                  [[d, t, y, uri(t, y, s), r, "", "", d]
                   for t, y, r, d, s in ratings]),
        )
        zf.writestr(
            "watchlist.csv",
            sheet(["Date", "Name", "Year", "Letterboxd URI"],
                  [["2026-01-01", t, y, uri(t, y, s)] for t, y, s in watchlist]),
        )
        zf.writestr(
            "likes/films.csv",
            sheet(["Date", "Name", "Year", "Letterboxd URI"],
                  [["2026-01-01", t, y, uri(t, y, s)] for t, y, s in likes]),
        )
    return path


@pytest.fixture
def project(tmp_path: Path, monkeypatch):
    (tmp_path / "config.toml").write_text(
        """
region = "US"
contact = "test@example.com"
services = []

[[members]]
username = "zach"
name = "Zach"

[[members]]
username = "colin"
name = "Colin"

[[members]]
username = "gabe"
name = "Gabe"
""",
        encoding="utf-8",
    )
    (tmp_path / "veto.yaml").write_text("{}", encoding="utf-8")
    (tmp_path / "overrides.yaml").write_text("{}", encoding="utf-8")
    (tmp_path / "data" / "exports").mkdir(parents=True)
    monkeypatch.setenv("TMDB_API_KEY", "test-key")
    cfg = config_mod.load(tmp_path)
    conn = db_mod.connect(cfg.db_path)
    for m in cfg.members:
        db_mod.upsert_member(conn, m.username)
    conn.commit()
    yield cfg, conn
    conn.close()


@pytest.fixture
def tmdb_factory():
    from movienight.enrich.tmdb import Tmdb

    def factory(key, user_agent, min_interval=0.0):
        return Tmdb(key, user_agent, min_interval=0.0, transport=mock_transport())

    return factory


def catalog_ratings(rng_titles: list[tuple[str, float, str]]) -> list[tuple]:
    """[(title, rating, date)] → zip `ratings` rows, resolving year from CATALOG."""
    by_title: dict[str, dict] = {}
    for f in CATALOG.values():
        by_title.setdefault(f["title"], f)
    rows = []
    for title, rating, date in rng_titles:
        f = by_title[title]
        year = int(f["release_date"][:4])
        rows.append((title, year, rating, date, None))
    return rows
