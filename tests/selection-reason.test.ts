// Selection needs a reason: a model-written item with no "为什么值得读" line is kept out of 精选
// even when its scores pass; an item with a reason goes in.
import { pointModels, stub, tag } from "./setup.ts";
import { analysisStep, SELECTING_SCORE } from "./analysis-steps.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeDb } from "@aihot/backend/db";
import { normalizeAnalysis, runAnalysis, type AnalyzeInputArticle } from "@aihot/backend/editorial/analyze";

let reasonText = "fixture";
const provider = await stub((_hit, request) => {
  const step = analysisStep(request.body);
  const output = step === "prefilter" ? { label: "PASS", reason: "fixture" }
    : step === "score" ? { attentionScore: SELECTING_SCORE }
    : step === "structure" ? { scope: "unknown", category: "model", tags: [], subjects: [], fact: null }
    : { itemType: "new_paper", authorRole: "principal", titleZh: "新论文", summaryZh: "来源确认新论文。", bodyZh: "来源确认新论文。", tags: [], editorialJudgment: reasonText };
  return { choices: [{ message: { content: JSON.stringify(output) } }] };
});
pointModels(provider.url);
after(async () => { await provider.close(); await closeDb(); });

const article = (): AnalyzeInputArticle => ({
  id: `reason-${tag()}`, revision: 1, title: "新论文", url: "https://example.org/news", author: null,
  publishedAt: new Date("2026-10-02T00:00:00Z"), bodyStatus: "ok", bodyText: "来源确认新论文，给出了方法与结果。",
  excerpt: null, media: [], xPost: null,
  source: { name: "Fixture", kind: "rss", tier: "T1", firstParty: true },
});

test("an item without a reason is not selected even when its scores pass", async () => {
  reasonText = "   ";
  const out = normalizeAnalysis(await runAnalysis(article(), { attemptTag: tag() }));
  assert.equal(out.selected, false);
});

test("an item with a reason is selected when its scores pass", async () => {
  reasonText = "给出了可复现的方法与结果。";
  const out = normalizeAnalysis(await runAnalysis(article(), { attemptTag: tag() }));
  assert.equal(out.selected, true);
});
