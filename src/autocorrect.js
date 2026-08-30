/*
 * autocorrect.js — content-script autocorrect + learning layer.
 *
 * When you finish a word (space / punctuation / Enter) it asks the background
 * corrector whether the word is misspelled and, if so, silently replaces it —
 * phone-style. Pressing Backspace immediately after restores your original.
 * It also (a) reports spelling stats that feed accuracy, (b) remembers longer
 * words you commonly misspell, and (c) teaches the personal next-word model.
 *
 * v1 handles <input> and <textarea>. Rich contenteditable editors (Google
 * Docs, etc.) are left untouched for now.
 */
(function () {
  "use strict";

  var MIN_LEN = 3;             // don't try to correct very short words
  var MEMORY_MIN_LEN = 6;     // only remember longer misspelled words
  var SPELL_FLUSH_MS = 1500;
  var LEARN_FLUSH_MS = 2500;

  // One shared token pattern (apostrophes included) so this file and predict.js
  // segment words identically — captures "don't" and "O'Connor" whole rather
  // than leaving a stray fragment to be mis-corrected.
  var TOKEN_RE = /([A-Za-z']+)$/;

  var lastCorrection = null;  // { el, start, original, corrected, expectedCaret }
  var spell = { wordsChecked: 0, misspelledWords: 0, autoCorrections: 0 };
  var flushTimer = null;

  // Personal next-word learning: the previous final (post-correction) word.
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

  // ---- reliable messaging (restore on failed send) -----------------------
  function sendReliable(payload, onFail) {
    try {
      var p = browser.runtime.sendMessage(payload);
      if (p && p.catch) p.catch(function () { if (onFail) onFail(); });
    } catch (e) {
      if (onFail) onFail();
    }
  }
  function send(payload) { sendReliable(payload, null); }

  // ---- spelling-stat flushing (batched) ----------------------------------
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

  // ---- next-word learning (batched) --------------------------------------
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

  // ---- undo: Backspace right after a correction restores the original ----
  function tryUndo(el) {
    var lc = lastCorrection;
    if (!lc || lc.el !== el) { lastCorrection = null; return false; }
    var caret = el.selectionStart;
    // The caret must be exactly where the correction left it (nothing typed
    // since). This is one past the corrected word + the separator.
    if (caret !== lc.expectedCaret) { lastCorrection = null; return false; }
    var val = el.value;
    var correctedEnd = lc.start + lc.corrected.length;
    if (val.slice(lc.start, correctedEnd) !== lc.corrected) { lastCorrection = null; return false; }

    var newVal = val.slice(0, lc.start) + lc.original + val.slice(correctedEnd);
    nativeSetValue(el, newVal);
    var pos = lc.start + lc.original.length;
    try { el.setSelectionRange(pos, pos); } catch (e) {}
    lastCorrection = null;
    // Tell content.js not to count this Backspace as one of the user's errors —
    // they're undoing OUR change, not fixing their own typo.
    document.dispatchEvent(new CustomEvent("tl-undo"));
    return true;
  }

  function onKeyDown(e) {
    var el = e.target;

    if (e.key === "Backspace") {
      if (tryUndo(el)) e.preventDefault();
      return;
    }
    // Any non-Backspace key closes the undo window.
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

    // Correction eligibility is separate from learning. Skip correction for
    // short words, acronyms/CamelCase, and apostrophe words (contractions are
    // handled by the corrector's typo map; names like O'Connor are left alone).
    var eligible = word.length >= MIN_LEN &&
      !/[A-Z]/.test(word.slice(1)) &&
      word.indexOf("'") === -1;

    if (!eligible) {
      recordFinalWord(word); // still teach the next-word model
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
          // The separator has been inserted by now; only replace if the word
          // still sits exactly where we saw it.
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

  // A prediction was accepted (predict.js): treat its word as the completed
  // final word for the learning model.
  document.addEventListener("tl-accept", function (e) {
    if (e && e.detail && e.detail.word) recordFinalWord(e.detail.word);
  });

  // Reset next-word context when you move to a different field.
  document.addEventListener("focus", function (e) {
    if (isTextInput(e.target)) prevWord = null;
  }, true);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") flushAll();
  });
  window.addEventListener("pagehide", flushAll);
  window.addEventListener("beforeunload", flushAll);
})();
