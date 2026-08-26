/* Schema of site/data.json as emitted by `lore build` (SCOPING §6):
   precomputed per-member × per-film scores; the app only filters/aggregates. */

export type MemberId = number;

export type Member = {
  id: MemberId;
  username: string;
  name: string;
  /** rating count */
  n: number;
  /** mean of the member's own star ratings */
  mu: number;
  /** shrunk std-dev of the member's ratings */
  sigma: number;
  /** 75th-percentile rating (evangelist bar) */
  p75: number;
  /** weight on the member's own taste model vs the prior */
  w: number;
  skill?: number;
  /** top inferred taste features, human-readable */
  top?: string[];
  /** true when confidence never clears the band for any candidate */
  lowconf?: boolean;
};

export type SeenEntry = {
  /** watched flag */
  w: 0 | 1;
  /** member's current rating, if any */
  r: number | null;
  /** liked flag */
  l: 0 | 1;
  /** on the member's watchlist */
  wl: 0 | 1;
  /** rewatch count */
  rw: number;
  /** last watched date, ISO */
  d: string | null;
};

export type ScoreExplain = {
  /** top signed feature contributions, e.g. [["g:Drama", 0.218]] */
  c: [string, number][];
  /** weight on the member's own model for this prediction */
  w: number;
  /** blended prior */
  pr: number | null;
  /** quality prior component */
  q: number | null;
  /** group-taste prior component (null when no qualifying members) */
  gt: number | null;
};

export type Score = {
  /** predicted stars on the member's own scale */
  s: number;
  /** predicted z-score (cross-member comparable) */
  z: number;
  /** confidence in [0, 1]-ish model units; bands come from `conf` */
  c: number;
  x?: ScoreExplain;
};

export type FilmKind = "movie" | "short" | "tv";

export type Providers = {
  /** flatrate (streaming) */
  f?: string[];
  /** rent */
  r?: string[];
  /** buy */
  b?: string[];
};

export type Film = {
  id: number;
  slug: string | null;
  tmdb: number | null;
  title: string;
  year: number | null;
  /** runtime, minutes */
  rt: number | null;
  kind: FilmKind;
  genres: string[];
  lang: string | null;
  /** TMDB poster path (prefix with the image CDN base) */
  poster: string | null;
  /** 1 = discovery-pool candidate, 0 = from someone's history/watchlist */
  pool: 0 | 1;
  /** TMDB vote average */
  va: number | null;
  /** TMDB vote count */
  vc: number | null;
  pv: Providers;
  /** keyed by member id (JSON keys are strings) */
  seen: Record<string, SeenEntry>;
  sc: Record<string, Score>;
};

export type ConfBands = {
  /** below this, a prediction is a wildcard */
  lo: number;
  /** at/above this for everyone, the pick is high-confidence */
  hi: number;
  /** the misery floor only trusts predictions at/above this */
  misery: number;
};

export type FeatBands = {
  /** a merged contribution above this reads as a positive reason */
  pos: number;
  /** below this, worth flagging as a drag */
  neg: number;
};

export type VetoEntry = {
  slug?: string;
  title?: string;
  by?: string;
  why?: string;
  date?: string;
};

export type LoreData = {
  generated_at: string;
  model_version: string;
  conf?: ConfBands;
  feat?: FeatBands;
  region?: string;
  services_precheck?: string[];
  members: Member[];
  films: Film[];
  veto?: VetoEntry[];
};

export type Mode = "blind" | "evangelist" | "rewatch";

export type Aggregation =
  | "avg_nomisery"
  | "avg"
  | "least_misery"
  | "most_pleasure";

export type Filters = {
  /** selected streaming services (canonical names) */
  sv: string[];
  /** count rentals as available */
  rent: boolean;
  /** max runtime in minutes; 0 = no cap */
  rtmax: number;
  /** decade start years, e.g. 1990 */
  decades: number[];
  /** original-language codes */
  langs: string[];
  /** excluded genres */
  xg: string[];
  /** include shorts (<40 min) */
  shorts: boolean;
  /** blind spot vs the whole group, not just tonight's subset */
  strict: boolean;
};

export type EvangelistAnnotation = {
  kind: "evangelist";
  who: Member;
  rating: number;
};

export type RewatchAnnotation = {
  kind: "rewatch";
  seers: { m: Member; r: number }[];
};

export type Annotation = EvangelistAnnotation | RewatchAnnotation;

export type Evaluation = {
  ok: boolean;
  /** aggregated z used as the sort key */
  key: number;
  ann: Annotation | null;
  /** group stars for tonight's subset, on the members' own scales */
  star: number | null;
};

export type ScoredFilm = {
  film: Film;
  result: Evaluation;
};

export type EvaluationContext = {
  subset: MemberId[];
  mode: Mode;
  agg: Aggregation;
  strict: boolean;
  allMemberIds: MemberId[];
  membersById: Map<MemberId, Member>;
  conf: ConfBands;
};
