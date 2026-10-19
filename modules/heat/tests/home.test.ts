// The home page's two columns: at most five papers each side, and the hot column says which rule it
// used (heat, then 7-day growth when nothing is cited yet, or none).
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeDb } from "@aihot/backend/db";
import { loadHeatHome } from "../read.ts";

after(async () => { await closeDb(); });

test("the home columns are bounded and name the rule behind the hot column", async () => {
  const home = await loadHeatHome(new Date());
  assert.ok(["heat", "growth", "none"].includes(home.mode));
  assert.ok(home.hot.length <= 5 && home.latest.length <= 5);
  if (home.mode === "none") assert.equal(home.hot.length, 0);
  if (home.mode === "heat") assert.ok(home.hot.every((entry) => entry.cites > 0));
  if (home.mode === "growth") assert.ok(home.hot.every((entry) => (entry.growth7 ?? 0) > 0));
});
