import { describe, expect, it } from "vitest";

import { colin, conf, feat, gabe, mkFilm, mkScore, mkSeen, zach } from "./fixtures";
import { confidenceBadge, confidenceNote, reasonFor } from "./reasons";

import type { Evaluation, Member, MemberId } from "./types";

const membersById = new Map<MemberId, Member>([
  [1, zach],
  [2, colin],
  [3, gabe],
]);

const ok: Evaluation = { ok: true, key: 0.5, ann: null, star: 3.9 };

function ctx(subset: MemberId[] = [1, 2, 3]) {
  return { subset, membersById, feat };
}

describe("reasonFor", () => {
  it("narrates the evangelist", () => {
    const res: Evaluation = {
      ...ok,
      ann: { kind: "evangelist", who: colin, rating: 4.5 },
    };
    expect(reasonFor(mkFilm(), res, ctx())).toContain(
      "Colin gave this ★4.5 and nobody else has seen it.",
    );
  });

  it("narrates rewatch raves", () => {
    const res: Evaluation = {
      ...ok,
      ann: {
        kind: "rewatch",
        seers: [
          { m: zach, r: 4.5 },
          { m: colin, r: 4.0 },
        ],
      },
    };
    expect(reasonFor(mkFilm(), res, ctx())).toContain(
      "Zach ★4.5, Colin ★4.0 already love it.",
    );
  });

  it("mentions watchlists", () => {
    const film = mkFilm({ seen: { "1": mkSeen({ w: 0, wl: 1 }) } });
    expect(reasonFor(film, ok, ctx())).toContain("On Zach’s watchlist.");
  });

  it("names the features that pull the pick up, with typed labels", () => {
    const film = mkFilm({
      sc: {
        "1": mkScore({ x: { c: [["kw:heist", 0.4], ["d:Michael Mann", 0.2], ["g:Crime", 0.1]], w: 0.9, pr: 0, q: 0, gt: null } }),
        "2": mkScore({ x: { c: [], w: 0.9, pr: 0, q: 0, gt: null } }),
        "3": mkScore({ x: { c: [], w: 0.9, pr: 0, q: 0, gt: null } }),
      },
    });
    const reason = reasonFor(film, ok, ctx());
    expect(reason).toContain("“heist”");
    expect(reason).toContain("dir. Michael Mann");
    expect(reason).toContain("pull it up for Zach, Colin & Gabe.");
  });

  it("owns up when the prior carries it — thin history vs unexplained taste", () => {
    const film = mkFilm({
      sc: {
        "3": mkScore({ x: { c: [], w: 0.1, pr: 0.4, q: 0.4, gt: null } }),
      },
    });
    const reason = reasonFor(film, ok, ctx([3]));
    expect(reason).toContain("Mostly the group prior — Gabe has few ratings so far.");

    const colinLed = mkFilm({
      sc: {
        "2": mkScore({ x: { c: [], w: 0.2, pr: 0.4, q: 0.4, gt: null } }),
      },
    });
    const colinReason = reasonFor(colinLed, ok, ctx([2]));
    expect(colinReason).toContain(
      "Colin’s ratings don’t track genre and keyword patterns closely.",
    );
  });

  it("flags a drag only next to positives", () => {
    const withPos = mkFilm({
      sc: {
        "1": mkScore({ x: { c: [["g:Drama", 0.3], ["kw:war", -0.2]], w: 0.9, pr: 0, q: 0, gt: null } }),
      },
    });
    expect(reasonFor(withPos, ok, ctx([1]))).toContain("(“war” drags a little.)");

    const onlyNeg = mkFilm({
      sc: {
        "1": mkScore({ x: { c: [["kw:war", -0.2]], w: 0.9, pr: 0, q: 0, gt: null } }),
      },
    });
    expect(reasonFor(onlyNeg, ok, ctx([1]))).not.toContain("drags");
  });
});

describe("confidenceBadge", () => {
  const bctx = (subset: MemberId[] = [1, 2, 3]) => ({ subset, membersById, conf });

  it("flags wildcards for members whose confidence dips on this film", () => {
    const film = mkFilm({
      sc: {
        "1": mkScore({ c: 0.2 }),
        "2": mkScore({ c: 0.6 }),
        "3": mkScore({ c: 0.6 }),
      },
    });
    expect(confidenceBadge(film, bctx())).toEqual({
      kind: "wildcard",
      names: ["Zach"],
    });
  });

  it("never names an always-lowconf member, and lets them block high confidence", () => {
    const film = mkFilm({
      sc: {
        "1": mkScore({ c: 0.9 }),
        "2": mkScore({ c: 0.9 }),
        "3": mkScore({ c: 0.1 }), // Gabe is lowconf everywhere
      },
    });
    expect(confidenceBadge(film, bctx())).toBeNull();
    expect(confidenceBadge(film, bctx([1, 2]))).toEqual({ kind: "high" });
  });

  it("returns nothing when everyone present has seen it", () => {
    const film = mkFilm({
      seen: { "1": mkSeen({ r: 4 }), "2": mkSeen({ r: 4 }) },
    });
    expect(confidenceBadge(film, bctx([1, 2]))).toBeNull();
  });
});

describe("confidenceNote", () => {
  it("splits always-lowconf members into thin and weak histories", () => {
    const weakColin: Member = { ...colin, lowconf: true };
    const map = new Map<MemberId, Member>([
      [1, zach],
      [2, weakColin],
      [3, gabe],
    ]);
    const note = confidenceNote([1, 2, 3], map);
    expect(note?.thin.map((m) => m.name)).toEqual(["Gabe"]);
    expect(note?.weak.map((m) => m.name)).toEqual(["Colin"]);
  });

  it("is absent when nobody is flagged", () => {
    expect(confidenceNote([1, 2], membersById)).toBeNull();
  });
});
