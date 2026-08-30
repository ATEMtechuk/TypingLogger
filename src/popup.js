(function () {
  "use strict";
  var M = self.TLMetrics;

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }

  function fmt(n) {
    return Math.round(n).toLocaleString();
  }

  function render(store) {
    var daily = store.daily || {};
    var today = daily[todayKey()] || {};

    document.getElementById("wpm").textContent = fmt(M.computeWPM(today.typedChars || 0, today.activeMs || 0));
    document.getElementById("acc").textContent =
      fmt(M.computeSpellingAccuracy(today.wordsChecked || 0, today.misspelledWords || 0)) + "%";
    document.getElementById("words").textContent = fmt(today.words || 0);
    document.getElementById("chars").textContent = fmt(today.typedChars || 0);

    var keyAcc = fmt(M.computeAccuracy(today.typedChars || 0, today.backspaces || 0));
    document.getElementById("detail").textContent =
      "Keystroke accuracy " + keyAcc + "% · " + fmt(today.autoCorrections || 0) + " autocorrections today";

    var life = store.lifetime || {};
    var lifeWpm = fmt(M.computeWPM(life.typedChars || 0, life.activeMs || 0));
    var lifeAcc = fmt(M.computeSpellingAccuracy(life.wordsChecked || 0, life.misspelledWords || 0));
    document.getElementById("lifetime").textContent =
      "All-time: " + fmt(life.words || 0) + " words · " + lifeWpm + " avg WPM · " + lifeAcc + "% spelling";
  }

  browser.storage.local.get(["daily", "lifetime"]).then(render);

  document.getElementById("open").addEventListener("click", function () {
    if (browser.runtime.openOptionsPage) browser.runtime.openOptionsPage();
    else window.open(browser.runtime.getURL("src/dashboard.html"));
  });

  document.getElementById("reset").addEventListener("click", function () {
    if (!confirm("Erase all typing stats? This cannot be undone.")) return;
    browser.runtime.sendMessage({ type: "tl-reset" })
      .catch(function () {})
      .then(function () {
        browser.storage.local.get(["daily", "lifetime"]).then(render);
      });
  });
})();
