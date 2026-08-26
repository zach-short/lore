import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { DEFAULT_FILTERS } from "./filters";
import { mkData, mkFilm, mkScore } from "./fixtures";
import { computeResults } from "./select";

import type { LoreData } from "./types";

function selection(overrides: Partial<Parameters<typeof computeResults>[1]> = {}) {
  return {
    subset: [1, 2, 3],
    mode: "blind" as const,
    agg: "avg_nomisery" as const,
    filters: DEFAULT_FILTERS,
    ...overrides,
  };
}

describe("computeResults", () => {
  it("ranks by aggregated z, breaking ties toward the better-known film", () => {
    const low = mkFilm({ title: "Low", sc: { "1": mkScore({ z: 0 }), "2": mkScore({ z: 0 }), "3": mkScore({ z: 0 }) } });
    const high = mkFilm({ title: "High", sc: { "1": mkScore({ z: 1 }), "2": mkScore({ z: 1 }), "3": mkScore({ z: 1 }) } });
    const tiedObscure = mkFilm({ title: "Tied obscure", vc: 10, sc: { "1": mkScore({ z: 1 }), "2": mkScore({ z: 1 }), "3": mkScore({ z: 1 }) } });
    const data = mkData([low, tiedObscure, high]);
    const titles = computeResults(data, selection()).map((r) => r.film.title);
    expect(titles).toEqual(["High", "Tied obscure", "Low"]);
  });

  it("returns nothing for an empty subset and applies filters first", () => {
    const data = mkData([mkFilm({ kind: "short" })]);
    expect(computeResults(data, selection({ subset: [] }))).toEqual([]);
    expect(computeResults(data, selection())).toEqual([]);
  });
});

/* Integration against the real pipeline output when it's present (site/data.json
   two levels up). Pins the SCOPING §8 acceptance shape: a healthy blind-spot
   pool for the full group, every result carrying a finite sort key. */
const realDataPath = fileURLToPath(
  new URL("../../../../site/data.json", import.meta.url),
);

describe.skipIf(!existsSync(realDataPath))("against the real payload", () => {
  const data = JSON.parse(readFileSync(realDataPath, "utf8")) as LoreData;
  const everyone = data.members.map((m) => m.id);

  it("yields a healthy blind-spot pool for the whole group", () => {
    const results = computeResults(data, selection({ subset: everyone }));
    expect(results.length).toBeGreaterThanOrEqual(50);
    for (const r of results.slice(0, 100)) {
      expect(Number.isFinite(r.result.key)).toBe(true);
      expect(r.result.ok).toBe(true);
    }
  });

  it("keeps every mode coherent for every solo and duo subset", () => {
    const subsets = [
      ...everyone.map((id) => [id]),
      [everyone[0], everyone[1]],
    ];
    for (const subset of subsets) {
      for (const mode of ["blind", "evangelist", "rewatch"] as const) {
        const results = computeResults(data, selection({ subset, mode }));
        for (const r of results) {
          expect(r.result.ok).toBe(true);
        }
        if (mode === "evangelist" && subset.length < 2) {
          expect(results).toEqual([]);
        }
      }
    }
  });
});
