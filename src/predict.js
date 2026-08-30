(function () {
  "use strict";

  var MIN_PREFIX = 2;
  var DEBOUNCE_MS = 60;
  var TOKEN_RE = /([A-Za-z']+)$/;

  function emptyCurrent() {
    return { el: null, mode: null, tokenStart: 0, token: "", suggestions: [] };
  }
  var current = emptyCurrent();
  var host = null, shadow = null, bar = null;
  var debounceTimer = null;

  function isTextInput(el) {
    if (!el) return false;
    if (el.tagName === "TEXTAREA") return true;
    if (el.tagName === "INPUT") {
      var t = (el.getAttribute("type") || "text").toLowerCase();
      return t === "text" || t === "search" || t === "url" || t === "email" || t === "";
    }
    return false;
  }

  function ensureBar() {
    if (bar) return bar;
    host = document.createElement("div");
    host.setAttribute("data-tl-predict", "1");
    host.style.cssText = "position:fixed;z-index:2147483647;top:0;left:0;display:none;margin:0;padding:0;border:0;";
    shadow = host.attachShadow ? host.attachShadow({ mode: "closed" }) : host;
    bar = document.createElement("div");
    bar.style.cssText = [
      "display:flex", "gap:4px", "align-items:center",
      "background:#181b22", "border:1px solid #2a2e37", "border-radius:8px",
      "padding:4px", "box-shadow:0 4px 14px rgba(0,0,0,.35)",
      "font-family:-apple-system,Segoe UI,Roboto,sans-serif", "font-size:13px"
    ].join(";");
    bar.addEventListener("mousedown", function (e) { e.preventDefault(); });
    shadow.appendChild(bar);
    document.documentElement.appendChild(host);
    return bar;
  }

  function hideBar() {
    if (host) host.style.display = "none";
    current = emptyCurrent();
  }

  function renderBar(el, suggestions) {
    ensureBar();
    while (bar.firstChild) bar.removeChild(bar.firstChild);

    suggestions.forEach(function (word, i) {
      var chip = document.createElement("span");
      chip.textContent = word;
      chip.style.cssText = [
        "display:inline-block", "padding:4px 9px", "cursor:pointer",
        "border-radius:6px", "color:#e8eaed", "white-space:nowrap",
        "background:" + (i === 0 ? "#243b66" : "transparent")
      ].join(";");
      chip.addEventListener("click", function () { accept(word); });
      bar.appendChild(chip);
    });

    var hint = document.createElement("span");
    hint.textContent = "⇥";
    hint.style.cssText = "padding:4px 6px;color:#6b7280;";
    bar.appendChild(hint);

    host.style.display = "block";
    var rect = el.getBoundingClientRect();
    var barW = host.offsetWidth || 120;
    var barH = host.offsetHeight || 30;
    var top = rect.bottom + 4;
    if (top + barH > window.innerHeight) top = rect.top - barH - 4;
    host.style.left = Math.max(4, Math.min(rect.left, window.innerWidth - barW - 4)) + "px";
    host.style.top = Math.max(4, top) + "px";
  }

  function analyze(el) {
    var caret = el.selectionStart;
    if (caret == null) return null;
    var before = el.value.slice(0, caret);
    var wordMatch = before.match(TOKEN_RE);
    if (wordMatch) {
      return { mode: "complete", token: wordMatch[1], start: caret - wordMatch[1].length };
    }
    if (/\s$/.test(before)) {
      var prevMatch = before.replace(/\s+$/, "").match(TOKEN_RE);
      if (prevMatch) return { mode: "next", prev: prevMatch[1].toLowerCase(), start: caret };
    }
    return null;
  }

  function requestSuggestions(el) {
    if (document.activeElement !== el) { hideBar(); return; }
    var a = analyze(el);
    if (!a) { hideBar(); return; }
    if (a.mode === "complete") {
      if (a.token.length < MIN_PREFIX) { hideBar(); return; }
      if (/[A-Z]/.test(a.token.slice(1))) { hideBar(); return; }
      ask({ type: "tl-complete", prefix: a.token, limit: 3 }, el, a);
    } else {
      ask({ type: "tl-next", prev: a.prev, limit: 3 }, el, a);
    }
  }

  function ask(msg, el, a) {
    var pr;
    try { pr = browser.runtime.sendMessage(msg); } catch (e) { return; }
    if (!pr || !pr.then) return;
    pr.then(function (list) {
      if (!Array.isArray(list) || !list.length) { hideBar(); return; }
      if (document.activeElement !== el) { hideBar(); return; }

      var now = analyze(el);
      if (!now || now.mode !== a.mode || now.start !== a.start ||
          (a.mode === "complete" && now.token !== a.token)) { return; }
      if (a.mode === "complete" && a.token[0] === a.token[0].toUpperCase()) {
        list = list.map(function (w) { return w[0].toUpperCase() + w.slice(1); });
      }
      current = { el: el, mode: a.mode, tokenStart: a.start, token: a.token || "", suggestions: list };
      renderBar(el, list);
    }).catch(function () {});
  }

  function nativeSetValue(el, value) {
    var proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    var desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set) desc.set.call(el, value); else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function accept(word) {
    var el = current.el;
    if (!el || !el.isConnected) { hideBar(); return false; }
    var val = el.value;
    var caret = el.selectionStart;
    var newVal, newCaret;

    if (current.mode === "complete") {
      var end = current.tokenStart + current.token.length;

      if (caret !== end || val.slice(current.tokenStart, end) !== current.token) {
        hideBar(); return false;
      }
      var ins = (val[end] === " ") ? word : word + " ";
      newVal = val.slice(0, current.tokenStart) + ins + val.slice(end);
      newCaret = current.tokenStart + ins.length;
    } else {
      var insN = (val[caret] === " ") ? word : word + " ";
      newVal = val.slice(0, caret) + insN + val.slice(caret);
      newCaret = caret + insN.length;
    }

    nativeSetValue(el, newVal);
    try { el.setSelectionRange(newCaret, newCaret); } catch (e) {}

    document.dispatchEvent(new CustomEvent("tl-accept", { detail: { word: word } }));
    hideBar();
    return true;
  }

  document.addEventListener("input", function (e) {
    if (!e.isTrusted) return;
    if (!isTextInput(e.target)) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    var el = e.target;
    debounceTimer = setTimeout(function () { requestSuggestions(el); }, DEBOUNCE_MS);
  }, true);

  document.addEventListener("keydown", function (e) {
    if (!host || host.style.display === "none" || !current.suggestions.length) return;
    if (e.key === "Escape") { hideBar(); return; }
    if (e.key === "Tab" && e.isTrusted) {

      if (accept(current.suggestions[0])) e.preventDefault();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight" ||
               e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "Home" || e.key === "End") {
      hideBar();
    }
  }, true);

  document.addEventListener("blur", function (e) {
    if (isTextInput(e.target)) setTimeout(hideBar, 120);
  }, true);
  window.addEventListener("scroll", hideBar, true);
})();
