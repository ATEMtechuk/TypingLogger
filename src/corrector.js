(function (root) {
  "use strict";

  var api = (root.browser || root.chrome);
  var WORDS = null;
  var loadingPromise = null;
  var ALPHA = "abcdefghijklmnopqrstuvwxyz";

  function ensureLoaded() {
    if (WORDS) return Promise.resolve();
    if (loadingPromise) return loadingPromise;
    loadingPromise = (async function () {
      var map = new Map();
      try {
        var url = api.runtime.getURL("data/dict.txt");
        var res = await fetch(url);
        var text = await res.text();
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
        var lines = text.split(/\r?\n/);
        for (var i = 0; i < lines.length; i++) {
          var ln = lines[i];
          if (!ln) continue;
          var sp = ln.indexOf(" ");
          var w = sp < 0 ? ln : ln.slice(0, sp);
          var f = sp < 0 ? 1 : (parseInt(ln.slice(sp + 1), 10) || 1);
          map.set(w, f);
        }
      } catch (e) {

      }
      WORDS = map;
    })();
    return loadingPromise;
  }

  function edits1(word) {
    var res = new Set();
    for (var i = 0; i <= word.length; i++) {
      var L = word.slice(0, i);
      var R = word.slice(i);
      if (R) res.add(L + R.slice(1));
      if (R.length > 1) res.add(L + R[1] + R[0] + R.slice(2));
      for (var c = 0; c < 26; c++) {
        var ch = ALPHA[c];
        if (R) res.add(L + ch + R.slice(1));
        res.add(L + ch + R);
      }
    }
    return res;
  }

  function knownList(iterable) {
    var out = [];
    iterable.forEach(function (w) { if (WORDS.has(w)) out.push(w); });
    return out;
  }

  function bestByFreq(cands) {
    var best = null, bestF = -1;
    for (var i = 0; i < cands.length; i++) {
      var f = WORDS.get(cands[i]) || 0;
      if (f > bestF) { bestF = f; best = cands[i]; }
    }
    return best;
  }

  var CONTRACTIONS = {
    dont: "don't", doesnt: "doesn't", didnt: "didn't", isnt: "isn't",
    wasnt: "wasn't", arent: "aren't", werent: "weren't", havent: "haven't",
    hasnt: "hasn't", hadnt: "hadn't", wouldnt: "wouldn't", couldnt: "couldn't",
    shouldnt: "shouldn't", mustnt: "mustn't",
    youre: "you're", youll: "you'll", youve: "you've", youd: "you'd",
    theyre: "they're", theyll: "they'll", theyve: "they've", theyd: "they'd",
    im: "I'm", ive: "I've",
    weve: "we've", hes: "he's", shes: "she's", thats: "that's",
    whats: "what's", wheres: "where's", theres: "there's", heres: "here's",
    whos: "who's", hows: "how's"
  };

  function correctLower(w) {
    if (WORDS.size === 0) return { misspelled: false, correction: null };
    if (WORDS.has(w)) return { misspelled: false, correction: null };

    if (Object.prototype.hasOwnProperty.call(CONTRACTIONS, w)) {
      return { misspelled: true, correction: CONTRACTIONS[w] };
    }

    var e1 = edits1(w);
    var k1 = knownList(e1);
    if (k1.length) return { misspelled: true, correction: bestByFreq(k1) };

    if (w.length >= 5) {
      var found = new Set();
      e1.forEach(function (x) {
        edits1(x).forEach(function (y) { if (WORDS.has(y)) found.add(y); });
      });
      if (found.size) return { misspelled: true, correction: bestByFreq(Array.from(found)) };
    }
    return { misspelled: true, correction: null };
  }

  function applyCase(original, corrected) {
    if (!corrected) return corrected;
    if (original.length > 1 && original === original.toUpperCase()) {
      return corrected.toUpperCase();
    }
    if (original[0] === original[0].toUpperCase()) {
      return corrected[0].toUpperCase() + corrected.slice(1);
    }
    return corrected;
  }

  var SORTED = null;

  function ensureSorted() {
    if (SORTED) return;
    SORTED = Array.from(WORDS.keys()).sort();
  }

  function lowerBound(arr, key) {
    var lo = 0, hi = arr.length;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (arr[mid] < key) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  async function complete(prefix, limit) {
    await ensureLoaded();
    if (WORDS.size === 0) return [];
    if (!prefix || /[^A-Za-z]/.test(prefix)) return [];
    ensureSorted();
    var p = prefix.toLowerCase();
    var i = lowerBound(SORTED, p);
    var matches = [];
    for (var j = i; j < SORTED.length; j++) {
      var w = SORTED[j];
      if (w.lastIndexOf(p, 0) !== 0) break;
      if (w !== p) matches.push(w);
      if (matches.length > 3000) break;
    }
    matches.sort(function (a, b) { return (WORDS.get(b) || 0) - (WORDS.get(a) || 0); });
    return matches.slice(0, limit || 3);
  }

  async function correct(original) {
    await ensureLoaded();

    if (!original || /[^A-Za-z]/.test(original)) return { misspelled: false, correction: null };
    if (/[A-Z]/.test(original.slice(1))) return { misspelled: false, correction: null };

    var lower = original.toLowerCase();
    var r = correctLower(lower);
    var correction = (r.correction && r.correction !== lower)
      ? applyCase(original, r.correction)
      : null;
    return { misspelled: r.misspelled, correction: correction };
  }

  root.TLCorrector = { correct: correct, complete: complete, ensureLoaded: ensureLoaded };
})(typeof globalThis !== "undefined" ? globalThis : self);
