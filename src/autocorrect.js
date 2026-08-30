(function () {
  "use strict";

  var MIN_LEN = 3;
  var MEMORY_MIN_LEN = 6;
  var SPELL_FLUSH_MS = 1500;
  var LEARN_FLUSH_MS = 2500;

  var TOKEN_RE = /([A-Za-z']+)$/;

  var lastCorrection = null;
  var spell = { wordsChecked: 0, misspelledWords: 0, autoCorrections: 0 };
  var flushTimer = null;

  var prevWord = null;
  var learnBatch = [];
  var learnTimer = null;

  function isTextInput(el) {
    if (!el) return false;
    if (el.tagName === "TEXTAREA") return true;
    if (el.tagName === "INPUT") {
      var t = (el.getAttribute("type") || "text").toLowerCase();
      return t === "text" || t === "search" || t === "url" || t === "email" || t === "";
    }
    return false;
  }

  function isTrigger(key) {
    return key === " " || key === "Enter" || /^[.,!?;:]$/.test(key);
  }

  function nativeSetValue(el, value) {
    var proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    var desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function sendReliable(payload, onFail) {
    try {
      var p = browser.runtime.sendMessage(payload);
      if (p && p.catch) p.catch(function () { if (onFail) onFail(); });
    } catch (e) {
      if (onFail) onFail();
    }
  }
  function send(payload) { sendReliable(payload, null); }

  function scheduleSpellFlush() {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(flushSpell, SPELL_FLUSH_MS);
  }
  function flushSpell() {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    if (!(spell.wordsChecked || spell.misspelledWords || spell.autoCorrections)) return;
    var sent = spell;
    spell = { wordsChecked: 0, misspelledWords: 0, autoCorrections: 0 };
    sendReliable(
      {
        type: "tl-stats-delta",
        site: location.hostname || "(local)",
        delta: {
          wordsChecked: sent.wordsChecked,
          misspelledWords: sent.misspelledWords,
          autoCorrections: sent.autoCorrections
        }
      },
      function () {
        spell.wordsChecked += sent.wordsChecked;
        spell.misspelledWords += sent.misspelledWords;
        spell.autoCorrections += sent.autoCorrections;
      }
    );
  }

  function recordFinalWord(finalWord) {
    var w = String(finalWord).toLowerCase();
    if (!/^[a-z']+$/.test(w)) { prevWord = null; return; }
    if (prevWord) {
      learnBatch.push([prevWord, w]);
      if (learnTimer) clearTimeout(learnTimer);
      learnTimer = setTimeout(flushLearn, LEARN_FLUSH_MS);
    }
    prevWord = w;
  }
  function flushLearn() {
    if (learnTimer) { clearTimeout(learnTimer); learnTimer = null; }
    if (!learnBatch.length) return;
    var pairs = learnBatch;
    learnBatch = [];
    sendReliable({ type: "tl-learn", pairs: pairs }, function () {
      learnBatch = pairs.concat(learnBatch);
    });
  }

  function tryUndo(el) {
    var lc = lastCorrection;
    if (!lc || lc.el !== el) { lastCorrection = null; return false; }
    var caret = el.selectionStart;

    if (caret !== lc.expectedCaret) { lastCorrection = null; return false; }
    var val = el.value;
    var correctedEnd = lc.start + lc.corrected.length;
    if (val.slice(lc.start, correctedEnd) !== lc.corrected) { lastCorrection = null; return false; }

    var newVal = val.slice(0, lc.start) + lc.original + val.slice(correctedEnd);
    nativeSetValue(el, newVal);
    var pos = lc.start + lc.original.length;
    try { el.setSelectionRange(pos, pos); } catch (e) {}
    lastCorrection = null;

    document.dispatchEvent(new CustomEvent("tl-undo"));
    return true;
  }

  function onKeyDown(e) {
    var el = e.target;

    if (e.key === "Backspace") {
      if (tryUndo(el)) e.preventDefault();
      return;
    }

    lastCorrection = null;

    if (!isTextInput(el)) return;
    if (!isTrigger(e.key)) return;

    var caret = el.selectionStart;
    if (caret == null) return;
    var before = el.value.slice(0, caret);
    var m = before.match(TOKEN_RE);
    if (!m) { prevWord = null; return; }
    var word = m[1];
    var start = caret - word.length;

    var eligible = word.length >= MIN_LEN &&
      !/[A-Z]/.test(word.slice(1)) &&
      word.indexOf("'") === -1;

    if (!eligible) {
      recordFinalWord(word);
      return;
    }

    var pr;
    try { pr = browser.runtime.sendMessage({ type: "tl-correct", word: word }); }
    catch (err) { recordFinalWord(word); return; }
    if (!pr || !pr.then) { recordFinalWord(word); return; }

    pr.then(function (r) {
      var finalWord = word;
      if (r) {
        spell.wordsChecked++;
        if (r.misspelled) spell.misspelledWords++;

        if (r.correction && r.correction !== word) {

          if (el.value.slice(start, start + word.length) === word) {
            var curCaret = el.selectionStart;
            var val = el.value;
            var newVal = val.slice(0, start) + r.correction + val.slice(start + word.length);
            nativeSetValue(el, newVal);
            var newCaret = curCaret + (r.correction.length - word.length);
            try { el.setSelectionRange(newCaret, newCaret); } catch (e2) {}
            lastCorrection = {
              el: el, start: start, original: word,
              corrected: r.correction, expectedCaret: newCaret
            };
            spell.autoCorrections++;
            finalWord = r.correction;

            if (r.correction.length >= MEMORY_MIN_LEN) {
              send({ type: "tl-misspell", correct: r.correction.toLowerCase(), typo: word.toLowerCase() });
            }
          }
        }
        scheduleSpellFlush();
      }
      recordFinalWord(finalWord);
    }).catch(function () { recordFinalWord(word); });
  }

  function flushAll() { flushSpell(); flushLearn(); }

  document.addEventListener("keydown", onKeyDown, true);

  document.addEventListener("tl-accept", function (e) {
    if (e && e.detail && e.detail.word) recordFinalWord(e.detail.word);
  });

  document.addEventListener("focus", function (e) {
    if (isTextInput(e.target)) prevWord = null;
  }, true);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") flushAll();
  });
  window.addEventListener("pagehide", flushAll);
  window.addEventListener("beforeunload", flushAll);
})();
