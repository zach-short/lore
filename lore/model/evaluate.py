"""Temporal-holdout evaluation (SCOPING §7a): per member, withhold the last
~15 rated films, rank them against 300 sampled unwatched films, and compare
recall@20 / mean rank / stars-MAE against popularity-only and quality-only
baselines. The model earns its keep by beating both."""

from __future__ import annotations

import random
import sqlite3

from ..config import Config
from . import features as F
from .score import Scorer

HOLDOUT_N = 15
SAMPLE_N = 300
MIN_RATINGS = 30


def _ranks(order: list[int], targets: set[int]) -> list[int]:
    return [i + 1 for i, fid in enumerate(order) if fid in targets]


def run(conn: sqlite3.Connection, cfg: Config) -> None:
    vecs, films = F.build_all(conn)
    if not vecs:
        print("eval: no enriched films — nothing to evaluate.")
        return
    popularity = {
        f["id"]: (f["popularity"] or 0.0) for f in films if f["id"] in vecs
    }
    members = conn.execute("SELECT * FROM member").fetchall()
    rng = random.Random(42)
    rows_out = []

    for m in members:
        rated = conn.execute(
            """SELECT film_id, rating,
                      COALESCE(last_watched, rating_activity_at) AS d
               FROM interaction
               WHERE member_id=? AND rating IS NOT NULL
                 AND COALESCE(last_watched, rating_activity_at) IS NOT NULL
               ORDER BY COALESCE(last_watched, rating_activity_at)""",
            (m["id"],),
        ).fetchall()
        rated = [r for r in rated if r["film_id"] in vecs]
        if len(rated) < MIN_RATINGS:
            rows_out.append((m["username"], len(rated), None))
            continue
        holdout = rated[-HOLDOUT_N:]
        holdout_ids = {r["film_id"] for r in holdout}
        actual = {r["film_id"]: r["rating"] for r in holdout}

        scorer = Scorer(conn, cfg, vecs=vecs)
        scorer.fit(
            exclude={m["id"]: holdout_ids}, exclude_from_group={m["id"]}
        )
        mm = scorer.members[m["id"]]

        watched = {
            r["film_id"]
            for r in conn.execute(
                "SELECT film_id FROM interaction WHERE member_id=? AND "
                "(watched=1 OR rating IS NOT NULL)",
                (m["id"],),
            )
        }
        unwatched = [fid for fid in vecs if fid not in watched]
        sample = rng.sample(unwatched, min(SAMPLE_N, len(unwatched)))
        candidates = list(holdout_ids) + sample

        preds = {fid: scorer.predict(mm, fid) for fid in candidates}
        order_model = sorted(candidates, key=lambda f: preds[f]["z"], reverse=True)
        order_pop = sorted(
            candidates, key=lambda f: popularity.get(f, 0.0), reverse=True
        )
        order_q = sorted(
            candidates, key=lambda f: scorer.quality_z.get(f, 0.0), reverse=True
        )

        def recall20(order: list[int]) -> float:
            return len([f for f in order[:20] if f in holdout_ids]) / len(holdout_ids)

        model_ranks = _ranks(order_model, holdout_ids)
        mae = sum(
            abs(preds[f]["stars"] - actual[f]) for f in holdout_ids
        ) / len(holdout_ids)
        rows_out.append(
            (
                m["username"],
                len(rated),
                {
                    "recall_model": recall20(order_model),
                    "recall_pop": recall20(order_pop),
                    "recall_q": recall20(order_q),
                    "mean_rank": sum(model_ranks) / len(model_ranks),
                    "mae": mae,
                    "n_cand": len(candidates),
                },
            )
        )

    print("\neval: temporal holdout — last "
          f"{HOLDOUT_N} rated films vs {SAMPLE_N} sampled unwatched")
    print(f"{'member':<14}{'n':>6}  {'r@20':>6} {'pop':>6} {'qual':>6}  "
          f"{'meanrank':>9}  {'MAE★':>5}")
    for username, n, r in rows_out:
        if r is None:
            print(f"{username:<14}{n:>6}  (needs ≥{MIN_RATINGS} dated ratings — skipped)")
            continue
        beat = "✓" if r["recall_model"] >= max(r["recall_pop"], r["recall_q"]) else "✗"
        print(
            f"{username:<14}{n:>6}  {r['recall_model']:>6.2f} {r['recall_pop']:>6.2f} "
            f"{r['recall_q']:>6.2f}  {r['mean_rank']:>9.1f}  {r['mae']:>5.2f} {beat}"
        )
    print("eval: ✓ = model beats both baselines on recall@20 "
          f"(candidates per member ≈ {HOLDOUT_N + SAMPLE_N})")
