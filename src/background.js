if (typeof importScripts === "function") {
  if (typeof browser === "undefined") importScripts("../lib/browser-polyfill.min.js");
  if (typeof TLCorrector === "undefined") importScripts("./corrector.js");
}

const COUNTERS = [
  "typedChars", "backspaces", "words", "cleanWords", "activeMs",
  "wordsChecked", "misspelledWords", "autoCorrections"
];
const MAX_DAYS = 730;
const MAX_BIGRAM_KEYS = 8000;
const MAX_NEXTS_PER_WORD = 12;
const MAX_MISSPELLINGS = 500;

function emptyCounters() {
  const o = {};
  for (const k of COUNTERS) o[k] = 0;
  return o;
}
function addInto(target, delta) {
  for (const k of COUNTERS) target[k] = (target[k] || 0) + (delta[k] || 0);
}

function dateKey(ms) {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

let writeChain = Promise.resolve();
function serialize(fn) {
  const run = writeChain.then(fn, fn);
  writeChain = run.then(() => {}, () => {});
  return run;
}

function pruneDaily(daily) {
  const keys = Object.keys(daily);
  if (keys.length <= MAX_DAYS) return daily;
  keys.sort();
  for (let i = 0; i < keys.length - MAX_DAYS; i++) delete daily[keys[i]];
  return daily;
}

function recordDelta(site, delta) {
  return serialize(async () => {
    const store = await browser.storage.local.get(["daily", "lifetime", "firstSeen"]);
    const daily = store.daily || {};
    const lifetime = store.lifetime || emptyCounters();
    const firstSeen = store.firstSeen || Date.now();

    const key = dateKey(Date.now());
    if (!daily[key]) daily[key] = Object.assign(emptyCounters(), { bySite: {} });
    const dayBucket = daily[key];
    if (!dayBucket.bySite) dayBucket.bySite = {};
    if (!dayBucket.bySite[site]) dayBucket.bySite[site] = emptyCounters();

    addInto(dayBucket, delta);
    addInto(dayBucket.bySite[site], delta);
    addInto(lifetime, delta);
    pruneDaily(daily);

    await browser.storage.local.set({ daily, lifetime, firstSeen });
  });
}

let bigramCache = null;
let bigramSaveTimer = null;

async function loadBigrams() {
  if (bigramCache) return bigramCache;
  const s = await browser.storage.local.get(["bigrams"]);
  bigramCache = s.bigrams || {};
  return bigramCache;
}
function scheduleBigramSave() {
  if (bigramSaveTimer) return;
  bigramSaveTimer = setTimeout(() => {
    bigramSaveTimer = null;
    serialize(() => browser.storage.local.set({ bigrams: bigramCache || {} }));
  }, 1500);
}

function learnPairs(pairs) {
  return serialize(async () => {
    const bg = await loadBigrams();
    for (const pair of pairs) {
      const prev = pair[0], next = pair[1];
      if (!prev || !next) continue;
      if (!bg[prev]) bg[prev] = {};
      bg[prev][next] = (bg[prev][next] || 0) + 1;
      const keys = Object.keys(bg[prev]);
      if (keys.length > MAX_NEXTS_PER_WORD) {
        keys.sort((a, b) => bg[prev][b] - bg[prev][a]);
        const trimmed = {};
        for (let i = 0; i < MAX_NEXTS_PER_WORD; i++) trimmed[keys[i]] = bg[prev][keys[i]];
        bg[prev] = trimmed;
      }
    }

    const allKeys = Object.keys(bg);
    if (allKeys.length > MAX_BIGRAM_KEYS) {
      for (let i = 0; i < allKeys.length - MAX_BIGRAM_KEYS; i++) delete bg[allKeys[i]];
    }
    scheduleBigramSave();
  });
}

async function getNextWords(prev, limit) {
  const bg = await loadBigrams();
  const set = bg[prev];
  if (!set) return [];
  return Object.keys(set).sort((a, b) => set[b] - set[a]).slice(0, limit || 3);
}

function recordMisspelling(correct, typo) {
  return serialize(async () => {
    const s = await browser.storage.local.get(["misspellings"]);
    const m = s.misspellings || {};
    if (!m[correct]) m[correct] = { count: 0, typos: {}, lastSeen: 0 };
    m[correct].count += 1;
    m[correct].lastSeen = Date.now();
    if (typo) m[correct].typos[typo] = (m[correct].typos[typo] || 0) + 1;

    const keys = Object.keys(m);
    if (keys.length > MAX_MISSPELLINGS) {
      keys.sort((a, b) => m[b].count - m[a].count);
      const trimmed = {};
      for (let i = 0; i < MAX_MISSPELLINGS; i++) trimmed[keys[i]] = m[keys[i]];
      await browser.storage.local.set({ misspellings: trimmed });
      return;
    }
    await browser.storage.local.set({ misspellings: m });
  });
}

browser.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "tl-correct" && typeof msg.word === "string") {
    return TLCorrector.correct(msg.word);
  }
  if (msg && msg.type === "tl-complete" && typeof msg.prefix === "string") {
    return TLCorrector.complete(msg.prefix, msg.limit || 3);
  }
  if (msg && msg.type === "tl-next" && typeof msg.prev === "string") {
    return getNextWords(msg.prev, msg.limit || 3);
  }
  if (msg && msg.type === "tl-learn" && Array.isArray(msg.pairs)) {
    return learnPairs(msg.pairs).then(() => ({ ok: true }));
  }
  if (msg && msg.type === "tl-misspell" && typeof msg.correct === "string") {
    return recordMisspelling(msg.correct, msg.typo || "").then(() => ({ ok: true }));
  }
  if (msg && msg.type === "tl-stats-delta" && msg.delta) {
    return recordDelta(msg.site || "(unknown)", msg.delta).then(() => ({ ok: true }));
  }
  if (msg && msg.type === "tl-reset") {
    bigramCache = {};
    return serialize(() => browser.storage.local.set({
      daily: {}, lifetime: emptyCounters(), bigrams: {}, misspellings: {}, firstSeen: Date.now()
    })).then(() => ({ ok: true }));
  }

});
