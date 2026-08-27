"""End-to-end: import → enrich (mock TMDB) → score → eval → build, plus the
acceptance-criteria behaviors (idempotency, veto exclusion, resolution report)."""

import json

import yaml

from lore import db, enrich
from lore.build import builder
from lore.ingest import importer
from lore.model import evaluate, score
from tests.conftest import catalog_ratings, make_zip


def _date(i: int) -> str:
    return f"2025-{1 + i // 28:02d}-{1 + i % 28:02d}"


def seed_group(cfg, conn):
    zach = [(f"Nightfall {i}", 4.0 + (i % 3) * 0.5, _date(i)) for i in range(22)]
    zach += [
        (f"Sunny Side {24 + i}", 1.5 + (i % 3) * 0.5, _date(22 + i)) for i in range(8)
    ]
    zach += [("Han River 34", 4.5, _date(30)), ("Han River 35", 4.5, _date(31))]
    zach_rows = catalog_ratings(zach)
    zach_rows.append(("The Double", 2013, 3.0, _date(32), None))
    zach_rows.append(("Ghost Unfound", 1999, 3.5, _date(33), None))
    make_zip(
        cfg.exports_dir / "letterboxd-zach-2026.zip",
        "zach",
        ratings=zach_rows,
        watchlist=[("Han River 39", 2010, None), ("Sunny Side 33", 2009, None)],
        uri_style="slug",
    )

    colin = [
        (f"Sunny Side {24 + i}", 4.0 + (i % 2) * 0.5, _date(40 + i)) for i in range(10)
    ]
    colin += [(f"Nightfall {i}", 3.0, _date(50 + i)) for i in range(10)]
    colin += [("Han River 36", 4.0, _date(60))]
    make_zip(
        cfg.exports_dir / "letterboxd-colin-2026.zip",
        "colin",
        ratings=catalog_ratings(colin),
        uri_style="boxd",
    )

    gabe = [
        ("Nightfall 1", 4.5, _date(70)),
        ("Nightfall 2", 4.5, _date(71)),
        ("Nightfall 3", 4.5, _date(72)),
        ("Sunny Side 25", 3.5, _date(73)),
        ("Han River 37", 5.0, _date(74)),
    ]
    make_zip(
        cfg.exports_dir / "letterboxd-gabe-2026.zip",
        "gabe",
        ratings=catalog_ratings(gabe),
        watchlist=[("Nightfall 20", 2010, None), ("Han River 38", 2009, None)],
        likes=[("Nightfall 4", 1994, None)],
        uri_style="slug",
    )


def run_pipeline(cfg, conn, tmdb_factory):
    importer.run(conn, cfg, sorted(cfg.exports_dir.glob("*.zip")))
    enrich.run(conn, cfg, tmdb_factory=tmdb_factory)
    score.run(conn, cfg)
    builder.run(conn, cfg)


def test_full_pipeline(project, tmdb_factory, capsys):
    cfg, conn = project
    (cfg.root / "veto.yaml").write_text(
        yaml.safe_dump({"nightfall-3-1993": {"by": "zach", "why": "never again"}}),
        encoding="utf-8",
    )
    seed_group(cfg, conn)
    run_pipeline(cfg, conn, tmdb_factory)

    # --- resolution ---
    def status(where, arg):
        return conn.execute(
            f"SELECT resolution_status s FROM film WHERE {where}", (arg,)
        ).fetchone()["s"]

    assert status("lb_slug=?", "nightfall-0-1990") == "resolved"
    assert status("lb_slug=?", "the-double-2013") == "ambiguous"
    assert status("title_norm=?", "ghost unfound") == "unmatched"
    report = cfg.report_path.read_text(encoding="utf-8")
    assert "The Double" in report and "Ghost Unfound" in report

    # interacted films auto-resolve rate ≥ 97% excluding the two deliberate traps
    total = conn.execute(
        "SELECT count(*) c FROM film WHERE kind!='tv' AND id IN "
        "(SELECT film_id FROM interaction)"
    ).fetchone()["c"]
    resolved = conn.execute(
        "SELECT count(*) c FROM film WHERE tmdb_id IS NOT NULL AND id IN "
        "(SELECT film_id FROM interaction)"
    ).fetchone()["c"]
    assert resolved >= total - 2

    # --- pool ---
    pool = conn.execute("SELECT count(*) c FROM film WHERE pool=1").fetchone()["c"]
    assert 0 < pool <= cfg.pool_max_films
    unenriched_pool = conn.execute(
        """SELECT count(*) c FROM film f LEFT JOIN film_tmdb ft ON ft.film_id=f.id
           WHERE f.pool=1 AND ft.film_id IS NULL"""
    ).fetchone()["c"]
    assert unenriched_pool == 0

    # --- scores ---
    n_vec_films = conn.execute(
        "SELECT count(*) c FROM score WHERE member_id="
        "(SELECT id FROM member WHERE username='zach')"
    ).fetchone()["c"]
    assert n_vec_films > 30
    zach_id = db.get_member(conn, "zach")["id"]
    gabe_id = db.get_member(conn, "gabe")["id"]

    def zhat(username_id, title_norm):
        return conn.execute(
            """SELECT s.z FROM score s JOIN film f ON f.id=s.film_id
               WHERE s.member_id=? AND f.title_norm=?""",
            (username_id, title_norm),
        ).fetchone()["z"]

    unwatched_thrillers = [zhat(zach_id, "nightfall 22"), zhat(zach_id, "nightfall 23")]
    unwatched_comedies = [
        zhat(zach_id, "sunny side 32"),
        zhat(zach_id, "sunny side 33"),
    ]
    assert sum(unwatched_thrillers) / 2 > sum(unwatched_comedies) / 2

    gabe_conf = conn.execute(
        "SELECT max(confidence) c FROM score WHERE member_id=?", (gabe_id,)
    ).fetchone()["c"]
    assert gabe_conf < 0.25  # few ratings → wildcard territory

    comp = conn.execute(
        """SELECT s.components FROM score s JOIN film f ON f.id=s.film_id
           WHERE s.member_id=? AND f.title_norm='nightfall 22'""",
        (zach_id,),
    ).fetchone()["components"]
    x = json.loads(comp)
    assert x["c"], "reason components must exist for a well-matched film"

    # --- build ---
    data = json.loads((cfg.site_dir / "data.json").read_text(encoding="utf-8"))
    assert [m["name"] for m in data["members"]] == ["Zach", "Colin", "Gabe"]
    titles = {f["title"] for f in data["films"]}
    assert "Nightfall 3" not in titles, "vetoed film must never render"
    assert data["veto"] and data["veto"][0]["title"] == "Nightfall 3"
    f22 = next(f for f in data["films"] if f["title"] == "Nightfall 22")
    assert len(f22["sc"]) == 3
    assert f22["pv"]["f"] or f22["pv"]["r"]

    # --- idempotency: re-run everything, counts stable ---
    n_int = conn.execute("SELECT count(*) c FROM interaction").fetchone()["c"]
    run_pipeline(cfg, conn, tmdb_factory)
    assert conn.execute("SELECT count(*) c FROM interaction").fetchone()["c"] == n_int

    # --- overrides: fix the ambiguous film by internal id (~key). tmdb 9090
    # already exists as a discover-created row, so this also exercises the
    # duplicate-merge path.
    amb = conn.execute("SELECT id FROM film WHERE lb_slug='the-double-2013'").fetchone()
    (cfg.root / "overrides.yaml").write_text(
        yaml.safe_dump({f"~{amb['id']}": 9090}), encoding="utf-8"
    )
    enrich.run(conn, cfg, tmdb_factory=tmdb_factory)
    fixed = conn.execute("SELECT * FROM film WHERE id=?", (amb["id"],)).fetchone()
    assert fixed["tmdb_id"] == 9090 and fixed["resolution_status"] == "resolved"
    dupes = conn.execute("SELECT count(*) c FROM film WHERE tmdb_id=9090").fetchone()[
        "c"
    ]
    assert dupes == 1, "override must fold the discover duplicate into the slug row"


def test_eval_runs(project, tmdb_factory, capsys):
    cfg, conn = project
    seed_group(cfg, conn)
    importer.run(conn, cfg, sorted(cfg.exports_dir.glob("*.zip")))
    enrich.run(conn, cfg, tmdb_factory=tmdb_factory)
    evaluate.run(conn, cfg)
    out = capsys.readouterr().out
    assert "temporal holdout" in out
    lines = [l for l in out.splitlines() if l.startswith("zach")]
    assert lines and "skipped" not in lines[0]
    assert any("skipped" in l for l in out.splitlines() if l.startswith("gabe"))
