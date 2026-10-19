// 期刊模块接进接口进程的插口：期刊目录、单刊的一页论文、首页「今日顶刊」的数据，以及按刊 RSS。
import { spawn } from "node:child_process";
import path from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { REPO_ROOT } from "@aihot/backend/config";
import { defineServerModule, serverModules } from "@aihot/backend/modules";
import { siteUrl } from "@aihot/backend/publication/links";
import { applyPublicHeaders, looseQuery, sendJsonWithEtag, sendProblem, sendTextWithEtag } from "@aihot/api/http/respond";
import { journalFeed } from "./feed.ts";
import { journalPagePath } from "./paths.ts";
import { loadJournalHome, loadJournalPage, loadJournalsIndex } from "./read.ts";
import { journalOf, journals } from "./registry.ts";
import type { JournalPage, JournalHome, JournalsIndex } from "./types.ts";

/** 计划任务里跑一次采集脚本；子进程继承 worker 的环境变量和 .env。 */
function runCollector(script: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(REPO_ROOT, script), ...args], { cwd: REPO_ROOT, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${script} exited with ${code}`))));
  });
}

const MINUTE = "public, max-age=60, s-maxage=60";
const FIVE_MINUTES = "public, max-age=300, s-maxage=300";

/** 出错时和站内外其他接口一样回 503，细节只写进日志。 */
function failed(req: FastifyRequest, reply: FastifyReply, error: unknown) {
  req.log.error({ err: error, path: (req.raw.url ?? "").split("?")[0] }, "journals api error");
  return sendProblem(req, reply, { status: 503, code: "temporarily_unavailable", detail: "temporarily unavailable", retryAfter: 10 });
}

export default defineServerModule({
  name: "journals",
  // 采集放在 worker 里，不再依赖 Windows 计划任务：两次期刊、一次会议，都在日报 09:00 之前。
  // 45 天窗口保证漏一次也能补上；--max=10 控制单次入库量，token 不会一次冲很高。
  schedules: [
    {
      name: "journals.collect",
      cron: "30 7,17 * * *",
      missed: "once",
      when: () => process.env.COLLECT_ENABLED === "true",
      run: () => runCollector("scripts/journals.ts", ["--days=45", "--max=10"]),
    },
    {
      name: "conferences.collect",
      cron: "30 8 * * *",
      missed: "once",
      when: () => process.env.COLLECT_ENABLED === "true",
      run: () => runCollector("scripts/conferences.ts", ["--days=45"]),
    },
  ],
  http(app: FastifyInstance) {
    app.get("/api/journal", async (req, reply) => {
      try {
        const body: JournalsIndex = await loadJournalsIndex();
        return await sendJsonWithEtag(req, reply, body, { etagPrefix: "journal-index", cacheControl: FIVE_MINUTES });
      } catch (error) {
        return failed(req, reply, error);
      }
    });

    app.get("/api/journal/home", async (req, reply) => {
      try {
        const body: JournalHome = await loadJournalHome();
        return await sendJsonWithEtag(req, reply, body, { etagPrefix: "journal-home", cacheControl: MINUTE });
      } catch (error) {
        return failed(req, reply, error);
      }
    });

    app.get("/api/journal/:issn", async (req, reply) => {
      const issn = String((req.params as { issn: string }).issn ?? "");
      const page = Math.min(Math.max(Number(looseQuery(req).page) || 1, 1), 50);
      try {
        const body: JournalPage | null = await loadJournalPage(issn, page);
        if (!body) return sendProblem(req, reply, { status: 404, code: "not_found", detail: "journal not found", cacheControl: MINUTE });
        return await sendJsonWithEtag(req, reply, body, { etagPrefix: "journal", cacheControl: MINUTE });
      } catch (error) {
        return failed(req, reply, error);
      }
    });

    // 按刊订阅：/feed/journal/<ISSN>.xml（web 服务器按 /feed/ 前缀转给接口）。
    app.get("/feed/journal/:file", async (req, reply) => {
      const file = String((req.params as { file: string }).file ?? "").toLowerCase();
      const journal = file.endsWith(".xml") ? journalOf(file.slice(0, -".xml".length)) : null;
      applyPublicHeaders(reply, { cors: false });
      if (!journal) return reply.code(404).header("Cache-Control", "public, max-age=300").type("text/plain; charset=utf-8").send("Not found");
      try {
        for (const m of serverModules()) m.on?.exitServed?.("rss", req);
        return await sendTextWithEtag(req, reply, await journalFeed(journal), {
          etagPrefix: "journal-rss",
          cacheControl: "public, max-age=300, s-maxage=300, must-revalidate",
          contentType: "application/rss+xml; charset=utf-8",
        });
      } catch (error) {
        req.log.error({ err: error, path: (req.raw.url ?? "").split("?")[0] }, "journal feed error");
        return reply.code(503).header("Retry-After", "60").header("Cache-Control", "no-store").type("text/plain; charset=utf-8").send("Feed temporarily unavailable");
      }
    });
  },
  llms: () => ({
    pages: [
      `- [期刊](${siteUrl("/journals")}): 每本刊一页，列出最近公开的论文、按学科汇总；单刊页是 /journal/<ISSN>，可用 /feed/journal/<ISSN>.xml 订阅一本刊`,
    ],
  }),
  sitemap: {
    pages: [
      { loc: "/journals", changefreq: "daily", priority: 0.7 },
      ...journals().map((journal) => ({ loc: journalPagePath(journal.issn), changefreq: "daily" as const, priority: 0.5 })),
    ],
  },
});
