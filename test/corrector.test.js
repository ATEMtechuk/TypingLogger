"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const dictText = fs.readFileSync(path.join(__dirname, "..", "data", "dict.txt"), "utf8");
globalThis.chrome = { runtime: { getURL: (p) => p } };
globalThis.fetch = async () => ({ text: async () => dictText });
require("../src/corrector.js");
const C = globalThis.TLCorrector;

test("common typos are corrected", async () => {
  const cases = {
    teh: "the", recieve: "receive", seperate: "separate",
    definately: "definitely", tommorow: "tomorrow"
  };
  for (const [typo, want] of Object.entries(cases)) {
    const r = await C.correct(typo);
    assert.strictEqual(r.correction, want, `${typo} -> ${want}`);
  }
});

test("apostrophe-less contractions map correctly (not to 'done')", async () => {
  const r = await C.correct("dont");
  assert.strictEqual(r.correction, "don't");
  const r2 = await C.correct("youre");
  assert.strictEqual(r2.correction, "you're");
});

test("correctly spelled words are left alone", async () => {
  for (const w of ["the", "hello", "because", "keyboard"]) {
    const r = await C.correct(w);
    assert.strictEqual(r.misspelled, false, `${w} should not be misspelled`);
    assert.strictEqual(r.correction, null);
  }
});

test("valid words that resemble contractions are not touched", async () => {
  for (const w of ["its", "were", "cant", "wont"]) {
    const r = await C.correct(w);
    assert.strictEqual(r.correction, null, `${w} must stay as typed`);
  }
});

test("case is preserved on correction", async () => {
  const r = await C.correct("Teh");
  assert.strictEqual(r.correction, "The");
});

test("acronyms / CamelCase are skipped", async () => {
  for (const w of ["NASA", "iPhone", "JavaScript"]) {
    const r = await C.correct(w);
    assert.strictEqual(r.correction, null, `${w} must be skipped`);
  }
});

test("completion returns frequency-ranked words for a prefix", async () => {
  const list = await C.complete("nec", 3);
  assert.ok(list.includes("necessary"), "expected 'necessary' among completions");
  assert.ok(list.length <= 3);
});
