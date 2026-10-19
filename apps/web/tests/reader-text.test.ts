// Reader copy: formulas the model wrote with plain digits get their subscripts, while a half-year
// ("H2 2026") and a name that only starts like a formula ("CO2e") stay as written.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readerText } from "../app/lib/format.ts";

test("chemical formulas are written with subscripts", () => {
  assert.equal(readerText("CO2、SO2 与 NOX 的排放"), "CO₂、SO₂ 与 NOₓ 的排放");
  assert.equal(readerText("NOx 与 NH3"), "NOₓ 与 NH₃");
  assert.equal(readerText("H2O 和 CH4"), "H₂O 和 CH₄");
  assert.equal(readerText("H2O2 分解为 O2"), "H₂O₂ 分解为 O₂");
  assert.equal(readerText("N2O 与 N2"), "N₂O 与 N₂");
  assert.equal(readerText("SiO2 负载 TiO2"), "SiO₂ 负载 TiO₂");
});

test("a longer word or a unit is left alone", () => {
  assert.equal(readerText("CO2e 口径"), "CO2e 口径");
  assert.equal(readerText("PM2.5"), "PM2.5");
});

test("Markdown escapes left by an older writer are dropped", () => {
  assert.equal(readerText("浓度 1\\.0 到 3\\.5 摩尔"), "浓度 1.0 到 3.5 摩尔");
  assert.equal(readerText("括号 \\(实验\\) 与 \\["), "括号 (实验) 与 [");
});
