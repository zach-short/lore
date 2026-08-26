import type {
  EvaluationContext,
  Film,
  Member,
  MovienightData,
  Score,
  SeenEntry,
} from "./types";

/* Small deterministic corpus for unit tests. Numbers are chosen so each
   threshold in the model (misery floor, evangelist bar, rewatch gate,
   confidence bands) can be crossed from both sides. */

export const zach: Member = {
  id: 1, username: "zachshort", name: "Zach",
  n: 900, mu: 3.0, sigma: 1.0, p75: 4.0, w: 0.9,
  top: ["Drama", "Crime"],
};

export const colin: Member = {
  id: 2, username: "cgra3538", name: "Colin",
  n: 200, mu: 3.5, sigma: 0.5, p75: 4.5, w: 0.8,
  top: ["Thriller"],
};

export const gabe: Member = {
  id: 3, username: "gabe", name: "Gabe",
  n: 30, mu: 4.0, sigma: 0.8, p75: 4.5, w: 0.15,
  top: ["Adventure"], lowconf: true,
};

export const members: Member[] = [zach, colin, gabe];

export const conf = { lo: 0.3, hi: 0.55, misery: 0.2 };
export const feat = { pos: 0.02, neg: -0.046 };

export function mkSeen(overrides: Partial<SeenEntry> = {}): SeenEntry {
  return { w: 1, r: null, l: 0, wl: 0, rw: 0, d: "2026-01-01", ...overrides };
}

export function mkScore(overrides: Partial<Score> = {}): Score {
  return {
    s: 3.6,
    z: 0.4,
    c: 0.6,
    x: { c: [], w: 0.9, pr: 0.5, q: 0.5, gt: null },
    ...overrides,
  };
}

let nextId = 1;

export function mkFilm(overrides: Partial<Film> = {}): Film {
  return {
    id: nextId++,
    slug: "some-film",
    tmdb: 1000 + nextId,
    title: "Some Film",
    year: 2010,
    rt: 110,
    kind: "movie",
    genres: ["Drama"],
    lang: "en",
    poster: null,
    pool: 1,
    va: 7.5,
    vc: 5000,
    pv: { f: [], r: [], b: [] },
    seen: {},
    sc: {
      "1": mkScore(),
      "2": mkScore({ s: 3.8, z: 0.2, c: 0.6 }),
      "3": mkScore({ s: 4.1, z: 0.1, c: 0.25 }),
    },
    ...overrides,
  };
}

export function mkContext(
  overrides: Partial<EvaluationContext> = {},
): EvaluationContext {
  return {
    subset: [1, 2, 3],
    mode: "blind",
    agg: "avg_nomisery",
    strict: false,
    allMemberIds: [1, 2, 3],
    membersById: new Map(members.map((m) => [m.id, m])),
    conf,
    ...overrides,
  };
}

export function mkData(films: Film[]): MovienightData {
  return {
    generated_at: "2026-08-26T00:00:00Z",
    model_version: "content-v2",
    conf,
    feat,
    region: "US",
    members,
    films,
    veto: [],
  };
}
