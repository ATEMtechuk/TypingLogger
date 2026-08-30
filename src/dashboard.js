/*
 * dashboard.js — reads stored daily rollups and draws the graphs.
 * Uses a tiny hand-rolled canvas line-chart renderer so the extension has
 * zero external dependencies (Chrome blocks remote scripts anyway).
 */
(function () {
  "use strict";
  var M = self.TLMetrics;

  var COLORS = {
    accent: "#5b9dff",
    good: "#46c98b",
    grid: "#262a33",
    text: "#9aa0aa"
  };

  function fmt(n) { return Math.round(n).toLocaleString(); }

  function sortedDays(daily) {
    return Object.keys(daily).sort(); // ISO date strings sort chronologically
  }

  // ---- Minimal responsive line chart -----------------------------------
  var CHART_H = 220; // fixed logical height (never read back from the canvas)

  function drawLineChart(canvas, labels, values, color, opts) {
    opts = opts || {};
    var dpr = window.devicePixelRatio || 1;
    // Logical CSS size, pinned explicitly so the backing-store scaling can't
    // compound across resizes on HiDPI displays.
    var cssW = canvas.clientWidth || 800;
    var cssH = CHART_H;
    canvas.style.height = cssH + "px";
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    var padL = 40, padR = 12, padT = 12, padB = 26;
    var plotW = cssW - padL - padR;
    var plotH = cssH - padT - padB;

    var maxV = opts.max != null ? opts.max : Math.max.apply(null, values.concat([1]));
    var minV = opts.min != null ? opts.min : 0;
    if (maxV === minV) maxV = minV + 1;

    // Y gridlines + labels (4 steps)
    ctx.font = "10px -apple-system, Segoe UI, sans-serif";
    ctx.fillStyle = COLORS.text;
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (var i = 0; i <= 4; i++) {
      var yv = minV + (maxV - minV) * (i / 4);
      var y = padT + plotH - (plotH * (i / 4));
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
      ctx.fillText(Math.round(yv), 6, y + 3);
    }

    if (values.length === 0) return;

    function xAt(idx) {
      if (values.length === 1) return padL + plotW / 2;
      return padL + plotW * (idx / (values.length - 1));
    }
    function yAt(v) {
      return padT + plotH - plotH * ((v - minV) / (maxV - minV));
    }

    // Area fill
    ctx.beginPath();
    ctx.moveTo(xAt(0), yAt(values[0]));
    for (var j = 1; j < values.length; j++) ctx.lineTo(xAt(j), yAt(values[j]));
    ctx.lineTo(xAt(values.length - 1), padT + plotH);
    ctx.lineTo(xAt(0), padT + plotH);
    ctx.closePath();
    ctx.fillStyle = hexA(color, 0.12);
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.moveTo(xAt(0), yAt(values[0]));
    for (var k = 1; k < values.length; k++) ctx.lineTo(xAt(k), yAt(values[k]));
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Points
    ctx.fillStyle = color;
    for (var p = 0; p < values.length; p++) {
      ctx.beginPath();
      ctx.arc(xAt(p), yAt(values[p]), 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // X labels: first, middle, last (avoid clutter)
    ctx.fillStyle = COLORS.text;
    var idxs = values.length <= 3
      ? values.map(function (_, ix) { return ix; })
      : [0, Math.floor((values.length - 1) / 2), values.length - 1];
    idxs.forEach(function (ix) {
      var lbl = (labels[ix] || "").slice(5); // MM-DD
      ctx.fillText(lbl, xAt(ix) - 12, padT + plotH + 16);
    });
  }

  function hexA(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }

  // ---- Render ------------------------------------------------------------
  function render(store) {
    var daily = store.daily || {};
    var life = store.lifetime || {};
    var days = sortedDays(daily);

    // Summary tiles
    document.getElementById("t-wpm").textContent = fmt(M.computeWPM(life.typedChars || 0, life.activeMs || 0));
    document.getElementById("t-acc").textContent =
      fmt(M.computeSpellingAccuracy(life.wordsChecked || 0, life.misspelledWords || 0)) + "%";
    document.getElementById("t-words").textContent = fmt(life.words || 0);
    document.getElementById("t-days").textContent = days.length;

    if (days.length) {
      document.getElementById("range").textContent =
        "Tracking since " + days[0] + " · " + days.length + " day" + (days.length > 1 ? "s" : "") +
        " · " + fmt(life.autoCorrections || 0) + " autocorrections";
    }

    // Per-day series
    var wpmSeries = days.map(function (d) { return M.computeWPM(daily[d].typedChars || 0, daily[d].activeMs || 0); });
    var accSeries = days.map(function (d) { return M.computeSpellingAccuracy(daily[d].wordsChecked || 0, daily[d].misspelledWords || 0); });

    drawLineChart(document.getElementById("chart-wpm"), days, wpmSeries, COLORS.accent, {});
    drawLineChart(document.getElementById("chart-acc"), days, accSeries, COLORS.good, { min: 0, max: 100 });

    // Per-site table (aggregate across all days)
    var siteCounters = ["typedChars", "backspaces", "words", "activeMs", "wordsChecked", "misspelledWords"];
    var sites = {};
    days.forEach(function (d) {
      var bs = daily[d].bySite || {};
      Object.keys(bs).forEach(function (host) {
        if (!sites[host]) {
          sites[host] = { typedChars: 0, backspaces: 0, words: 0, activeMs: 0, wordsChecked: 0, misspelledWords: 0 };
        }
        siteCounters.forEach(function (c) { sites[host][c] += bs[host][c] || 0; });
      });
    });
    var rows = Object.keys(sites)
      .map(function (h) { return { host: h, s: sites[h] }; })
      .sort(function (a, b) { return b.s.words - a.s.words; })
      .slice(0, 15);

    var tbody = document.querySelector("#sites tbody");
    while (tbody.firstChild) tbody.removeChild(tbody.firstChild);

    if (rows.length === 0) {
      document.getElementById("sites-empty").style.display = "block";
    } else {
      rows.forEach(function (r) {
        var tr = document.createElement("tr");
        appendCell(tr, r.host, false);
        appendCell(tr, fmt(r.s.words), true);
        appendCell(tr, fmt(M.computeWPM(r.s.typedChars, r.s.activeMs)), true);
        appendCell(tr, fmt(M.computeSpellingAccuracy(r.s.wordsChecked, r.s.misspelledWords)) + "%", true);
        tbody.appendChild(tr);
      });
    }
  }

  // Build cells with textContent so untrusted site hostnames can never inject
  // markup (also keeps the linter happy — no innerHTML).
  function appendCell(tr, text, numeric) {
    var td = document.createElement("td");
    if (numeric) td.className = "n";
    td.textContent = text;
    tr.appendChild(td);
  }

  // ---- "Words you often misspell" + on-demand definitions ---------------
  function topTypo(typos) {
    var best = null, bestC = -1;
    Object.keys(typos || {}).forEach(function (t) {
      if (typos[t] > bestC) { bestC = typos[t]; best = t; }
    });
    return best;
  }

  function renderMisspellings(misspellings) {
    var m = misspellings || {};
    var rows = Object.keys(m)
      .map(function (w) { return { word: w, info: m[w] }; })
      .sort(function (a, b) { return b.info.count - a.info.count; })
      .slice(0, 30);

    var tbody = document.querySelector("#misspell tbody");
    while (tbody.firstChild) tbody.removeChild(tbody.firstChild);

    if (!rows.length) {
      document.getElementById("misspell-empty").style.display = "block";
      return;
    }
    document.getElementById("misspell-empty").style.display = "none";

    rows.forEach(function (r) {
      var tr = document.createElement("tr");
      appendCell(tr, r.word, false);
      appendCell(tr, fmt(r.info.count), true);
      var typoTd = document.createElement("td");
      typoTd.className = "typo";
      typoTd.textContent = topTypo(r.info.typos) || "—";
      tr.appendChild(typoTd);

      var btnTd = document.createElement("td");
      btnTd.className = "n";
      var btn = document.createElement("button");
      btn.className = "define-btn";
      btn.textContent = "Define";
      btn.addEventListener("click", function () { toggleDefinition(r.word, tr, btn); });
      btnTd.appendChild(btn);
      tr.appendChild(btnTd);

      tbody.appendChild(tr);
    });
  }

  function toggleDefinition(word, tr, btn) {
    var existing = tr.nextSibling;
    if (existing && existing.classList && existing.classList.contains("def-row")) {
      existing.parentNode.removeChild(existing);
      btn.textContent = "Define";
      return;
    }
    btn.textContent = "Hide";
    var defRow = document.createElement("tr");
    defRow.className = "def-row";
    var td = document.createElement("td");
    td.colSpan = 4;
    td.textContent = "Loading…";
    defRow.appendChild(td);
    tr.parentNode.insertBefore(defRow, tr.nextSibling);

    fetchDefinition(word).then(function (defs) {
      while (td.firstChild) td.removeChild(td.firstChild);
      if (!defs || !defs.length) { td.textContent = "No definition found."; return; }
      defs.slice(0, 3).forEach(function (d) {
        var line = document.createElement("div");
        var pos = document.createElement("span");
        pos.className = "pos";
        pos.textContent = d.pos || "";
        line.appendChild(pos);
        line.appendChild(document.createTextNode(d.text));
        td.appendChild(line);
      });
    }).catch(function () {
      while (td.firstChild) td.removeChild(td.firstChild);
      td.textContent = "Couldn't load definition (offline?).";
    });
  }

  function fetchDefinition(word) {
    var url = "https://api.dictionaryapi.dev/api/v2/entries/en/" + encodeURIComponent(word);
    return fetch(url).then(function (res) {
      if (!res.ok) return [];
      return res.json();
    }).then(function (data) {
      var out = [];
      if (!Array.isArray(data)) return out;
      data.forEach(function (entry) {
        (entry.meanings || []).forEach(function (mean) {
          (mean.definitions || []).forEach(function (def) {
            if (def.definition) out.push({ pos: mean.partOfSpeech, text: def.definition });
          });
        });
      });
      return out;
    });
  }

  var lastStore = null;
  function loadAll() {
    browser.storage.local.get(["daily", "lifetime", "misspellings"]).then(function (store) {
      lastStore = store;
      render(store);
      renderMisspellings(store.misspellings);
    });
  }

  loadAll();

  // On resize, redraw only the charts/tiles (debounced) so any open definition
  // rows in the misspellings table are preserved.
  var resizeTimer = null;
  window.addEventListener("resize", function () {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (lastStore) render(lastStore);
    }, 150);
  });
})();
