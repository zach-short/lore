import { strFromU8, unzipSync } from "fflate";

import { parseCsv } from "./csv";

/* Client-side port of the pipeline importer's merge rule
   (lore/ingest/importer.py): ratings.csv wins for current taste, diary
   supplies dates and rewatches, watchlist.csv is an authoritative snapshot,
   likes/films.csv sets the liked flag. The pipeline re-parses the raw zip
   authoritatively after `lore pull`; this parse exists so onboarding can
   show the member what their reel contains before it leaves the device. */

export type ParsedFilm = {
  /** slug when the URI is a letterboxd.com film URL, else title|year */
  key: string;
  slug: string | null;
  title: string | null;
  year: number | null;
  watched: boolean;
  rating: number | null;
  liked: boolean;
  inWatchlist: boolean;
  /** diary rows beyond the first watch */
  rewatchCount: number;
  /** latest diary/watched date, YYYY-MM-DD */
  lastWatched: string | null;
};

export type ExportCounts = {
  watched: number;
  diary: number;
  ratings: number;
  watchlist: number;
  likes: number;
};

export type ExportSummary = {
  /** from profile.csv, else the letterboxd-<user>-… zip filename */
  username: string | null;
  displayName: string | null;
  /** distinct films across all files */
  films: number;
  counts: ExportCounts;
  meanRating: number | null;
  /** index i = (i + 1) / 2 stars, i.e. 0.5 through 5.0 */
  ratingHistogram: number[];
  firstActivity: string | null;
  lastActivity: string | null;
};

export type ParsedExport = {
  summary: ExportSummary;
  films: ParsedFilm[];
};

export class ExportParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExportParseError";
  }
}

const FILM_URL_RE = /letterboxd\.com\/(?:[^/]+\/)?film\/([^/]+)/;
const ZIPNAME_RE = /letterboxd-([A-Za-z0-9_]+)-\d{4}/;

export function slugFromUri(uri: string | undefined): string | null {
  /* boxd.it short links can't be expanded without a page fetch (ToS §4b);
     those rows fall back to title+year identity, same as the pipeline. */
  if (!uri) return null;
  const m = FILM_URL_RE.exec(uri);
  return m ? m[1] : null;
}

export function parseExportZip(bytes: Uint8Array, fileName: string): ParsedExport {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new ExportParseError("That file isn’t a readable zip.");
  }

  const read = (name: string): Record<string, string>[] => {
    const path = Object.keys(entries).find(
      (n) => n === name || n.endsWith(`/${name}`),
    );
    return path ? parseCsv(strFromU8(entries[path])) : [];
  };

  const films = new Map<string, ParsedFilm>();
  const counts: ExportCounts = {
    watched: 0,
    diary: 0,
    ratings: 0,
    watchlist: 0,
    likes: 0,
  };

  const touch = (row: Record<string, string>): ParsedFilm => {
    const slug = slugFromUri(row["Letterboxd URI"]);
    const title = (row["Name"] ?? "").trim() || null;
    const yearRaw = (row["Year"] ?? "").trim();
    const year = /^\d+$/.test(yearRaw) ? Number(yearRaw) : null;
    const key = slug ?? `${title ?? "?"}|${year ?? "?"}`;
    let film = films.get(key);
    if (!film) {
      film = {
        key,
        slug,
        title,
        year,
        watched: false,
        rating: null,
        liked: false,
        inWatchlist: false,
        rewatchCount: 0,
        lastWatched: null,
      };
      films.set(key, film);
    }
    return film;
  };

  const laterDate = (a: string | null, b: string | null) =>
    a && b ? (a > b ? a : b) : (a ?? b);

  for (const row of read("watched.csv")) {
    const film = touch(row);
    film.watched = true;
    film.lastWatched = laterDate(film.lastWatched, cleanDate(row["Date"]));
    counts.watched++;
  }

  const diaryRatings = new Map<string, number>();
  for (const row of read("diary.csv")) {
    const film = touch(row);
    film.watched = true;
    const watchedDate = cleanDate(row["Watched Date"]) ?? cleanDate(row["Date"]);
    film.lastWatched = laterDate(film.lastWatched, watchedDate);
    if ((row["Rewatch"] ?? "").trim().toLowerCase() === "yes") {
      film.rewatchCount++;
    }
    const rating = cleanRating(row["Rating"]);
    if (rating !== null) diaryRatings.set(film.key, rating);
    counts.diary++;
  }
  /* Diary ratings back-fill films the ratings snapshot misses; ratings.csv
     below overwrites them, so the current-taste rule still holds. */
  for (const [key, rating] of diaryRatings) {
    const film = films.get(key);
    if (film) film.rating = rating;
  }

  for (const row of read("ratings.csv")) {
    const film = touch(row);
    film.watched = true;
    film.rating = cleanRating(row["Rating"]);
    counts.ratings++;
  }

  for (const row of read("watchlist.csv")) {
    touch(row).inWatchlist = true;
    counts.watchlist++;
  }

  for (const row of read("likes/films.csv")) {
    touch(row).liked = true;
    counts.likes++;
  }

  if (!films.size) {
    throw new ExportParseError(
      "No Letterboxd CSVs in that zip — export from Settings → Data, not a list download.",
    );
  }

  const profile = read("profile.csv")[0];
  const username =
    (profile?.["Username"] ?? "").trim() ||
    ZIPNAME_RE.exec(fileName)?.[1] ||
    null;
  const displayName = (profile?.["Given Name"] ?? "").trim() || null;

  const ratings = [...films.values()]
    .map((f) => f.rating)
    .filter((r): r is number => r !== null);
  const histogram = Array.from({ length: 10 }, () => 0);
  for (const r of ratings) {
    const bucket = Math.round(r * 2) - 1;
    if (bucket >= 0 && bucket < 10) histogram[bucket]++;
  }

  const dates = [...films.values()]
    .map((f) => f.lastWatched)
    .filter((d): d is string => d !== null)
    .sort();

  return {
    summary: {
      username,
      displayName,
      films: films.size,
      counts,
      meanRating: ratings.length
        ? ratings.reduce((a, b) => a + b, 0) / ratings.length
        : null,
      ratingHistogram: histogram,
      firstActivity: dates[0] ?? null,
      lastActivity: dates[dates.length - 1] ?? null,
    },
    films: [...films.values()],
  };
}

function cleanDate(value: string | undefined): string | null {
  const v = (value ?? "").trim();
  return v || null;
}

function cleanRating(value: string | undefined): number | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
