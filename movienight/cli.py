"""movienight CLI (SCOPING §3): import | sync | enrich | score | build | all.

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
    sub.add_parser("all", help="import → sync → enrich → score → build")

    args = parser.parse_args(argv)
    cfg = config_mod.load(args.root)
    conn = db.connect(cfg.db_path)
    for m in cfg.members:
        db.upsert_member(conn, m.username)
    conn.commit()

    t0 = time.monotonic()
    try:
        if args.cmd == "import":
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
        elif args.cmd == "all":
            from . import enrich
            from .build import builder
            from .ingest import importer, rss
            from .model import score

            importer.run(conn, cfg, sorted(cfg.exports_dir.glob("*.zip")))
            rss.run(conn, cfg)
            enrich.run(conn, cfg)
            score.run(conn, cfg)
            builder.run(conn, cfg)
    finally:
        conn.close()
    print(f"{args.cmd}: done in {time.monotonic() - t0:.1f}s")


if __name__ == "__main__":
    main(sys.argv[1:])
