/* lore client — all filtering/aggregation happens here, on precomputed
   per-member scores shipped in data.js (SCOPING §1: the page feels like an
   app; there is no backend). Vanilla JS on purpose. */
(function () {
  "use strict";
  var D = window.__LORE__;
  var $ = function (id) { return document.getElementById(id); };

  if (!D || !D.members || !D.members.length || !D.films || !D.films.length) {
    $("empty").classList.remove("hidden");
    $("empty").innerHTML =
      "<h2>No scored films yet</h2><p>Run the pipeline: <code>lore all</code> " +
      "(needs a TMDB key in <code>.env</code> — see README).</p>";
    return;
  }

  var LS_KEY = "lore-v1";
  var PAGE = 24;
  var MISERY_STARS = 2.5, MISERY_CONF = 0.2;
  var REWATCH_Z = 0.5, EVANGELIST_MIN = 4.0;

  var LANGS = { en: "English", fr: "French", es: "Spanish", de: "German",
    it: "Italian", ja: "Japanese", ko: "Korean", zh: "Chinese", cn: "Chinese",
    hi: "Hindi", pt: "Portuguese", ru: "Russian", sv: "Swedish", da: "Danish",
    no: "Norwegian", fi: "Finnish", pl: "Polish", tr: "Turkish", fa: "Persian",
    th: "Thai", ar: "Arabic", el: "Greek", he: "Hebrew", hu: "Hungarian",
    cs: "Czech", nl: "Dutch", ro: "Romanian", id: "Indonesian", tl: "Filipino" };
  function langName(c) { return LANGS[c] || (c || "?").toUpperCase(); }

  function canonProvider(name) {
    return name
      .replace(/\s+(standard\s+)?with\s+ads$/i, "")
      .replace(/\s+(amazon|apple\s*tv|roku\s*premium)\s*channel$/i, "")
      .trim();
  }
  function featLabel(f) {
    var i = f.indexOf(":"), kind = f.slice(0, i), name = f.slice(i + 1);
    if (kind === "kw") return "“" + name + "”";
    if (kind === "d") return "dir. " + name;
    if (kind === "l") return langName(name) + "-language";
    if (kind === "rt") return name + " min";
    return name; // genres, cast, decades read fine as-is
  }

  var members = D.members;
  var byId = {};
  members.forEach(function (m) { byId[m.id] = m; });

  // ---------- state ----------
  var state = {
    subset: members.map(function (m) { return m.id; }),
    mode: "blind", agg: "avg_nomisery",
    f: { sv: (D.services_precheck || []).slice(), rent: false, rtmax: 0,
         decades: [], langs: [], xg: [], shorts: false, strict: false }
  };
  try {
    var saved = JSON.parse(localStorage.getItem(LS_KEY) || "null");
    if (saved && saved.subset) {
      saved.subset = saved.subset.filter(function (id) { return byId[id]; });
      if (saved.subset.length) state = Object.assign(state, saved);
    }
  } catch (e) { /* fresh state */ }
  function persist() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {} }

  // ---------- derived catalogs for filter UI ----------
  var allServices = {}, allDecades = {}, allLangs = {}, allGenres = {};
  D.films.forEach(function (f) {
    (f.pv.f || []).forEach(function (p) {
      p = canonProvider(p); allServices[p] = (allServices[p] || 0) + 1;
    });
    if (f.year) { var d = Math.floor(f.year / 10) * 10; allDecades[d] = (allDecades[d] || 0) + 1; }
    if (f.lang) allLangs[f.lang] = (allLangs[f.lang] || 0) + 1;
    f.genres.forEach(function (g) { allGenres[g] = (allGenres[g] || 0) + 1; });
  });
  function topKeys(obj, n) {
    return Object.keys(obj).sort(function (a, b) { return obj[b] - obj[a]; }).slice(0, n);
  }

  // ---------- scoring helpers ----------
  function sc(f, mid) { return f.sc[mid] || f.sc[String(mid)]; }
  function seen(f, mid) {
    var s = f.seen[mid] || f.seen[String(mid)];
    return s && s.w ? s : null;
  }
  function anySeen(f, ids) {
    for (var i = 0; i < ids.length; i++) if (seen(f, ids[i])) return true;
    return false;
  }
  function actualZ(m, r) { return (r - m.mu) / (m.sigma || 0.75); }

  function aggregate(zs) {
    if (!zs.length) return -99;
    if (state.agg === "least_misery") return Math.min.apply(null, zs);
    if (state.agg === "most_pleasure") return Math.max.apply(null, zs);
    var s = 0; zs.forEach(function (z) { s += z; });
    return s / zs.length;
  }

  // ---------- per-mode evaluation ----------
  function evaluate(f) {
    var S = state.subset;
    var res = { ok: false, key: 0, ann: null, star: null };
    var zs = [], i, m, sn, p;

    if (state.mode === "blind") {
      var scope = state.f.strict ? members.map(function (m) { return m.id; }) : S;
      if (anySeen(f, scope)) return res;
      for (i = 0; i < S.length; i++) {
        p = sc(f, S[i]); if (!p) return res;
        if (state.agg === "avg_nomisery" && p.s < MISERY_STARS && p.c >= MISERY_CONF) return res;
        zs.push(p.z);
      }
      res.ok = true; res.key = aggregate(zs);
      res.star = starsFor(S, f);
      return res;
    }

    if (state.mode === "evangelist") {
      if (S.length < 2) return res;
      var seers = S.filter(function (id) { return seen(f, id); });
      if (seers.length !== 1) return res;
      var u = byId[seers[0]], su = seen(f, u.id);
      if (su.r == null || su.r < Math.max(EVANGELIST_MIN, u.p75)) return res;
      var rest = S.filter(function (id) { return id !== u.id; });
      for (i = 0; i < rest.length; i++) {
        p = sc(f, rest[i]); if (!p) return res;
        if (state.agg === "avg_nomisery" && p.s < MISERY_STARS && p.c >= MISERY_CONF) return res;
        zs.push(p.z);
      }
      res.ok = true; res.key = aggregate(zs);
      res.ann = { kind: "evangelist", who: u, rating: su.r };
      res.star = starsFor(rest, f);
      return res;
    }

    // rewatch
    var ratedSeers = [], seerCount = 0;
    for (i = 0; i < S.length; i++) {
      m = byId[S[i]]; sn = seen(f, m.id);
      if (sn) { seerCount++; if (sn.r != null) ratedSeers.push({ m: m, r: sn.r }); }
    }
    if (!seerCount || !ratedSeers.length) return res;
    if (seerCount < Math.ceil(S.length / 2)) return res;
    var zSeen = 0;
    ratedSeers.forEach(function (x) { zSeen += actualZ(x.m, x.r); });
    zSeen /= ratedSeers.length;
    if (zSeen < REWATCH_Z) return res;
    for (i = 0; i < S.length; i++) {
      m = byId[S[i]]; sn = seen(f, m.id);
      if (sn && sn.r != null) zs.push(actualZ(m, sn.r));
      else { p = sc(f, m.id); if (!p) return res; zs.push(p.z); }
    }
    res.ok = true; res.key = aggregate(zs);
    res.ann = { kind: "rewatch", seers: ratedSeers };
    res.star = starsFor(S, f);
    return res;
  }

  function starsFor(ids, f) {
    var s = 0, n = 0;
    ids.forEach(function (id) {
      var sn = seen(f, id);
      if (sn && sn.r != null) { s += sn.r; n++; }
      else { var p = sc(f, id); if (p) { s += p.s; n++; } }
    });
    return n ? s / n : null;
  }

  // ---------- filters ----------
  function passesFilters(f) {
    var fl = state.f;
    if (!fl.shorts && (f.kind === "short" || (f.rt && f.rt < 40))) return false;
    if (fl.rtmax && f.rt && f.rt > fl.rtmax) return false;
    if (fl.decades.length && f.year &&
        fl.decades.indexOf(Math.floor(f.year / 10) * 10) < 0) return false;
    if (fl.decades.length && !f.year) return false;
    if (fl.langs.length && fl.langs.indexOf(f.lang) < 0) return false;
    for (var i = 0; i < fl.xg.length; i++)
      if (f.genres.indexOf(fl.xg[i]) >= 0) return false;
    if (fl.sv.length) {
      var have = (f.pv.f || []).map(canonProvider);
      if (fl.rent) have = have.concat((f.pv.r || []).map(canonProvider));
      var hit = fl.sv.some(function (s) { return have.indexOf(s) >= 0; });
      if (!hit) return false;
    }
    return true;
  }

  // ---------- reasons ----------
  function reason(f, res) {
    var S = state.subset, parts = [];
    if (res.ann && res.ann.kind === "evangelist") {
      parts.push(res.ann.who.name + " gave this ★" + res.ann.rating.toFixed(1) +
        " and nobody else has seen it.");
    }
    if (res.ann && res.ann.kind === "rewatch") {
      parts.push(res.ann.seers.map(function (x) {
        return x.m.name + " ★" + x.r.toFixed(1);
      }).join(", ") + " already " +
        (res.ann.seers.length > 1 ? "love" : "loves") + " it.");
    }
    var wl = S.filter(function (id) {
      var s = f.seen[id] || f.seen[String(id)];
      return s && s.wl;
    }).map(function (id) { return byId[id].name; });
    if (wl.length) parts.push("On " + wl.join(" & ") + "’s watchlist.");

    var merged = {}, unseenNames = [], lowW = [];
    S.forEach(function (id) {
      if (seen(f, id)) return;
      var p = sc(f, id); if (!p) return;
      unseenNames.push(byId[id].name);
      if ((p.x && p.x.w || 0) < 0.3) lowW.push(byId[id].name);
      ((p.x && p.x.c) || []).forEach(function (cv) {
        merged[cv[0]] = (merged[cv[0]] || 0) + cv[1];
      });
    });
    var feats = Object.keys(merged).sort(function (a, b) { return merged[b] - merged[a]; });
    var pos = feats.filter(function (k) { return merged[k] > 0.1; }).slice(0, 3);
    var neg = feats.filter(function (k) { return merged[k] < -0.15; }).slice(-1);
    if (pos.length) {
      var verb = pos.length > 1 ? "pull" : "pulls";
      parts.push(pos.map(featLabel).join(", ") +
        (unseenNames.length ? " " + verb + " it up for " + andList(unseenNames)
                            : " scores well") + ".");
    } else if (unseenNames.length && lowW.length === unseenNames.length) {
      parts.push("Mostly the group prior — " + andList(lowW) + " " +
        (lowW.length > 1 ? "have" : "has") + " few ratings so far.");
    }
    if (neg.length && pos.length) {
      parts.push("(" + featLabel(neg[0]) + " drags a little.)");
    }
    return parts.join(" ");
  }
  function andList(names) {
    if (names.length <= 1) return names[0] || "";
    if (names.length === 2) return names[0] + " & " + names[1];
    return names.slice(0, -1).join(", ") + " & " + names[names.length - 1];
  }

  // ---------- rendering ----------
  var results = [], shown = 0;

  function compute() {
    results = [];
    if (!state.subset.length) return;
    D.films.forEach(function (f) {
      if (!passesFilters(f)) return;
      var res = evaluate(f);
      if (res.ok) results.push({ f: f, res: res });
    });
    results.sort(function (a, b) {
      return b.res.key - a.res.key || (b.f.vc || 0) - (a.f.vc || 0);
    });
  }

  function starStr(v) { return "★" + v.toFixed(1); }

  function card(item) {
    var f = item.f, res = item.res;
    var el = document.createElement("article");
    el.className = "card";
    var lb = f.slug ? "https://letterboxd.com/film/" + f.slug + "/" :
      "https://www.themoviedb.org/movie/" + f.tmdb;

    var posterHtml = f.poster
      ? '<img loading="lazy" alt="" src="https://image.tmdb.org/t/p/w342' + f.poster +
        '" onerror="this.parentNode.classList.add(\'noimg\');this.remove()">'
      : "";
    var meta = [];
    if (f.rt) meta.push(f.rt + " min");
    meta = meta.concat(f.genres.slice(0, 2));
    if (f.lang && f.lang !== "en") meta.push(langName(f.lang));
    if (f.year) meta.push("’" + String(f.year).slice(2));

    var flat = (f.pv.f || []).map(canonProvider);
    flat = flat.filter(function (p, i) { return flat.indexOf(p) === i; });
    var rent = (f.pv.r || []).length;
    var provHtml = flat.length
      ? flat.slice(0, 3).join(" · ")
      : (rent ? "rent only" : "not streaming " + (D.region || ""));

    var chips = state.subset.map(function (id) {
      var m = byId[id], sn = seen(f, id), p = sc(f, id);
      if (sn) {
        return '<span class="chip seen" title="' + m.name + ' has seen it">' +
          esc(m.name[0]) + (sn.r != null ? " " + starStr(sn.r) : " ✓") + "</span>";
      }
      if (!p) return "";
      return '<span class="chip pred" title="predicted for ' + esc(m.name) + '">' +
        esc(m.name[0]) + " " + starStr(p.s) + "</span>";
    }).join("");

    var confs = state.subset
      .filter(function (id) { return !seen(f, id); })
      .map(function (id) { var p = sc(f, id); return p ? { m: byId[id], c: p.c } : null; })
      .filter(Boolean);
    var badge = "";
    if (confs.length) {
      var wild = confs.filter(function (x) { return x.c < 0.25; });
      if (wild.length) {
        badge = '<span class="badge wild" title="low confidence">wildcard for ' +
          esc(wild.map(function (x) { return x.m.name; }).join(", ")) + "</span>";
      } else if (confs.every(function (x) { return x.c >= 0.5; })) {
        badge = '<span class="badge high">high confidence</span>';
      }
    }
    var groupStar = res.star != null
      ? '<span class="gstar" title="group score for tonight’s subset">' +
        starStr(res.star) + "</span>"
      : "";

    el.innerHTML =
      '<a class="poster" href="' + lb + '" target="_blank" rel="noopener">' +
      posterHtml + '<span class="ph">' + esc(f.title || "") + "</span></a>" +
      '<div class="body">' +
      '<h3><a href="' + lb + '" target="_blank" rel="noopener">' + esc(f.title || "?") +
      "</a> <span class='yr'>" + (f.year || "") + "</span></h3>" +
      '<div class="meta">' + esc(meta.join(" · ")) + "</div>" +
      '<div class="prov">' + esc(provHtml) +
      (flat.length || rent ? ' <span class="jw" title="streaming data: JustWatch, via TMDB">JustWatch</span>' : "") +
      "</div>" +
      '<div class="scores">' + groupStar + chips + "</div>" +
      '<div class="reason">' + esc(reason(f, res)) + "</div>" +
      (badge ? '<div class="badges">' + badge + "</div>" : "") +
      "</div>";
    return el;
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function renderMore() {
    var frag = document.createDocumentFragment();
    var next = results.slice(shown, shown + PAGE);
    next.forEach(function (it) { frag.appendChild(card(it)); });
    $("results").appendChild(frag);
    shown += next.length;
    $("more-wrap").classList.toggle("hidden", shown >= results.length);
  }

  function render() {
    compute();
    $("results").innerHTML = "";
    shown = 0;
    var empty = $("empty");
    var hints = {
      blind: "Nobody" + (state.f.strict ? " in the whole group" : " here tonight") +
        " has logged these.",
      evangelist: "Exactly one of tonight’s crew has seen it — and loved it.",
      rewatch: "At least half of tonight’s crew has seen it and rated it high."
    };
    $("mode-hint").textContent = hints[state.mode] + "  ·  " +
      results.length + " candidates";
    if (!state.subset.length) {
      empty.innerHTML = "<h2>Pick at least one person</h2>";
      empty.classList.remove("hidden");
    } else if (!results.length) {
      var why = state.mode === "evangelist" && state.subset.length < 2
        ? "Evangelist mode needs at least two people selected."
        : "Nothing matches — loosen the filters" +
          (state.agg === "avg_nomisery" ? " or switch off the misery floor (plain average)" : "") + ".";
      empty.innerHTML = "<h2>No candidates</h2><p>" + esc(why) + "</p>";
      empty.classList.remove("hidden");
    } else {
      empty.classList.add("hidden");
      renderMore();
    }
    persist();
  }

  // ---------- controls ----------
  function renderMembers() {
    var wrap = $("members");
    wrap.innerHTML = "";
    members.forEach(function (m) {
      var b = document.createElement("button");
      var on = state.subset.indexOf(m.id) >= 0;
      b.className = "mchip" + (on ? " on" : "");
      b.title = m.username + " · " + m.n + " ratings" +
        (m.top && m.top.length ? "\ntaste: " + m.top.join(", ") : "");
      b.textContent = m.name;
      b.onclick = function () {
        var i = state.subset.indexOf(m.id);
        if (i >= 0) state.subset.splice(i, 1); else state.subset.push(m.id);
        renderMembers(); render();
      };
      wrap.appendChild(b);
    });
  }

  function chipGroup(title, values, selected, fmt, onchange, counts) {
    var div = document.createElement("div");
    div.className = "fgroup";
    div.innerHTML = "<h4>" + esc(title) + "</h4>";
    var box = document.createElement("div");
    box.className = "chips";
    values.forEach(function (v) {
      var b = document.createElement("button");
      var on = selected.indexOf(v) >= 0;
      b.className = "fchip" + (on ? " on" : "");
      b.textContent = fmt(v) + (counts ? " " + counts[v] : "");
      b.onclick = function () {
        var i = selected.indexOf(v);
        if (i >= 0) selected.splice(i, 1); else selected.push(v);
        b.classList.toggle("on");
        onchange();
      };
      box.appendChild(b);
    });
    div.appendChild(box);
    return div;
  }

  function toggleRow(label, get, set) {
    var lab = document.createElement("label");
    lab.className = "trow";
    var cb = document.createElement("input");
    cb.type = "checkbox"; cb.checked = get();
    cb.onchange = function () { set(cb.checked); render(); };
    lab.appendChild(cb);
    lab.appendChild(document.createTextNode(" " + label));
    return lab;
  }

  function renderFilters() {
    var fp = $("filters");
    fp.innerHTML = "";
    var fl = state.f;

    fp.appendChild(chipGroup("Streaming on", topKeys(allServices, 14), fl.sv,
      function (v) { return v; }, render, allServices));

    var misc = document.createElement("div");
    misc.className = "fgroup";
    misc.innerHTML = "<h4>Options</h4>";
    misc.appendChild(toggleRow("include rentals",
      function () { return fl.rent; }, function (v) { fl.rent = v; }));
    misc.appendChild(toggleRow("include shorts (<40 min)",
      function () { return fl.shorts; }, function (v) { fl.shorts = v; }));
    misc.appendChild(toggleRow("strict blind spot (whole group, not just tonight)",
      function () { return fl.strict; }, function (v) { fl.strict = v; }));
    var rtLab = document.createElement("label");
    rtLab.className = "trow";
    rtLab.appendChild(document.createTextNode("max runtime "));
    var sel = document.createElement("select");
    [[0, "any"], [90, "≤ 90"], [105, "≤ 105"], [120, "≤ 120"],
     [135, "≤ 135"], [150, "≤ 150"], [180, "≤ 180"]]
      .forEach(function (o) {
        var opt = document.createElement("option");
        opt.value = o[0]; opt.textContent = o[1];
        if (fl.rtmax === o[0]) opt.selected = true;
        sel.appendChild(opt);
      });
    sel.onchange = function () { fl.rtmax = +sel.value; render(); };
    rtLab.appendChild(sel);
    misc.appendChild(rtLab);
    fp.appendChild(misc);

    fp.appendChild(chipGroup("Decades",
      Object.keys(allDecades).map(Number).sort(function (a, b) { return a - b; }),
      fl.decades, function (v) { return v + "s"; }, render));
    fp.appendChild(chipGroup("Languages", topKeys(allLangs, 10), fl.langs,
      langName, render));
    fp.appendChild(chipGroup("Exclude genres", topKeys(allGenres, 99).sort(), fl.xg,
      function (v) { return v; }, render));
  }

  // ---------- wire up ----------
  document.querySelectorAll(".mode").forEach(function (b) {
    if (b.dataset.mode === state.mode) {
      document.querySelectorAll(".mode").forEach(function (x) { x.classList.remove("active"); });
      b.classList.add("active");
    }
    b.onclick = function () {
      state.mode = b.dataset.mode;
      document.querySelectorAll(".mode").forEach(function (x) { x.classList.remove("active"); });
      b.classList.add("active");
      render();
    };
  });
  $("agg").value = state.agg;
  $("agg").onchange = function () { state.agg = $("agg").value; render(); };
  $("filters-toggle").onclick = function () {
    $("filters").classList.toggle("hidden");
  };
  $("more").onclick = renderMore;
  if (D.veto && D.veto.length) {
    $("veto-note").textContent = D.veto.length + " film" +
      (D.veto.length > 1 ? "s" : "") + " vetoed (see veto.yaml): " +
      D.veto.map(function (v) { return v.title; }).join(", ");
  }

  renderMembers();
  renderFilters();
  render();
})();
