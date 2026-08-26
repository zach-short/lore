import { describe, expect, it } from "vitest";

import {
  buildCatalogs,
  countActiveFilters,
  DEFAULT_FILTERS,
  passesFilters,
  topKeys,
} from "./filters";
import { mkFilm } from "./fixtures";

import type { Filters } from "./types";

function filters(overrides: Partial<Filters> = {}): Filters {
  return { ...DEFAULT_FILTERS, ...overrides };
}

describe("passesFilters", () => {
  it("excludes shorts by default, by kind or by runtime", () => {
    expect(passesFilters(mkFilm({ kind: "short", rt: 90 }), filters())).toBe(false);
    expect(passesFilters(mkFilm({ rt: 38 }), filters())).toBe(false);
    expect(passesFilters(mkFilm({ rt: 38 }), filters({ shorts: true }))).toBe(true);
  });

  it("caps runtime only when a cap is set", () => {
    const long = mkFilm({ rt: 200 });
    expect(passesFilters(long, filters())).toBe(true);
    expect(passesFilters(long, filters({ rtmax: 150 }))).toBe(false);
    expect(passesFilters(mkFilm({ rt: null }), filters({ rtmax: 90 }))).toBe(true);
  });

  it("filters decades, rejecting year-less films when active", () => {
    expect(passesFilters(mkFilm({ year: 1994 }), filters({ decades: [1990] }))).toBe(true);
    expect(passesFilters(mkFilm({ year: 2004 }), filters({ decades: [1990] }))).toBe(false);
    expect(passesFilters(mkFilm({ year: null }), filters({ decades: [1990] }))).toBe(false);
  });

  it("filters languages and excluded genres", () => {
    expect(passesFilters(mkFilm({ lang: "ko" }), filters({ langs: ["ko"] }))).toBe(true);
    expect(passesFilters(mkFilm({ lang: "en" }), filters({ langs: ["ko"] }))).toBe(false);
    expect(
      passesFilters(mkFilm({ genres: ["Drama", "Horror"] }), filters({ xg: ["Horror"] })),
    ).toBe(false);
  });

  it("matches streaming services on canonical names", () => {
    const film = mkFilm({ pv: { f: ["Max Amazon Channel"], r: ["Apple TV Store"], b: [] } });
    expect(passesFilters(film, filters({ sv: ["Max"] }))).toBe(true);
    expect(passesFilters(film, filters({ sv: ["Netflix"] }))).toBe(false);
  });

  it("counts rentals only when asked to", () => {
    const rentOnly = mkFilm({ pv: { f: [], r: ["Amazon Video"], b: [] } });
    expect(passesFilters(rentOnly, filters({ sv: ["Amazon Video"] }))).toBe(false);
    expect(
      passesFilters(rentOnly, filters({ sv: ["Amazon Video"], rent: true })),
    ).toBe(true);
  });
});

describe("catalogs", () => {
  it("counts canonical services, decades, languages and genres", () => {
    const films = [
      mkFilm({ pv: { f: ["Netflix", "Max Amazon Channel"] }, year: 1994, lang: "en", genres: ["Drama"] }),
      mkFilm({ pv: { f: ["Netflix Standard with Ads"] }, year: 1999, lang: "ko", genres: ["Drama", "Thriller"] }),
    ];
    const cats = buildCatalogs(films);
    expect(cats.services).toEqual({ Netflix: 2, Max: 1 });
    expect(cats.decades).toEqual({ 1990: 2 });
    expect(cats.langs).toEqual({ en: 1, ko: 1 });
    expect(cats.genres).toEqual({ Drama: 2, Thriller: 1 });
  });

  it("ranks keys by count", () => {
    expect(topKeys({ a: 1, b: 5, c: 3 }, 2)).toEqual(["b", "c"]);
  });
});

describe("countActiveFilters", () => {
  it("counts each dimension once", () => {
    expect(countActiveFilters(DEFAULT_FILTERS)).toBe(0);
    expect(
      countActiveFilters(
        filters({ sv: ["Netflix", "Max"], rtmax: 120, shorts: true }),
      ),
    ).toBe(3);
  });
});
