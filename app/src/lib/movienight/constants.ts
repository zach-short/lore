import type { ConfBands, FeatBands } from "./types";

/* Fallbacks for data.json written by an older build; live values ship in the
   payload because confidence is measured on a scale that moves with the model
   (terciles of the live distribution — see builder._conf_bands). */
export const DEFAULT_CONF: ConfBands = { lo: 0.25, hi: 0.5, misery: 0.2 };
export const DEFAULT_FEAT: FeatBands = { pos: 0.1, neg: -0.15 };

/** Hard floor: drop a pick when any present member is predicted below this. */
export const MISERY_STARS = 2.5;

/** Below half, the prediction is carried by the group/quality prior. */
export const PRIOR_LED = 0.5;

/** Under ~60 ratings the n/(n+40) guard, not taste, is what holds w down. */
export const THIN_HISTORY = 60;

/** Mean z of the seers must clear this for a rewatch candidate. */
export const REWATCH_Z = 0.5;

/** The evangelist's own rating bar (raised to their p75 when higher). */
export const EVANGELIST_MIN = 4.0;

export const TMDB_POSTER_BASE = "https://image.tmdb.org/t/p/";

/* Literal `https://` template types keep these assignable to expo-router's
   typed ExternalPathString hrefs. */
export function letterboxdUrl(
  slug: string | null,
  tmdb: number | null,
): `https://${string}` {
  if (slug) return `https://letterboxd.com/film/${slug}/`;
  return `https://www.themoviedb.org/movie/${tmdb ?? ""}`;
}

export function tmdbUrl(tmdb: number | null): `https://${string}` | null {
  return tmdb == null ? null : `https://www.themoviedb.org/movie/${tmdb}`;
}
