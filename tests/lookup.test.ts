import assert from "node:assert/strict";
import { test } from "node:test";
import { identifierOf } from "../packages/backend/src/publication/lookup.ts";

test("a DOI or arXiv number is an identifier, with or without its link or prefix", () => {
  assert.equal(identifierOf("10.1016/j.fuel.2026.141718"), "10.1016/j.fuel.2026.141718");
  assert.equal(identifierOf("https://doi.org/10.1016/j.fuel.2026.141718"), "10.1016/j.fuel.2026.141718");
  assert.equal(identifierOf("arXiv:2610.01234v2"), "2610.01234v2");
  assert.equal(identifierOf("2610.01234"), "2610.01234");
});

test("ordinary search words are not identifiers", () => {
  assert.equal(identifierOf("fuel cell NOx"), null);
  assert.equal(identifierOf("2026年燃烧"), null);
  assert.equal(identifierOf("10.5 mm 管道"), null);
});
