"""Per-member taste model and scoring (SCOPING §7a).

z-scored ratings with variance shrinkage → content profile over TMDB feature
vectors → per-member calibration (cosine → z) → blend with a quality+group
prior by rating-count weight → confidence + explainable components."""

from __future__ import annotations

import json
import math
import sqlite3
from dataclasses import dataclass, field

from .. import db
from ..config import Config
from . import features as F

MODEL_VERSION = "content-v1"

K_SIGMA = 25          # shrinkage strength for σ̂ (SCOPING §7a)
N_BLEND = 40          # w_u = n / (n + 40)
LIKE_Z = 0.75         # like-without-rating pseudo-signal
WATCHLIST_Z = 0.3     # watchlist profile-only signal
QUALITY_M = 500       # Bayesian damping mass for TMDB rating
PRIOR_QUALITY_W = 0.6
PRIOR_GROUP_W = 0.4
HEAVY_RATER_MIN = 100  # members whose taste forms the group prior
CAL_MIN_N = 20        # own calibration fit below this uses the pooled fit
Z_CLAMP = 3.0
SUPPORT_MIN = 3       # a feature "encountered" ≥3 times counts toward support
SIGMA_FLOOR = 0.25
DEFAULT_SIGMA = 0.75
DEFAULT_MU = 3.2


@dataclass
class MemberModel:
    member_id: int
    username: str
    n_ratings: int = 0
    mu: float = DEFAULT_MU
    sigma_hat: float = DEFAULT_SIGMA
    p75: float = 4.0
    profile: dict[str, float] | None = None
    cal_a: float = 0.0
    cal_b: float = 2.0
    feature_counts: dict[str, int] = field(default_factory=dict)

    @property
    def w(self) -> float:
        return self.n_ratings / (self.n_ratings + N_BLEND)


def _unit(fv: F.FilmVec) -> dict[str, float]:
    return {f: v / fv.norm for f, v in fv.vec.items()}


def _percentile(sorted_vals: list[float], q: float) -> float:
    if not sorted_vals:
        return 4.0
    idx = min(len(sorted_vals) - 1, max(0, round(q * (len(sorted_vals) - 1))))
    return sorted_vals[idx]


class Scorer:
    def __init__(
        self,
        conn: sqlite3.Connection,
        cfg: Config,
        vecs: dict[int, F.FilmVec] | None = None,
    ):
        self.conn = conn
        self.cfg = cfg
        if vecs is None:
            vecs, _ = F.build_all(conn)
        self.vecs = vecs
        self.units = {fid: _unit(fv) for fid, fv in vecs.items()}
        self.members: dict[int, MemberModel] = {}
        self.quality_z: dict[int, float] = {}
        self.group_taste: dict[int, float] = {}
        self.group_mu = DEFAULT_MU
        self.group_sigma = DEFAULT_SIGMA

    # ---------------- fitting ----------------

    def fit(
        self,
        exclude: dict[int, set[int]] | None = None,
        exclude_from_group: set[int] | None = None,
    ) -> None:
        """exclude: {member_id: film_ids} withheld entirely (for evaluation)."""
        exclude = exclude or {}
        exclude_from_group = exclude_from_group or set()

        rows = self.conn.execute(
            """SELECT i.*, m.username FROM interaction i
               JOIN member m ON m.id = i.member_id"""
        ).fetchall()
        by_member: dict[int, list[sqlite3.Row]] = {}
        for r in rows:
            by_member.setdefault(r["member_id"], []).append(r)

        # Pooled spread of ratings around each member's own mean.
        sq_sum, n_sum, all_ratings = 0.0, 0, []
        prelim: dict[int, tuple[float, list[float]]] = {}
        for mid, its in by_member.items():
            held = exclude.get(mid, set())
            ratings = [
                r["rating"]
                for r in its
                if r["rating"] is not None and r["film_id"] not in held
            ]
            if not ratings:
                continue
            mu = sum(ratings) / len(ratings)
            prelim[mid] = (mu, ratings)
            all_ratings.extend(ratings)
            if len(ratings) >= 5:
                sq_sum += sum((x - mu) ** 2 for x in ratings)
                n_sum += len(ratings)
        var_g = sq_sum / n_sum if n_sum else DEFAULT_SIGMA**2
        self.group_sigma = max(math.sqrt(var_g), SIGMA_FLOOR)
        self.group_mu = (
            sum(all_ratings) / len(all_ratings) if all_ratings else DEFAULT_MU
        )

        cal_points_all: list[tuple[float, float]] = []
        cal_points_by_member: dict[int, list[tuple[float, float]]] = {}

        for mid, its in by_member.items():
            username = its[0]["username"]
            mm = MemberModel(member_id=mid, username=username)
            held = exclude.get(mid, set())
            mu, ratings = prelim.get(mid, (DEFAULT_MU, []))
            n = len(ratings)
            mm.n_ratings = n
            if n:
                mm.mu = mu
                var = sum((x - mu) ** 2 for x in ratings) / n if n > 1 else var_g
                var_hat = (n * var + K_SIGMA * var_g) / (n + K_SIGMA)
                mm.sigma_hat = max(math.sqrt(var_hat), SIGMA_FLOOR)
                mm.p75 = _percentile(sorted(ratings), 0.75)

            profile: dict[str, float] = {}
            points: list[tuple[int, float]] = []  # (film_id, z) for calibration
            for r in its:
                fid = r["film_id"]
                if fid in held:
                    continue
                unit = self.units.get(fid)
                if unit is None:
                    continue
                # feature exposure (for confidence support): any watched/rated film
                if r["watched"] or r["rating"] is not None:
                    for feat in unit:
                        mm.feature_counts[feat] = mm.feature_counts.get(feat, 0) + 1
                z = None
                if r["rating"] is not None and n:
                    z = max(-Z_CLAMP, min(Z_CLAMP, (r["rating"] - mm.mu) / mm.sigma_hat))
                    points.append((fid, z))
                elif r["liked"]:
                    z = LIKE_Z
                elif r["in_watchlist"] and not r["watched"]:
                    z = WATCHLIST_Z
                if not z:
                    continue
                for feat, v in unit.items():
                    profile[feat] = profile.get(feat, 0.0) + z * v

            norm = math.sqrt(sum(v * v for v in profile.values()))
            if norm > 1e-9:
                mm.profile = {f: v / norm for f, v in profile.items()}
                pts = [
                    (self._cosine(mm.profile, fid), z)
                    for fid, z in points
                ]
                cal_points_by_member[mid] = pts
                cal_points_all.extend(pts)
            self.members[mid] = mm

        pooled = _linfit(cal_points_all) if len(cal_points_all) >= CAL_MIN_N else (0.0, 2.0)
        for mm in self.members.values():
            pts = cal_points_by_member.get(mm.member_id, [])
            mm.cal_a, mm.cal_b = _linfit(pts) if len(pts) >= CAL_MIN_N else pooled

        self._fit_quality()
        self._fit_group_taste(exclude_from_group)

    def _fit_quality(self) -> None:
        rows = self.conn.execute(
            "SELECT film_id, vote_average, vote_count FROM film_tmdb"
        ).fetchall()
        rated = [r for r in rows if (r["vote_count"] or 0) > 0]
        if not rated:
            return
        c = sum(r["vote_average"] for r in rated) / len(rated)
        damped = {
            r["film_id"]: ((r["vote_count"] or 0) * (r["vote_average"] or c) + QUALITY_M * c)
            / ((r["vote_count"] or 0) + QUALITY_M)
            for r in rows
        }
        vals = list(damped.values())
        mu = sum(vals) / len(vals)
        sd = math.sqrt(sum((v - mu) ** 2 for v in vals) / len(vals)) or 1.0
        self.quality_z = {
            fid: max(-Z_CLAMP, min(Z_CLAMP, (v - mu) / sd)) for fid, v in damped.items()
        }

    def _fit_group_taste(self, exclude_from_group: set[int]) -> None:
        heavy = [
            mm
            for mm in self.members.values()
            if mm.n_ratings >= HEAVY_RATER_MIN
            and mm.profile is not None
            and mm.member_id not in exclude_from_group
        ]
        if not heavy:
            self.group_taste = {}
            return
        for fid in self.vecs:
            zs = [self._content_z(mm, fid) for mm in heavy]
            self.group_taste[fid] = sum(zs) / len(zs)

    # ---------------- prediction ----------------

    def _cosine(self, profile: dict[str, float], film_id: int) -> float:
        unit = self.units[film_id]
        small, big = (
            (profile, unit) if len(profile) < len(unit) else (unit, profile)
        )
        return sum(v * big.get(f, 0.0) for f, v in small.items())

    def _content_z(self, mm: MemberModel, film_id: int) -> float:
        cos = self._cosine(mm.profile, film_id)
        return max(-Z_CLAMP, min(Z_CLAMP, mm.cal_a + mm.cal_b * cos))

    def prior(self, film_id: int) -> float:
        q = self.quality_z.get(film_id, 0.0)
        gt = self.group_taste.get(film_id)
        if gt is None:
            return q
        return PRIOR_QUALITY_W * q + PRIOR_GROUP_W * gt

    def predict(self, mm: MemberModel, film_id: int) -> dict:
        w = mm.w if mm.profile is not None else 0.0
        content = self._content_z(mm, film_id) if mm.profile is not None else 0.0
        prior = self.prior(film_id)
        zhat = w * content + (1 - w) * prior
        mu = mm.mu if mm.n_ratings else self.group_mu
        sigma = mm.sigma_hat if mm.n_ratings else self.group_sigma
        stars = max(0.5, min(5.0, mu + zhat * sigma))

        unit = self.units[film_id]
        support = sum(
            v * v for f, v in unit.items() if mm.feature_counts.get(f, 0) >= SUPPORT_MIN
        )
        confidence = round(w * support, 3)

        comps: list[tuple[str, float]] = []
        if mm.profile is not None:
            for f, v in unit.items():
                p = mm.profile.get(f)
                if p:
                    c = mm.cal_b * p * v
                    if abs(c) >= 0.05:
                        comps.append((f, round(c, 2)))
            comps.sort(key=lambda t: t[1], reverse=True)
            comps = comps[:4] + [c for c in comps[4:] if c[1] < 0][-2:]
        return {
            "z": round(zhat, 3),
            "stars": round(stars, 2),
            "confidence": confidence,
            "components": {
                "c": comps,
                "w": round(w, 2),
                "pr": round(prior, 2),
                "q": round(self.quality_z.get(film_id, 0.0), 2),
                "gt": round(self.group_taste[film_id], 2)
                if film_id in self.group_taste
                else None,
            },
        }

    def member_summary(self, mm: MemberModel) -> dict:
        top = []
        if mm.profile:
            top = [
                {"f": f, "label": F.feature_label(f), "v": round(v, 3)}
                for f, v in sorted(
                    mm.profile.items(), key=lambda t: t[1], reverse=True
                )[:8]
            ]
        return {
            "member_id": mm.member_id,
            "username": mm.username,
            "n_ratings": mm.n_ratings,
            "mu": round(mm.mu, 2),
            "sigma": round(mm.sigma_hat, 2),
            "p75": mm.p75,
            "w": round(mm.w, 2),
            "top_features": top,
        }


def _linfit(points: list[tuple[float, float]]) -> tuple[float, float]:
    """Least-squares z ≈ a + b·cos, slope clamped to [0, 8] — a negative slope
    would mean the content model is anti-predictive; floor it instead of
    trusting it."""
    n = len(points)
    if n < 2:
        return 0.0, 2.0
    mx = sum(p[0] for p in points) / n
    my = sum(p[1] for p in points) / n
    var = sum((p[0] - mx) ** 2 for p in points)
    if var < 1e-9:
        return my, 0.0
    cov = sum((p[0] - mx) * (p[1] - my) for p in points)
    b = max(0.0, min(8.0, cov / var))
    return my - b * mx, b


def run(conn: sqlite3.Connection, cfg: Config) -> None:
    scorer = Scorer(conn, cfg)
    if not scorer.vecs:
        print(
            "score: no enriched films yet — run `lore enrich` (needs a "
            "TMDB key) first. Nothing to score."
        )
        return
    scorer.fit()
    now = db.utcnow()
    rows = []
    for mm in scorer.members.values():
        for fid in scorer.vecs:
            p = scorer.predict(mm, fid)
            rows.append(
                (
                    mm.member_id,
                    fid,
                    MODEL_VERSION,
                    p["z"],
                    p["stars"],
                    p["confidence"],
                    json.dumps(p["components"], separators=(",", ":")),
                    now,
                )
            )
    conn.execute("DELETE FROM score WHERE model_version=?", (MODEL_VERSION,))
    conn.executemany(
        "INSERT INTO score (member_id, film_id, model_version, z, stars, "
        "confidence, components, computed_at) VALUES (?,?,?,?,?,?,?,?)",
        rows,
    )
    summaries = [scorer.member_summary(mm) for mm in scorer.members.values()]
    conn.execute(
        "INSERT INTO meta (key, value) VALUES ('member_stats', ?) "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        (json.dumps(summaries),),
    )
    conn.commit()
    print(
        f"score: {len(rows)} scores over {len(scorer.vecs)} films × "
        f"{len(scorer.members)} members ({MODEL_VERSION})"
    )
    for s in summaries:
        feats = ", ".join(t["label"] for t in s["top_features"][:5]) or "—"
        print(
            f"score:   {s['username']}: n={s['n_ratings']} μ={s['mu']} "
            f"σ̂={s['sigma']} w={s['w']} taste: {feats}"
        )
