import { describe, expect, it } from "vitest";

import {
  andList,
  canonProvider,
  decadeOf,
  featLabel,
  langName,
  metaLine,
  providerSummary,
  shortYear,
  starStr,
} from "./format";

describe("canonProvider", () => {
  it("folds ad tiers and channel resellers into the parent service", () => {
    expect(canonProvider("Netflix Standard with Ads")).toBe("Netflix");
    expect(canonProvider("Max Amazon Channel")).toBe("Max");
    expect(canonProvider("Paramount Plus Apple TV Channel")).toBe("Paramount Plus");
    expect(canonProvider("MGM Plus Roku Premium Channel")).toBe("MGM Plus");
    expect(canonProvider("Criterion Channel")).toBe("Criterion Channel");
  });
});

describe("featLabel", () => {
  it("renders each feature kind for humans", () => {
    expect(featLabel("kw:slow cinema")).toBe("“slow cinema”");
    expect(featLabel("d:Christopher Nolan")).toBe("dir. Christopher Nolan");
    expect(featLabel("l:ko")).toBe("Korean-language");
    expect(featLabel("rt:90-120")).toBe("90-120 min");
    expect(featLabel("g:Drama")).toBe("Drama");
    expect(featLabel("dec:1990s")).toBe("1990s");
  });
});

describe("small formatters", () => {
  it("joins names with an ampersand", () => {
    expect(andList([])).toBe("");
    expect(andList(["Zach"])).toBe("Zach");
    expect(andList(["Zach", "Colin"])).toBe("Zach & Colin");
    expect(andList(["Zach", "Colin", "Gabe"])).toBe("Zach, Colin & Gabe");
  });

  it("formats stars, decades, years and languages", () => {
    expect(starStr(4.25)).toBe("★4.3");
    expect(decadeOf(1994)).toBe(1990);
    expect(shortYear(1994)).toBe("’94");
    expect(shortYear(null)).toBe("");
    expect(langName("en")).toBe("English");
    expect(langName("xx")).toBe("XX");
    expect(langName(null)).toBe("?");
  });
});

describe("providerSummary and metaLine", () => {
  it("summarizes streaming availability with attribution", () => {
    expect(providerSummary({ f: ["Max Amazon Channel", "Max", "Hulu", "Netflix"] }, "US")).toEqual({
      label: "Max · Hulu · Netflix",
      isAttributed: true,
    });
    expect(providerSummary({ f: [], r: ["Amazon Video"] }, "US")).toEqual({
      label: "rent only",
      isAttributed: true,
    });
    expect(providerSummary({}, "US")).toEqual({
      label: "not streaming US",
      isAttributed: false,
    });
  });

  it("builds the card meta line", () => {
    expect(
      metaLine({ rt: 132, genres: ["Drama", "Thriller", "Crime"], lang: "ko", year: 2019 }),
    ).toBe("132 min · Drama · Thriller · Korean · ’19");
    expect(metaLine({ rt: null, genres: [], lang: "en", year: null })).toBe("");
  });
});
