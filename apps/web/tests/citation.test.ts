// Reference export: a journal paper gets @article with its DOI; an arXiv preprint gets @misc; LaTeX
// special characters in the title are escaped and RIS carries one AU line per author. APA and
// GB/T 7714 put the year, the volume and the DOI where their styles expect them.
import assert from "node:assert/strict";
import { test } from "node:test";
import { citationApa, citationBibtex, citationGbt, citationRis, doiOf } from "../app/lib/citation.ts";

const paper = {
  id: "sije7sy2hprebjiicsqadnlm2",
  title: "富氢天然气燃烧用多模式超低 NOX 燃烧器",
  originalTitle: "Multi-mode ultra-low-NOX burner: 50% H2 & 2% CO",
  author: "Sebastian Reichenbäck, Stefan Schwarz, Martin Demuth",
  publishedAt: "2026-10-16T00:00:00.000Z",
  source: { name: "Fuel" },
  links: { original: "https://doi.org/10.1016/j.fuel.2026.141718" },
  volume: "348",
  issue: "12",
};

const preprint = { ...paper, source: { name: "arXiv" }, links: { original: "https://arxiv.org/abs/2610.01234" } };

test("a journal paper cites its DOI and journal", () => {
  const bib = citationBibtex(paper);
  assert.match(bib, /^@article\{/);
  assert.match(bib, /title = \{Multi-mode ultra-low-NOX burner: 50\\% H2 \\& 2\\% CO\}/);
  assert.match(bib, /journal = \{Fuel\}/);
  assert.match(bib, /year = \{2026\}/);
  assert.match(bib, /doi = \{10\.1016\/j\.fuel\.2026\.141718\}/);
  assert.match(bib, /author = \{Sebastian Reichenbäck and Stefan Schwarz and Martin Demuth\}/);
  assert.match(bib, /volume = \{348\}/);
  assert.match(bib, /number = \{12\}/);
  assert.ok(!/url = /.test(bib), "a DOI replaces the bare link");
});

test("an arXiv preprint is @misc without a journal", () => {
  const bib = citationBibtex({ ...paper, source: { name: "arXiv" }, links: { original: "https://arxiv.org/abs/2610.01234" } });
  assert.match(bib, /^@misc\{/);
  assert.match(bib, /howpublished = \{arXiv\}/);
  assert.match(bib, /url = \{https:\/\/arxiv\.org\/abs\/2610\.01234\}/);
  assert.ok(!/journal = /.test(bib));
  assert.ok(!/volume = /.test(bib), "a preprint has no volume");
});

test("RIS lists each author and the DOI", () => {
  const ris = citationRis(paper);
  assert.match(ris, /^TY  - JOUR$/m);
  assert.equal(ris.match(/^AU  - /gm)?.length, 3);
  assert.match(ris, /^PY  - 2026\/10\/16$/m);
  assert.match(ris, /^VO  - 348$/m);
  assert.match(ris, /^IS  - 12$/m);
  assert.match(ris, /^DO  - 10\.1016\/j\.fuel\.2026\.141718$/m);
  assert.match(ris, /\nER  - $/);
});

test("APA puts family name, initials, year, volume and the DOI link in order", () => {
  const apa = citationApa(paper);
  assert.match(apa, /^Reichenbäck, S\., Schwarz, S\., & Demuth, M\. \(2026\)\. /);
  assert.match(apa, /Multi-mode ultra-low-NOX burner: 50% H2 & 2% CO\. Fuel, 348\(12\)\./);
  assert.ok(apa.endsWith("https://doi.org/10.1016/j.fuel.2026.141718"));
});

test("APA names the arXiv archive for a preprint", () => {
  const apa = citationApa(preprint);
  assert.match(apa, /arXiv:2610\.01234\. https:\/\/arxiv\.org\/abs\/2610\.01234$/);
  assert.ok(!/Fuel/.test(apa));
});

test("GB/T 7714 uses [J], an uppercased family name and the volume(issue)", () => {
  const gbt = citationGbt(paper);
  assert.match(gbt, /^REICHENBÄCK S, SCHWARZ S, DEMUTH M\. Multi-mode ultra-low-NOX burner: 50% H2 & 2% CO\[J\]\. Fuel, 2026, 348\(12\)\. DOI:10\.1016\/j\.fuel\.2026\.141718\.$/);
});

test("GB/T 7714 marks a preprint as an online journal article", () => {
  const gbt = citationGbt(preprint);
  assert.match(gbt, /\[J\/OL\]\. arXiv, 2026\. https:\/\/arxiv\.org\/abs\/2610\.01234\.$/);
});

test("the DOI is read from a publisher link and trailing punctuation is dropped", () => {
  assert.equal(doiOf("https://doi.org/10.1016/j.fuel.2026.141718."), "10.1016/j.fuel.2026.141718");
  assert.equal(doiOf("https://example.com/paper"), null);
});
