(function (root) {
  "use strict";

  var IDLE_THRESHOLD_MS = 2000;

  function computeWPM(typedChars, activeMs) {
    if (!activeMs || activeMs <= 0) return 0;
    var minutes = activeMs / 60000;
    if (minutes <= 0) return 0;
    return (typedChars / 5) / minutes;
  }

  function computeAccuracy(typedChars, backspaces) {
    if (!typedChars || typedChars <= 0) return 100;
    var correct = typedChars - backspaces;
    if (correct < 0) correct = 0;
    return (correct / typedChars) * 100;
  }

  function computeWordAccuracy(words, cleanWords) {
    if (!words || words <= 0) return 100;
    return (cleanWords / words) * 100;
  }

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

  root.TLMetrics = API;

  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof globalThis !== "undefined" ? globalThis : self);
