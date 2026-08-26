import { DEFAULT_CONF } from "./constants";
import { evaluateFilm } from "./evaluate";
import { passesFilters } from "./filters";

import type {
  Aggregation,
  EvaluationContext,
  Filters,
  Member,
  MemberId,
  Mode,
  MovienightData,
  ScoredFilm,
} from "./types";

export type Selection = {
  subset: MemberId[];
  mode: Mode;
  agg: Aggregation;
  filters: Filters;
};

export function membersById(members: Member[]): Map<MemberId, Member> {
  return new Map(members.map((m) => [m.id, m]));
}

export function buildContext(
  data: MovienightData,
  selection: Selection,
): EvaluationContext {
  return {
    subset: selection.subset,
    mode: selection.mode,
    agg: selection.agg,
    strict: selection.filters.strict,
    allMemberIds: data.members.map((m) => m.id),
    membersById: membersById(data.members),
    conf: data.conf ?? DEFAULT_CONF,
  };
}

/** Filter → evaluate → rank. Ties break toward the better-known film. */
export function computeResults(
  data: MovienightData,
  selection: Selection,
): ScoredFilm[] {
  if (!selection.subset.length) return [];
  const ctx = buildContext(data, selection);
  const results: ScoredFilm[] = [];
  for (const film of data.films) {
    if (!passesFilters(film, selection.filters)) continue;
    const result = evaluateFilm(film, ctx);
    if (result.ok) results.push({ film, result });
  }
  results.sort(
    (a, b) =>
      b.result.key - a.result.key || (b.film.vc ?? 0) - (a.film.vc ?? 0),
  );
  return results;
}
