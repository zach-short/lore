import { EVANGELIST_MIN, MISERY_STARS, REWATCH_Z } from "./constants";

import type {
  Aggregation,
  Evaluation,
  EvaluationContext,
  Film,
  Member,
  MemberId,
  Score,
  SeenEntry,
} from "./types";

export function scoreOf(film: Film, memberId: MemberId): Score | undefined {
  return film.sc[String(memberId)];
}

export function seenOf(film: Film, memberId: MemberId): SeenEntry | null {
  const entry = film.seen[String(memberId)];
  return entry && entry.w ? entry : null;
}

export function anySeen(film: Film, memberIds: MemberId[]): boolean {
  return memberIds.some((id) => seenOf(film, id) !== null);
}

/** A member's actual rating on the shared z scale. */
export function actualZ(member: Member, rating: number): number {
  return (rating - member.mu) / (member.sigma || 0.75);
}

export function aggregate(zs: number[], agg: Aggregation): number {
  if (zs.length === 0) return -99;
  if (agg === "least_misery") return Math.min(...zs);
  if (agg === "most_pleasure") return Math.max(...zs);
  return zs.reduce((sum, z) => sum + z, 0) / zs.length;
}

/** Group stars over `ids`: real ratings where they exist, predictions elsewhere. */
export function starsFor(ids: MemberId[], film: Film): number | null {
  let sum = 0;
  let count = 0;
  for (const id of ids) {
    const seen = seenOf(film, id);
    if (seen && seen.r != null) {
      sum += seen.r;
      count++;
    } else {
      const predicted = scoreOf(film, id);
      if (predicted) {
        sum += predicted.s;
        count++;
      }
    }
  }
  return count ? sum / count : null;
}

const REJECTED: Evaluation = { ok: false, key: 0, ann: null, star: null };

/** The misery floor only trusts predictions confident enough to veto with. */
function violatesMiseryFloor(
  score: Score,
  ctx: EvaluationContext,
): boolean {
  return (
    ctx.agg === "avg_nomisery" &&
    score.s < MISERY_STARS &&
    score.c >= ctx.conf.misery
  );
}

function evaluateBlind(film: Film, ctx: EvaluationContext): Evaluation {
  const scope = ctx.strict ? ctx.allMemberIds : ctx.subset;
  if (anySeen(film, scope)) return REJECTED;
  const zs: number[] = [];
  for (const id of ctx.subset) {
    const score = scoreOf(film, id);
    if (!score) return REJECTED;
    if (violatesMiseryFloor(score, ctx)) return REJECTED;
    zs.push(score.z);
  }
  return {
    ok: true,
    key: aggregate(zs, ctx.agg),
    ann: null,
    star: starsFor(ctx.subset, film),
  };
}

function evaluateEvangelist(film: Film, ctx: EvaluationContext): Evaluation {
  if (ctx.subset.length < 2) return REJECTED;
  const seers = ctx.subset.filter((id) => seenOf(film, id));
  if (seers.length !== 1) return REJECTED;
  const evangelist = ctx.membersById.get(seers[0]);
  if (!evangelist) return REJECTED;
  const theirSeen = seenOf(film, evangelist.id);
  if (!theirSeen || theirSeen.r == null) return REJECTED;
  if (theirSeen.r < Math.max(EVANGELIST_MIN, evangelist.p75)) return REJECTED;

  const rest = ctx.subset.filter((id) => id !== evangelist.id);
  const zs: number[] = [];
  for (const id of rest) {
    const score = scoreOf(film, id);
    if (!score) return REJECTED;
    if (violatesMiseryFloor(score, ctx)) return REJECTED;
    zs.push(score.z);
  }
  return {
    ok: true,
    key: aggregate(zs, ctx.agg),
    ann: { kind: "evangelist", who: evangelist, rating: theirSeen.r },
    star: starsFor(rest, film),
  };
}

function evaluateRewatch(film: Film, ctx: EvaluationContext): Evaluation {
  const ratedSeers: { m: Member; r: number }[] = [];
  let seerCount = 0;
  for (const id of ctx.subset) {
    const member = ctx.membersById.get(id);
    if (!member) continue;
    const seen = seenOf(film, id);
    if (seen) {
      seerCount++;
      if (seen.r != null) ratedSeers.push({ m: member, r: seen.r });
    }
  }
  if (!seerCount || !ratedSeers.length) return REJECTED;
  if (seerCount < Math.ceil(ctx.subset.length / 2)) return REJECTED;

  const zSeen =
    ratedSeers.reduce((sum, x) => sum + actualZ(x.m, x.r), 0) /
    ratedSeers.length;
  if (zSeen < REWATCH_Z) return REJECTED;

  const zs: number[] = [];
  for (const id of ctx.subset) {
    const member = ctx.membersById.get(id);
    if (!member) return REJECTED;
    const seen = seenOf(film, id);
    if (seen && seen.r != null) {
      zs.push(actualZ(member, seen.r));
    } else {
      const score = scoreOf(film, id);
      if (!score) return REJECTED;
      zs.push(score.z);
    }
  }
  return {
    ok: true,
    key: aggregate(zs, ctx.agg),
    ann: { kind: "rewatch", seers: ratedSeers },
    star: starsFor(ctx.subset, film),
  };
}

export function evaluateFilm(film: Film, ctx: EvaluationContext): Evaluation {
  if (ctx.mode === "blind") return evaluateBlind(film, ctx);
  if (ctx.mode === "evangelist") return evaluateEvangelist(film, ctx);
  return evaluateRewatch(film, ctx);
}
