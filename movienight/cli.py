"""movienight CLI (SCOPING §3):
pull | import | sync | enrich | score | build | publish | all.

Run from the project root (where config.toml lives). Phase 1 is on-demand:
`movienight all` chains everything and site/index.html is the product."""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

from . import config as config_mod
from . import db


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        prog="movienight",
        description="Group movie recommender over public Letterboxd histories.",
    )
    parser.add_argument(
        "--root",
        type=Path,
        default=None,
        help="project root (default: current directory)",
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser(
        "pull",
        help="download export zips uploaded through the app (Supabase) and import them",
    )
    p_import = sub.add_parser("import", help="import Letterboxd export zips")
    p_import.add_argument(
        "zips", nargs="*", type=Path,
        help="zip paths (default: data/exports/*.zip)",
    )
    p_import.add_argument(
        "--member", help="force the member username for the given zip(s)"
    )
    sub.add_parser("sync", help="poll each member's public RSS feed")
    sub.add_parser("enrich", help="resolve films to TMDB and fetch metadata")
    p_score = sub.add_parser("score", help="compute per-member × film scores")
    p_score.add_argument(
        "--eval", action="store_true", dest="run_eval",
        help="run the temporal-holdout evaluation instead of writing scores",
    )
    sub.add_parser("build", help="emit site/index.html + data.js")
    sub.add_parser(
        "publish", help="upload site/data.json to Supabase for the app"
    )
    sub.add_parser("all", help="pull → import → sync → enrich → score → build → publish")

    args = parser.parse_args(argv)
    cfg = config_mod.load(args.root)

    # App signups become members for every command, so a new friend who
    # onboarded in the app flows through sync/score/build with no config edit.
    # Offline runs degrade to config.toml members instead of failing.
    from .ingest import pull

    try:
        pull.sync_profile_members(cfg)
    except Exception as e:  # noqa: BLE001 - any network/API failure is non-fatal
        print(f"members: profile sync failed ({e}) — using config.toml only")

    conn = db.connect(cfg.db_path)
    for m in cfg.members:
        db.upsert_member(conn, m.username, m.name)
    conn.commit()

    t0 = time.monotonic()
    try:
        if args.cmd == "pull":
            pull.run(conn, cfg)
        elif args.cmd == "import":
            from .ingest import importer

            zips = args.zips or sorted(cfg.exports_dir.glob("*.zip"))
            importer.run(conn, cfg, [Path(z) for z in zips], args.member)
        elif args.cmd == "sync":
            from .ingest import rss

            rss.run(conn, cfg)
        elif args.cmd == "enrich":
            from . import enrich

            enrich.run(conn, cfg)
        elif args.cmd == "score":
            if args.run_eval:
                from .model import evaluate

                evaluate.run(conn, cfg)
            else:
                from .model import score

                score.run(conn, cfg)
        elif args.cmd == "build":
            from .build import builder

            builder.run(conn, cfg)
        elif args.cmd == "publish":
            from . import publish

            publish.run(cfg)
        elif args.cmd == "all":
            from . import enrich, publish
            from .build import builder
            from .ingest import importer, rss
            from .model import score

            pull.run(conn, cfg)
            importer.run(conn, cfg, sorted(cfg.exports_dir.glob("*.zip")))
            rss.run(conn, cfg)
            enrich.run(conn, cfg)
            score.run(conn, cfg)
            builder.run(conn, cfg)
            publish.run(cfg)
    finally:
        conn.close()
    print(f"{args.cmd}: done in {time.monotonic() - t0:.1f}s")


if __name__ == "__main__":
    main(sys.argv[1:])
