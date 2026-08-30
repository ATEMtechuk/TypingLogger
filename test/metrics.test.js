"use strict";
const test = require("node:test");
const assert = require("node:assert");
const M = require("../src/metrics.js");

test("WPM: 300 chars in 1 min = 60 wpm", () => {
  assert.strictEqual(M.computeWPM(300, 60000), 60);
});
test("WPM: scales with time", () => {
  assert.strictEqual(M.computeWPM(300, 30000), 120);
});
test("WPM: no active time -> 0", () => {
  assert.strictEqual(M.computeWPM(300, 0), 0);
});

test("accuracy: perfect typing = 100%", () => {
  assert.strictEqual(M.computeAccuracy(100, 0), 100);
});
test("accuracy: 5 backspaces of 100 chars = 95%", () => {
  assert.strictEqual(M.computeAccuracy(100, 5), 95);
});
test("accuracy: empty input defaults to 100%", () => {
  assert.strictEqual(M.computeAccuracy(0, 0), 100);
});
test("accuracy: never negative", () => {
  assert.strictEqual(M.computeAccuracy(10, 50), 0);
});

test("spelling accuracy: 3 wrong of 20 = 85%", () => {
  assert.strictEqual(M.computeSpellingAccuracy(20, 3), 85);
});
test("spelling accuracy: no words checked defaults to 100%", () => {
  assert.strictEqual(M.computeSpellingAccuracy(0, 0), 100);
});
test("spelling accuracy: never negative", () => {
  assert.strictEqual(M.computeSpellingAccuracy(5, 99), 0);
});

test("word accuracy: 8 clean of 10 = 80%", () => {
  assert.strictEqual(M.computeWordAccuracy(10, 8), 80);
});
