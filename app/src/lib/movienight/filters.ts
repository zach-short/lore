import { canonProvider, decadeOf } from "./format";

import type { Film, Filters } from "./types";

export const DEFAULT_FILTERS: Filters = {
  sv: [],
  rent: false,
  rtmax: 0,
  decades: [],
  langs: [],
  xg: [],
  shorts: false,
  strict: false,
};

export function passesFilters(film: Film, filters: Filters): boolean {
  if (!filters.shorts && (film.kind === "short" || (film.rt != null && film.rt < 40))) {
    return false;
  }
  if (filters.rtmax && film.rt != null && film.rt > filters.rtmax) return false;
  if (filters.decades.length) {
    if (!film.year) return false;
    if (!filters.decades.includes(decadeOf(film.year))) return false;
  }
  if (filters.langs.length && (!film.lang || !filters.langs.includes(film.lang))) {
    return false;
  }
  if (filters.xg.some((genre) => film.genres.includes(genre))) return false;
  if (filters.sv.length) {
    let available = (film.pv.f ?? []).map(canonProvider);
    if (filters.rent) {
      available = available.concat((film.pv.r ?? []).map(canonProvider));
    }
    if (!filters.sv.some((service) => available.includes(service))) return false;
  }
  return true;
}

export type FilterCatalogs = {
  services: Record<string, number>;
  decades: Record<number, number>;
  langs: Record<string, number>;
  genres: Record<string, number>;
};

/** Counts across the whole payload, used to build the filter option lists. */
export function buildCatalogs(films: Film[]): FilterCatalogs {
  const services: Record<string, number> = {};
  const decades: Record<number, number> = {};
  const langs: Record<string, number> = {};
  const genres: Record<string, number> = {};
  for (const film of films) {
    for (const provider of film.pv.f ?? []) {
      const name = canonProvider(provider);
      services[name] = (services[name] ?? 0) + 1;
    }
    if (film.year) {
      const decade = decadeOf(film.year);
      decades[decade] = (decades[decade] ?? 0) + 1;
    }
    if (film.lang) langs[film.lang] = (langs[film.lang] ?? 0) + 1;
    for (const genre of film.genres) genres[genre] = (genres[genre] ?? 0) + 1;
  }
  return { services, decades, langs, genres };
}

export function topKeys(counts: Record<string, number>, n: number): string[] {
  return Object.keys(counts)
    .sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0))
    .slice(0, n);
}

export function countActiveFilters(filters: Filters): number {
  let active = 0;
  if (filters.sv.length) active++;
  if (filters.rent) active++;
  if (filters.rtmax) active++;
  if (filters.decades.length) active++;
  if (filters.langs.length) active++;
  if (filters.xg.length) active++;
  if (filters.shorts) active++;
  if (filters.strict) active++;
  return active;
}
