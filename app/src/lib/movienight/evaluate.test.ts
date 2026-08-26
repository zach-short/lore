import { describe, expect, it } from "vitest";

import {
  actualZ,
  aggregate,
  evaluateFilm,
  starsFor,
} from "./evaluate";
import { colin, gabe, mkContext, mkFilm, mkScore, mkSeen, zach } from "./fixtures";

describe("aggregate", () => {
  it("averages by default and under the misery-floor variant", () => {
    expect(aggregate([1, 2, 3], "avg")).toBeCloseTo(2);
    expect(aggregate([1, 2, 3], "avg_nomisery")).toBeCloseTo(2);
  });

  it("takes min for least misery and max for most pleasure", () => {
    expect(aggregate([-1, 0.5, 2], "least_misery")).toBe(-1);
    expect(aggregate([-1, 0.5, 2], "most_pleasure")).toBe(2);
  });

  it("returns the sentinel for an empty list", () => {
    expect(aggregate([], "avg")).toBe(-99);
  });
});

describe("actualZ", () => {
  it("normalizes on the member's own scale", () => {
    expect(actualZ(zach, 4.0)).toBeCloseTo(1.0);
    expect(actualZ(colin, 3.0)).toBeCloseTo(-1.0);
  });

  it("guards a zero sigma", () => {
    expect(actualZ({ ...zach, sigma: 0 }, 3.75)).toBeCloseTo(1.0);
  });
});

describe("starsFor", () => {
  it("mixes real ratings with predictions", () => {
    const film = mkFilm({
      seen: { "1": mkSeen({ r: 5.0 }) },
      sc: { "1": mkScore({ s: 1.0 }), "2": mkScore({ s: 3.0 }) },
    });
    // Zach's real 5.0 wins over his prediction; Colin falls back to predicted.
    expect(starsFor([1, 2], film)).toBeCloseTo(4.0);
  });

  it("skips members with neither rating nor prediction", () => {
    const film = mkFilm({ sc: { "1": mkScore({ s: 4.0 }) } });
    expect(starsFor([1, 2], film)).toBeCloseTo(4.0);
  });
});

describe("blind spot", () => {
  it("accepts a film nobody in the subset has seen and averages z", () => {
    const film = mkFilm();
    const res = evaluateFilm(film, mkContext());
    expect(res.ok).toBe(true);
    expect(res.key).toBeCloseTo((0.4 + 0.2 + 0.1) / 3);
  });

  it("rejects a film any subset member has seen", () => {
    const film = mkFilm({ seen: { "2": mkSeen() } });
    expect(evaluateFilm(film, mkContext()).ok).toBe(false);
  });

  it("in strict mode also rejects films seen outside tonight's subset", () => {
    const film = mkFilm({ seen: { "3": mkSeen() } });
    const tonight = { subset: [1, 2] };
    expect(evaluateFilm(film, mkContext(tonight)).ok).toBe(true);
    expect(evaluateFilm(film, mkContext({ ...tonight, strict: true })).ok).toBe(
      false,
    );
  });

  it("drops a confident sub-2.5★ prediction (misery floor)", () => {
    const film = mkFilm({
      sc: {
        "1": mkScore(),
        "2": mkScore({ s: 2.0, c: 0.5 }),
        "3": mkScore(),
      },
    });
    expect(evaluateFilm(film, mkContext()).ok).toBe(false);
  });

  it("lets a low-confidence misery prediction through", () => {
    const film = mkFilm({
      sc: {
        "1": mkScore(),
        "2": mkScore({ s: 2.0, c: 0.1 }),
        "3": mkScore(),
      },
    });
    expect(evaluateFilm(film, mkContext()).ok).toBe(true);
  });

  it("ignores the misery floor under a plain average", () => {
    const film = mkFilm({
      sc: {
        "1": mkScore(),
        "2": mkScore({ s: 2.0, c: 0.5 }),
        "3": mkScore(),
      },
    });
    expect(evaluateFilm(film, mkContext({ agg: "avg" })).ok).toBe(true);
  });

  it("rejects when a subset member has no score", () => {
    const film = mkFilm({ sc: { "1": mkScore(), "2": mkScore() } });
    expect(evaluateFilm(film, mkContext()).ok).toBe(false);
  });
});

describe("evangelist", () => {
  const ctx = () => mkContext({ mode: "evangelist" });

  it("needs at least two people", () => {
    const film = mkFilm({ seen: { "1": mkSeen({ r: 5.0 }) } });
    expect(evaluateFilm(film, mkContext({ mode: "evangelist", subset: [1] })).ok).toBe(false);
  });

  it("accepts exactly one seer who loved it, scoring the rest", () => {
    const film = mkFilm({ seen: { "1": mkSeen({ r: 4.5 }) } });
    const res = evaluateFilm(film, ctx());
    expect(res.ok).toBe(true);
    expect(res.ann).toMatchObject({ kind: "evangelist", rating: 4.5 });
    if (res.ann?.kind === "evangelist") expect(res.ann.who.id).toBe(zach.id);
    // Aggregates over the others only.
    expect(res.key).toBeCloseTo((0.2 + 0.1) / 2);
  });

  it("holds the seer to their own 75th percentile when higher than 4.0", () => {
    // Colin's p75 is 4.5, so a 4.0 is not evangelism for him.
    const film = mkFilm({ seen: { "2": mkSeen({ r: 4.0 }) } });
    expect(evaluateFilm(film, ctx()).ok).toBe(false);
    const raved = mkFilm({ seen: { "2": mkSeen({ r: 4.5 }) } });
    expect(evaluateFilm(raved, ctx()).ok).toBe(true);
  });

  it("rejects an unrated watch and multiple seers", () => {
    expect(
      evaluateFilm(mkFilm({ seen: { "1": mkSeen() } }), ctx()).ok,
    ).toBe(false);
    expect(
      evaluateFilm(
        mkFilm({ seen: { "1": mkSeen({ r: 5 }), "2": mkSeen({ r: 5 }) } }),
        ctx(),
      ).ok,
    ).toBe(false);
  });

  it("applies the misery floor to the unseen rest", () => {
    const film = mkFilm({
      seen: { "1": mkSeen({ r: 5.0 }) },
      sc: { "2": mkScore({ s: 2.0, c: 0.5 }), "3": mkScore() },
    });
    expect(evaluateFilm(film, ctx()).ok).toBe(false);
  });
});

describe("rewatch", () => {
  const ctx = () => mkContext({ mode: "rewatch" });

  it("needs at least half of tonight's subset to have seen it", () => {
    const film = mkFilm({ seen: { "1": mkSeen({ r: 5.0 }) } });
    expect(evaluateFilm(film, ctx()).ok).toBe(false);
  });

  it("needs the seers to have loved it on their own scales", () => {
    // Zach 4.5 (z=1.5) and Colin 4.0 (z=1.0): mean 1.25 ≥ 0.5 → ok.
    const loved = mkFilm({
      seen: { "1": mkSeen({ r: 4.5 }), "2": mkSeen({ r: 4.0 }) },
    });
    const res = evaluateFilm(loved, ctx());
    expect(res.ok).toBe(true);
    expect(res.ann?.kind).toBe("rewatch");

    // Zach 3.0 (z=0) and Colin 3.5 (z=0): mean 0 < 0.5 → rejected.
    const merelyFine = mkFilm({
      seen: { "1": mkSeen({ r: 3.0 }), "2": mkSeen({ r: 3.5 }) },
    });
    expect(evaluateFilm(merelyFine, ctx()).ok).toBe(false);
  });

  it("blends seers' actual z with non-seers' predicted z", () => {
    const film = mkFilm({
      seen: { "1": mkSeen({ r: 4.0 }), "2": mkSeen({ r: 4.0 }) },
      sc: { "3": mkScore({ z: 0.7 }) },
    });
    const res = evaluateFilm(film, ctx());
    expect(res.ok).toBe(true);
    // zach z=1.0, colin z=1.0, gabe predicted 0.7
    expect(res.key).toBeCloseTo((1.0 + 1.0 + 0.7) / 3);
  });

  it("counts an unrated watch toward the half bar but not the love bar", () => {
    const film = mkFilm({
      seen: { "1": mkSeen({ r: 4.5 }), "2": mkSeen({ r: null }) },
      sc: { "2": mkScore({ z: 0.2 }), "3": mkScore({ z: 0.1 }) },
    });
    const res = evaluateFilm(film, ctx());
    expect(res.ok).toBe(true);
    if (res.ann?.kind === "rewatch") {
      expect(res.ann.seers.map((s) => s.m.id)).toEqual([zach.id]);
    }
  });

  it("rejects when nobody who saw it rated it", () => {
    const film = mkFilm({
      seen: { "1": mkSeen(), "2": mkSeen() },
    });
    expect(evaluateFilm(film, ctx()).ok).toBe(false);
  });
});

describe("subset independence", () => {
  it("changing tonight's subset re-scopes everything", () => {
    // Gabe has seen it; with Gabe out (non-strict) it's a blind-spot candidate.
    const film = mkFilm({ seen: { "3": mkSeen({ r: 3.0 }) } });
    expect(evaluateFilm(film, mkContext()).ok).toBe(false);
    const res = evaluateFilm(film, mkContext({ subset: [1, 2] }));
    expect(res.ok).toBe(true);
    expect(res.key).toBeCloseTo((0.4 + 0.2) / 2);
    expect([zach.id, colin.id, gabe.id]).toEqual([1, 2, 3]);
  });
});
