/*
 * metrics.js — shared typing math, used by the content script (live counting)
 * and by the popup / dashboard (rendering stored totals).
 *
 * Design principle: we STORE only additive raw counters
 * (typedChars, backspaces, words, cleanWords, activeMs) and DERIVE
 * WPM / accuracy at read time. That keeps aggregation trivial and lets us
 * change the formulas later without migrating stored data.
 */
(function (root) {
  "use strict";

  // A keystroke gap longer than this is treated as a pause, not typing,
  // so idle time between bursts doesn't drag your WPM down.
  var IDLE_THRESHOLD_MS = 2000;

  /**
   * Words Per Minute, the standard "5 characters = 1 word" convention that
   * typing tests use, measured over ACTIVE typing time only.
   */
  function computeWPM(typedChars, activeMs) {
    if (!activeMs || activeMs <= 0) return 0;
    var minutes = activeMs / 60000;
    if (minutes <= 0) return 0;
    return (typedChars / 5) / minutes;
  }

  /**
   * Accuracy, character-level — the same correct/total method typing websites
   * use, with backspaces standing in for "wrong keystrokes" since in free
   * typing your own corrections are the signal that a character was wrong.
   *
   *   accuracy = (typedChars - backspaces) / typedChars
   *
   * Returns a percentage 0..100. Clamped so heavy re-editing can't go negative.
   */
  function computeAccuracy(typedChars, backspaces) {
    if (!typedChars || typedChars <= 0) return 100;
    var correct = typedChars - backspaces;
    if (correct < 0) correct = 0;
    return (correct / typedChars) * 100;
  }

  /**
   * Secondary, word-level accuracy: share of words typed without any mid-word
   * correction. Complements the character metric on the dashboard.
   */
  function computeWordAccuracy(words, cleanWords) {
    if (!words || words <= 0) return 100;
    return (cleanWords / words) * 100;
  }

  /**
   * Spelling accuracy — share of checked words that were spelled correctly,
   * as judged against the dictionary (independent of whether you backspaced).
   * This is what catches typos you leave in without fixing.
   *
   *   spellingAccuracy = (wordsChecked - misspelledWords) / wordsChecked
   */
  function computeSpellingAccuracy(wordsChecked, misspelledWords) {
    if (!wordsChecked || wordsChecked <= 0) return 100;
    var correct = wordsChecked - misspelledWords;
    if (correct < 0) correct = 0;
    return (correct / wordsChecked) * 100;
  }

  var API = {
    IDLE_THRESHOLD_MS: IDLE_THRESHOLD_MS,
    computeWPM: computeWPM,
    computeAccuracy: computeAccuracy,
    computeWordAccuracy: computeWordAccuracy,
    computeSpellingAccuracy: computeSpellingAccuracy
  };

  // Expose as a global for content scripts and <script>-included pages.
  root.TLMetrics = API;
  // And support module import if we ever bundle.
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof globalThis !== "undefined" ? globalThis : self);
