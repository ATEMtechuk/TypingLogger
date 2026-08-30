/*
 * content.js — the capture layer.
 *
 * Runs on every page (and every frame). Watches keystrokes in editable fields,
 * counts characters / backspaces / words / active-typing time, and periodically
 * flushes those raw deltas to the background service worker for storage.
 *
 * It records only COUNTS and TIMING — never which characters you type, and
 * never the text itself. Password fields are ignored entirely. (The autocorrect
 * and word-memory features do store some individual words; see README Privacy.)
 */
(function () {
  "use strict";

  var IDLE = (self.TLMetrics && self.TLMetrics.IDLE_THRESHOLD_MS) || 2000;
  var FLUSH_DEBOUNCE_MS = 800;   // flush this long after you stop typing
  var FLUSH_EVERY_EVENTS = 12;   // ...or sooner, once this many keys pile up

  // ---- Rolling delta since the last flush -------------------------------
  function emptyDelta() {
    return { typedChars: 0, backspaces: 0, words: 0, cleanWords: 0, activeMs: 0 };
  }
  var pending = emptyDelta();

  var lastKeyTime = 0;            // timestamp of previous keystroke, for active-time
  var wordLen = 0;               // chars in the word currently being typed
  var wordHadCorrection = false; // did a backspace happen mid-word?
  var flushTimer = null;

  var COUNTER_KEYS = ["typedChars", "backspaces", "words", "cleanWords", "activeMs"];

  // ---- Which elements do we count? --------------------------------------
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

  // ---- Word boundary handling -------------------------------------------
  function finishWord() {
    if (wordLen > 0) {
      pending.words += 1;
      if (!wordHadCorrection) pending.cleanWords += 1;
    }
    wordLen = 0;
    wordHadCorrection = false;
  }

  // ---- The keystroke handler --------------------------------------------
  function onKeyDown(e) {
    if (!isEditable(e.target)) return;

    // Ignore auto-repeat (holding a key) — it isn't real typing throughput.
    if (e.repeat) return;
    // Ignore IME composition keystrokes (they aren't final characters yet).
    if (e.isComposing || e.keyCode === 229) return;

    var key = e.key;

    // A modifier chord (Ctrl+C, Cmd+V, ...) is a shortcut, not typed text.
    // Alt is left allowed so AltGr international characters still count.
    var isShortcut = (e.ctrlKey || e.metaKey) && key !== "Backspace" && key !== "Delete";
    if (isShortcut) return;

    var now = e.timeStamp || performance.now();
    // Accumulate active typing time (ignore long pauses between bursts).
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

    // A single-character key is a produced character (letters, digits,
    // punctuation, space). Multi-char keys (Shift, Enter, Arrow...) are not.
    if (key && key.length === 1) {
      // Count every produced character toward WPM, INCLUDING the space — the
      // "5 characters = 1 word" convention counts spaces.
      pending.typedChars += 1;
      if (key === " ") {
        finishWord();
      } else {
        wordLen += 1;
      }
    } else if (key === "Enter") {
      finishWord();
    }

    // Save promptly once a handful of keys pile up, so the popup reflects your
    // typing almost immediately; otherwise save shortly after you pause.
    if ((pending.typedChars + pending.backspaces) >= FLUSH_EVERY_EVENTS) {
      flush(false);
    } else {
      scheduleFlush();
    }
  }

  // ---- Flushing to the background ---------------------------------------
  function hasData(d) {
    return d.typedChars || d.backspaces || d.words || d.activeMs;
  }

  // closeWord=true only at genuine boundaries (blur/hide/unload); a periodic
  // flush must NOT split the word you're mid-way through typing.
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
      // Context invalidated (extension reloaded): keep the data for next time.
      mergeBack(sent);
    }
  }

  // On a failed send, fold the un-delivered counts back into pending so the
  // next flush carries them (rescues transient failures; a permanently dead
  // context still loses them with the page).
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

  // ---- Cross-script coordination ----------------------------------------
  // autocorrect.js undoes its own correction on Backspace; that Backspace was
  // the user fixing OUR change, not their own typo, so un-count it.
  document.addEventListener("tl-undo", function () {
    if (pending.backspaces > 0) pending.backspaces -= 1;
  });

  // predict.js accepted a suggestion (word + space inserted programmatically,
  // so no keystrokes fired). Count the completed word; the typed prefix (if any)
  // was already counted char-by-char.
  // The accepted word either completes the prefix you were typing (wordLen>0)
  // or is inserted whole (next-word prediction, wordLen==0). Either way it is
  // exactly one completed word — count it once.
  document.addEventListener("tl-accept", function () {
    pending.words += 1;
    if (!(wordLen > 0 && wordHadCorrection)) pending.cleanWords += 1;
    wordLen = 0;
    wordHadCorrection = false;
    scheduleFlush();
  });

  // ---- Wire up ----------------------------------------------------------
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
