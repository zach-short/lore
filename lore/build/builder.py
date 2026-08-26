"""Emit the static site (SCOPING §8 step 6): site/index.html + data.js
(+ data.json for tooling). Data is shipped as a JS global rather than fetched,
so the page works from file:// as well as from Cloudflare Pages."""

from __future__ import annotations

import json
import shutil
import sqlite3
from pathlib import Path

from jinja2 import Environment, FileSystemLoader

from .. import db
from ..config import Config
from ..model.score import MODEL_VERSION

TEMPLATES = Path(__file__).parent / "templates"


def _payload(conn: sqlite3.Connection, cfg: Config) -> dict:
    veto_raw = cfg.veto()
    stats_row = conn.execute(
        "SELECT value FROM meta WHERE key='member_stats'"
    ).fetchone()
    member_stats = {
        s["member_id"]: s for s in json.loads(stats_row["value"])
    } if stats_row else {}

    members = []
    order = {m.username: i for i, m in enumerate(cfg.members)}
    names = {m.username: m.name for m in cfg.members}
    for row in conn.execute("SELECT * FROM member").fetchall():
        if row["username"] not in order:
            continue  # config is authoritative for who's in the group
        s = member_stats.get(row["id"], {})
        members.append(
            {
                "id": row["id"],
                "username": row["username"],
                "name": names.get(row["username"])
                or row["display_name"]
                or row["username"],
                "n": s.get("n_ratings", 0),
                "mu": s.get("mu", 3.2),
                "sigma": s.get("sigma", 0.75),
                "p75": s.get("p75", 4.0),
                "w": s.get("w", 0),
                "top": [t["label"] for t in s.get("top_features", [])[:6]],
            }
        )
    members.sort(key=lambda m: order[m["username"]])
    member_ids = {m["id"] for m in members}

    scores: dict[int, dict[int, dict]] = {}
    for r in conn.execute(
        "SELECT * FROM score WHERE model_version=?", (MODEL_VERSION,)
    ):
        if r["member_id"] not in member_ids:
            continue
        scores.setdefault(r["film_id"], {})[r["member_id"]] = {
            "s": r["stars"],
            "z": r["z"],
            "c": r["confidence"],
            "x": json.loads(r["components"] or "{}"),
        }

    interactions: dict[int, dict[int, dict]] = {}
    for r in conn.execute("SELECT * FROM interaction"):
        if r["member_id"] not in member_ids:
            continue
        interactions.setdefault(r["film_id"], {})[r["member_id"]] = {
            "w": r["watched"],
            "r": r["rating"],
            "l": r["liked"],
            "wl": r["in_watchlist"],
            "rw": r["rewatch_count"],
            "d": r["last_watched"],
        }

    films, vetoed = [], []
    rows = conn.execute(
        """SELECT f.*, ft.runtime_min, ft.original_language, ft.genres AS g,
                  ft.poster_path, ft.vote_average, ft.vote_count, ft.popularity,
                  p.flatrate, p.rent, p.buy
           FROM film f
           JOIN film_tmdb ft ON ft.film_id = f.id
           LEFT JOIN providers p ON p.film_id = f.id AND p.region = ?
           WHERE f.kind IN ('movie','short')""",
        (cfg.region,),
    ).fetchall()
    for f in rows:
        if f["id"] not in scores:
            continue
        v = veto_raw.get(f["lb_slug"]) if f["lb_slug"] else None
        if v is not None:
            v = v if isinstance(v, dict) else {}
            vetoed.append(
                {
                    "title": f["title"],
                    "year": f["year"],
                    "by": v.get("by"),
                    "why": v.get("why"),
                }
            )
            continue
        films.append(
            {
                "id": f["id"],
                "slug": f["lb_slug"],
                "tmdb": f["tmdb_id"],
                "title": f["title"],
                "year": f["year"],
                "rt": f["runtime_min"],
                "kind": f["kind"],
                "genres": [g["name"] for g in json.loads(f["g"] or "[]")],
                "lang": f["original_language"],
                "poster": f["poster_path"],
                "pool": f["pool"],
                "va": f["vote_average"],
                "vc": f["vote_count"],
                "pv": {
                    "f": json.loads(f["flatrate"] or "[]"),
                    "r": json.loads(f["rent"] or "[]"),
                    "b": json.loads(f["buy"] or "[]"),
                },
                "seen": interactions.get(f["id"], {}),
                "sc": scores[f["id"]],
            }
        )

    return {
        "generated_at": db.utcnow(),
        "model_version": MODEL_VERSION,
        "region": cfg.region,
        "services_precheck": cfg.services,
        "members": members,
        "films": films,
        "veto": vetoed,
    }


def run(conn: sqlite3.Connection, cfg: Config) -> None:
    payload = _payload(conn, cfg)
    site = cfg.site_dir
    site.mkdir(parents=True, exist_ok=True)

    data = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    (site / "data.json").write_text(data, encoding="utf-8")
    (site / "data.js").write_text(
        "window.__LORE__ = " + data + ";", encoding="utf-8"
    )
    env = Environment(loader=FileSystemLoader(TEMPLATES), autoescape=True)
    html = env.get_template("index.html.j2").render(
        generated_at=payload["generated_at"],
        n_films=len(payload["films"]),
        n_members=len(payload["members"]),
        region=cfg.region,
    )
    (site / "index.html").write_text(html, encoding="utf-8")
    for asset in ("app.js", "style.css"):
        shutil.copyfile(TEMPLATES / asset, site / asset)
    size_kb = (site / "data.js").stat().st_size // 1024
    print(
        f"build: site/ written — {len(payload['films'])} films, "
        f"{len(payload['members'])} members, data.js {size_kb} KB"
    )
    if not payload["films"]:
        print(
            "build: (no scored films yet — the page will show its empty state. "
            "Run enrich + score once a TMDB key is configured.)"
        )
