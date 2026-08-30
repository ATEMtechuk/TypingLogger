(function () {
  "use strict";

  var IDLE = (self.TLMetrics && self.TLMetrics.IDLE_THRESHOLD_MS) || 2000;
  var FLUSH_DEBOUNCE_MS = 800;
  var FLUSH_EVERY_EVENTS = 12;

  function emptyDelta() {
    return { typedChars: 0, backspaces: 0, words: 0, cleanWords: 0, activeMs: 0 };
  }
  var pending = emptyDelta();

  var lastKeyTime = 0;
  var wordLen = 0;
  var wordHadCorrection = false;
  var flushTimer = null;

  var COUNTER_KEYS = ["typedChars", "backspaces", "words", "cleanWords", "activeMs"];

  var IGNORED_INPUT_TYPES = {
    password: true, hidden: true, checkbox: true, radio: true,
    button: true, submit: true, reset: true, file: true, range: true,
    color: true, date: true, "datetime-local": true, month: true,
    week: true, time: true, image: true
  };

  function isEditable(el) {
    if (!el) return false;
    var tag = el.tagName;
    if (tag === "TEXTAREA") return true;
    if (tag === "INPUT") {
      var type = (el.getAttribute("type") || "text").toLowerCase();
      return !IGNORED_INPUT_TYPES[type];
    }
    if (el.isContentEditable) return true;
    return false;
  }

  function finishWord() {
    if (wordLen > 0) {
      pending.words += 1;
      if (!wordHadCorrection) pending.cleanWords += 1;
    }
    wordLen = 0;
    wordHadCorrection = false;
  }

  function onKeyDown(e) {
    if (!isEditable(e.target)) return;

    if (e.repeat) return;

    if (e.isComposing || e.keyCode === 229) return;

    var key = e.key;

    var isShortcut = (e.ctrlKey || e.metaKey) && key !== "Backspace" && key !== "Delete";
    if (isShortcut) return;

    var now = e.timeStamp || performance.now();

    if (lastKeyTime > 0) {
      var gap = now - lastKeyTime;
      if (gap > 0 && gap < IDLE) pending.activeMs += gap;
    }
    lastKeyTime = now;

    if (key === "Backspace" || key === "Delete") {
      pending.backspaces += 1;
      wordHadCorrection = true;
      if (wordLen > 0) wordLen -= 1;
      scheduleFlush();
      return;
    }

    if (key && key.length === 1) {

      pending.typedChars += 1;
      if (key === " ") {
        finishWord();
      } else {
        wordLen += 1;
      }
    } else if (key === "Enter") {
      finishWord();
    }

    if ((pending.typedChars + pending.backspaces) >= FLUSH_EVERY_EVENTS) {
      flush(false);
    } else {
      scheduleFlush();
    }
  }

  function hasData(d) {
    return d.typedChars || d.backspaces || d.words || d.activeMs;
  }

  function flush(closeWord) {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    if (closeWord) finishWord();
    if (!hasData(pending)) return;

    var sent = pending;
    pending = emptyDelta();

    var payload = { type: "tl-stats-delta", site: location.hostname || "(local)", delta: sent };
    try {
      var p = browser.runtime.sendMessage(payload);
      if (p && p.catch) p.catch(function () { mergeBack(sent); });
    } catch (err) {

      mergeBack(sent);
    }
  }

  function mergeBack(sent) {
    for (var i = 0; i < COUNTER_KEYS.length; i++) {
      var k = COUNTER_KEYS[i];
      pending[k] += sent[k] || 0;
    }
  }

  function scheduleFlush() {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(function () { flush(false); }, FLUSH_DEBOUNCE_MS);
  }

  document.addEventListener("tl-undo", function () {
    if (pending.backspaces > 0) pending.backspaces -= 1;
  });

  document.addEventListener("tl-accept", function () {
    pending.words += 1;
    if (!(wordLen > 0 && wordHadCorrection)) pending.cleanWords += 1;
    wordLen = 0;
    wordHadCorrection = false;
    scheduleFlush();
  });

  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("blur", function (e) {
    if (isEditable(e.target)) flush(true);
  }, true);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") flush(true);
  });
  window.addEventListener("pagehide", function () { flush(true); });
  window.addEventListener("beforeunload", function () { flush(true); });
})();
