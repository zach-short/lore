"""Film feature vectors (SCOPING §7a): sparse dicts, L2-normalized per block,
block weights tuned for explainability. Pure Python — at ~10⁴ films × ~10³
features, numpy would be gold-plating (it arrives with phase 2's CF anyway)."""

from __future__ import annotations

import json
import math
import sqlite3
from dataclasses import dataclass

BLOCK_WEIGHTS = {
    "g": 1.0,   # genres
    "kw": 1.5,  # keywords carry the "dark comedy / heist / slow cinema" flavor
    "d": 1.2,   # directors
    "a": 0.5,   # top-5 cast
    "dec": 0.4, # decade
    "l": 0.4,   # original language
    "rt": 0.2,  # runtime bucket
}
KEYWORD_MIN_DF = 4
KEYWORD_VOCAB_CAP = 800
RUNTIME_BUCKETS = [(0, 80), (80, 100), (100, 120), (120, 150), (150, 10_000)]


@dataclass
class FilmVec:
    film_id: int
    vec: dict[str, float]
    norm: float


def runtime_bucket(runtime: int | None) -> str | None:
    if not runtime:
        return None
    for lo, hi in RUNTIME_BUCKETS:
        if lo <= runtime < hi:
            return f"{lo}-{hi}" if hi < 10_000 else f"{lo}+"
    return None


def load_enriched(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    """Scorable films: enriched movies and shorts (shorts are default-filtered
    client-side; TV is excluded from scoring entirely)."""
    return conn.execute(
        """SELECT f.id, f.year, f.kind, ft.* FROM film f
           JOIN film_tmdb ft ON ft.film_id = f.id
           WHERE f.kind IN ('movie', 'short')"""
    ).fetchall()


def build_vocab(films: list[sqlite3.Row]) -> dict[str, float]:
    """Keyword vocabulary: df ≥ 4 in our corpus, capped at 800, idf-weighted."""
    df: dict[str, int] = {}
    for f in films:
        for kw in json.loads(f["keywords"] or "[]"):
            name = kw["name"]
            df[name] = df.get(name, 0) + 1
    kept = sorted(
        ((name, count) for name, count in df.items() if count >= KEYWORD_MIN_DF),
        key=lambda t: t[1],
        reverse=True,
    )[:KEYWORD_VOCAB_CAP]
    n = max(len(films), 1)
    return {name: math.log(n / count) for name, count in kept}


def film_vector(film: sqlite3.Row, vocab: dict[str, float]) -> FilmVec | None:
    blocks: dict[str, dict[str, float]] = {}

    genres = [g["name"] for g in json.loads(film["genres"] or "[]")]
    if genres:
        blocks["g"] = {f"g:{g}": 1.0 for g in genres}
    kws = {
        f"kw:{k['name']}": vocab[k["name"]]
        for k in json.loads(film["keywords"] or "[]")
        if k["name"] in vocab
    }
    if kws:
        blocks["kw"] = kws
    directors = [d["name"] for d in json.loads(film["directors"] or "[]")]
    if directors:
        blocks["d"] = {f"d:{d}": 1.0 for d in directors}
    cast = [a["name"] for a in json.loads(film["cast_top"] or "[]")[:5]]
    if cast:
        blocks["a"] = {f"a:{a}": 1.0 for a in cast}
    year = film["year"]
    if year:
        blocks["dec"] = {f"dec:{(year // 10) * 10}s": 1.0}
    if film["original_language"]:
        blocks["l"] = {f"l:{film['original_language']}": 1.0}
    rb = runtime_bucket(film["runtime_min"])
    if rb:
        blocks["rt"] = {f"rt:{rb}": 1.0}

    if not blocks:
        return None
    vec: dict[str, float] = {}
    norm_sq = 0.0
    for block, feats in blocks.items():
        w = BLOCK_WEIGHTS[block]
        block_norm = math.sqrt(sum(v * v for v in feats.values()))
        for feat, v in feats.items():
            vec[feat] = w * v / block_norm
        norm_sq += w * w
    return FilmVec(film_id=film["id"], vec=vec, norm=math.sqrt(norm_sq))


def build_all(conn: sqlite3.Connection) -> tuple[dict[int, FilmVec], list[sqlite3.Row]]:
    films = load_enriched(conn)
    vocab = build_vocab(films)
    vecs: dict[int, FilmVec] = {}
    for f in films:
        fv = film_vector(f, vocab)
        if fv:
            vecs[f["id"]] = fv
    return vecs, films


def feature_label(feat: str) -> str:
    """Human name for a feature key, for reason strings."""
    kind, _, name = feat.partition(":")
    return {
        "g": name,
        "kw": f"“{name}”",
        "d": f"dir. {name}",
        "a": name,
        "dec": name,
        "l": {"en": "English-language"}.get(name, f"{name}-language"),
        "rt": f"{name} min",
    }.get(kind, name)
