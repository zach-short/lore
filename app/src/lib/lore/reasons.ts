import { PRIOR_LED, THIN_HISTORY } from "./constants";
import { scoreOf, seenOf } from "./evaluate";
import { andList, featLabel, starStr } from "./format";

import type {
  ConfBands,
  Evaluation,
  FeatBands,
  Film,
  Member,
  MemberId,
} from "./types";

type ReasonContext = {
  subset: MemberId[];
  membersById: Map<MemberId, Member>;
  feat: FeatBands;
};

/** One human sentence (or a few) per card — SCOPING §7d: if a recommendation
    can't articulate itself, that's a model smell we surface, not hide. */
export function reasonFor(
  film: Film,
  result: Evaluation,
  ctx: ReasonContext,
): string {
  const parts: string[] = [];

  if (result.ann?.kind === "evangelist") {
    parts.push(
      `${result.ann.who.name} gave this ${starStr(result.ann.rating)} and nobody else has seen it.`,
    );
  }
  if (result.ann?.kind === "rewatch") {
    const raves = result.ann.seers
      .map((x) => `${x.m.name} ${starStr(x.r)}`)
      .join(", ");
    const verb = result.ann.seers.length > 1 ? "love" : "loves";
    parts.push(`${raves} already ${verb} it.`);
  }

  const watchlisted = ctx.subset
    .filter((id) => film.seen[String(id)]?.wl)
    .map((id) => ctx.membersById.get(id)?.name)
    .filter((name): name is string => Boolean(name));
  if (watchlisted.length) {
    parts.push(`On ${andList(watchlisted)}’s watchlist.`);
  }

  const merged: Record<string, number> = {};
  const unseenNames: string[] = [];
  const priorLed: Member[] = [];
  for (const id of ctx.subset) {
    if (seenOf(film, id)) continue;
    const score = scoreOf(film, id);
    const member = ctx.membersById.get(id);
    if (!score || !member) continue;
    unseenNames.push(member.name);
    if ((score.x?.w ?? 0) < PRIOR_LED) priorLed.push(member);
    for (const [feature, value] of score.x?.c ?? []) {
      merged[feature] = (merged[feature] ?? 0) + value;
    }
  }

  const features = Object.keys(merged).sort(
    (a, b) => (merged[b] ?? 0) - (merged[a] ?? 0),
  );
  const positive = features
    .filter((k) => (merged[k] ?? 0) > ctx.feat.pos)
    .slice(0, 3);
  const negative = features
    .filter((k) => (merged[k] ?? 0) < ctx.feat.neg)
    .slice(-1);

  if (positive.length) {
    const verb = positive.length > 1 ? "pull" : "pulls";
    const labels = positive.map(featLabel).join(", ");
    parts.push(
      unseenNames.length
        ? `${labels} ${verb} it up for ${andList(unseenNames)}.`
        : `${labels} scores well.`,
    );
  } else if (unseenNames.length && priorLed.length === unseenNames.length) {
    /* Two different reasons the prior ends up carrying a pick, and saying the
       wrong one is worse than saying nothing: a thin history, or a full one
       whose ratings the content features just don't explain. */
    const thin = priorLed.filter((m) => m.n < THIN_HISTORY).map((m) => m.name);
    const weak = priorLed.filter((m) => m.n >= THIN_HISTORY).map((m) => m.name);
    if (thin.length) {
      parts.push(
        `Mostly the group prior — ${andList(thin)} ${thin.length > 1 ? "have" : "has"} few ratings so far.`,
      );
    }
    if (weak.length) {
      parts.push(
        `Mostly the group prior — ${andList(weak)}’${weak.length > 1 ? "" : "s"} ratings don’t track genre and keyword patterns closely.`,
      );
    }
  }

  if (negative.length && positive.length) {
    parts.push(`(${featLabel(negative[0])} drags a little.)`);
  }

  return parts.join(" ");
}

export type ConfidenceBadge =
  | { kind: "wildcard"; names: string[] }
  | { kind: "high" }
  | null;

/** Per-card confidence badge. Members flagged lowconf are under the band for
    every candidate, so naming them here would stamp the same badge on every
    card — they are described once above the grid instead (see confidenceNote),
    but their presence still blocks "high confidence". */
export function confidenceBadge(
  film: Film,
  ctx: { subset: MemberId[]; membersById: Map<MemberId, Member>; conf: ConfBands },
): ConfidenceBadge {
  const unseen = ctx.subset
    .filter((id) => !seenOf(film, id))
    .map((id) => {
      const score = scoreOf(film, id);
      const member = ctx.membersById.get(id);
      return score && member ? { member, c: score.c } : null;
    })
    .filter((x): x is { member: Member; c: number } => x !== null);
  if (!unseen.length) return null;

  const vague = unseen.filter((x) => x.member.lowconf);
  const known = unseen.filter((x) => !x.member.lowconf);
  const wild = known.filter((x) => x.c < ctx.conf.lo);
  if (wild.length) {
    return { kind: "wildcard", names: wild.map((x) => x.member.name) };
  }
  if (!vague.length && known.length && known.every((x) => x.c >= ctx.conf.hi)) {
    return { kind: "high" };
  }
  return null;
}

export type ConfidenceNote = {
  thin: Member[];
  weak: Member[];
};

/** The once-at-the-top half of the wildcard story: members whose confidence
    never clears the band, described in terms of why the model is thin on them. */
export function confidenceNote(
  subset: MemberId[],
  membersById: Map<MemberId, Member>,
): ConfidenceNote | null {
  const low = subset
    .map((id) => membersById.get(id))
    .filter((m): m is Member => Boolean(m?.lowconf));
  if (!low.length) return null;
  return {
    thin: low.filter((m) => m.n < THIN_HISTORY),
    weak: low.filter((m) => m.n >= THIN_HISTORY),
  };
}
