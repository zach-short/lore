import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { parseCsv } from "./csv";
import { ExportParseError, parseExportZip, slugFromUri } from "./parse-export";

function makeZip(files: Record<string, string>): Uint8Array {
  return zipSync(
    Object.fromEntries(
      Object.entries(files).map(([name, text]) => [name, strToU8(text)]),
    ),
  );
}

const URI = (slug: string) => `https://letterboxd.com/film/${slug}/`;

describe("parseCsv", () => {
  it("handles quoted commas, doubled quotes, newlines, CRLF, and BOM", () => {
    const rows = parseCsv(
      '﻿Date,Name,Year\r\n2024-01-01,"Love, Actually",2003\r\n' +
        '2024-01-02,"The ""Great"" Escape",1963\r\n2024-01-03,"Two\nLines",2000\r\n',
    );
    expect(rows).toHaveLength(3);
    expect(rows[0]["Name"]).toBe("Love, Actually");
    expect(rows[0]["Date"]).toBe("2024-01-01");
    expect(rows[1]["Name"]).toBe('The "Great" Escape');
    expect(rows[2]["Name"]).toBe("Two\nLines");
  });

  it("skips blank trailing lines", () => {
    expect(parseCsv("A,B\n1,2\n\n")).toHaveLength(1);
  });
});

describe("slugFromUri", () => {
  it("extracts slugs from film URLs, including user-scoped ones", () => {
    expect(slugFromUri(URI("heat-1995"))).toBe("heat-1995");
    expect(slugFromUri("https://letterboxd.com/zach/film/heat-1995/")).toBe(
      "heat-1995",
    );
  });

  it("returns null for boxd.it short links", () => {
    expect(slugFromUri("https://boxd.it/29Q2")).toBeNull();
  });
});

describe("parseExportZip", () => {
  const fullExport = makeZip({
    "profile.csv":
      "Date Joined,Username,Given Name,Family Name\n2020-01-01,zachshort,Zach,S\n",
    "watched.csv":
      "Date,Name,Year,Letterboxd URI\n" +
      `2024-01-05,Heat,1995,${URI("heat-1995")}\n` +
      `2024-02-01,Alien,1979,${URI("alien")}\n`,
    "diary.csv":
      "Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n" +
      `2024-01-05,Heat,1995,${URI("heat-1995")},4,,,2024-01-05\n` +
      `2024-06-01,Heat,1995,${URI("heat-1995")},4.5,Yes,,2024-06-01\n` +
      `2024-03-01,Stalker,1979,${URI("stalker")},5,,,2024-03-01\n`,
    "ratings.csv":
      "Date,Name,Year,Letterboxd URI,Rating\n" +
      `2024-06-01,Heat,1995,${URI("heat-1995")},5\n` +
      `2024-02-01,Alien,1979,${URI("alien")},3.5\n`,
    "watchlist.csv":
      "Date,Name,Year,Letterboxd URI\n" +
      `2024-05-01,Playtime,1967,${URI("playtime")}\n`,
    "likes/films.csv":
      "Date,Name,Year,Letterboxd URI\n" +
      `2024-03-02,Stalker,1979,${URI("stalker")}\n`,
  });

  it("merges files with ratings.csv winning over diary ratings", () => {
    const { films } = parseExportZip(fullExport, "letterboxd-zachshort-2024.zip");
    const byKey = new Map(films.map((f) => [f.key, f]));
    const heat = byKey.get("heat-1995")!;
    expect(heat.rating).toBe(5);
    expect(heat.rewatchCount).toBe(1);
    expect(heat.lastWatched).toBe("2024-06-01");
    expect(heat.watched).toBe(true);
    /* diary back-fills films missing from ratings.csv */
    expect(byKey.get("stalker")!.rating).toBe(5);
    expect(byKey.get("stalker")!.liked).toBe(true);
    expect(byKey.get("playtime")!.inWatchlist).toBe(true);
    expect(byKey.get("playtime")!.watched).toBe(false);
  });

  it("summarizes counts, identity, mean, and histogram", () => {
    const { summary } = parseExportZip(fullExport, "export.zip");
    expect(summary.username).toBe("zachshort");
    expect(summary.displayName).toBe("Zach");
    expect(summary.films).toBe(4);
    expect(summary.counts).toEqual({
      watched: 2,
      diary: 3,
      ratings: 2,
      watchlist: 1,
      likes: 1,
    });
    /* heat 5, alien 3.5, stalker 5 */
    expect(summary.meanRating).toBeCloseTo(4.5);
    expect(summary.ratingHistogram[9]).toBe(2); // two 5s
    expect(summary.ratingHistogram[6]).toBe(1); // one 3.5
    expect(summary.firstActivity).toBe("2024-02-01");
    expect(summary.lastActivity).toBe("2024-06-01");
  });

  it("falls back to the zip filename for the username", () => {
    const zip = makeZip({
      "watched.csv": `Date,Name,Year,Letterboxd URI\n2024-01-01,Heat,1995,${URI("heat-1995")}\n`,
    });
    const { summary } = parseExportZip(zip, "letterboxd-cgra3538-2024-08-26.zip");
    expect(summary.username).toBe("cgra3538");
  });

  it("keys boxd.it rows by title and year", () => {
    const zip = makeZip({
      "watched.csv":
        "Date,Name,Year,Letterboxd URI\n2024-01-01,Heat,1995,https://boxd.it/29Q2\n",
    });
    const { films } = parseExportZip(zip, "x.zip");
    expect(films[0].key).toBe("Heat|1995");
    expect(films[0].slug).toBeNull();
  });

  it("finds CSVs nested under a folder inside the zip", () => {
    const zip = makeZip({
      "letterboxd-zach/watched.csv": `Date,Name,Year,Letterboxd URI\n2024-01-01,Heat,1995,${URI("heat-1995")}\n`,
    });
    expect(parseExportZip(zip, "x.zip").summary.films).toBe(1);
  });

  it("rejects non-zips and zips with no Letterboxd CSVs", () => {
    expect(() => parseExportZip(strToU8("not a zip"), "x.zip")).toThrow(
      ExportParseError,
    );
    expect(() =>
      parseExportZip(makeZip({ "readme.txt": "hi" }), "x.zip"),
    ).toThrow(ExportParseError);
  });
});
