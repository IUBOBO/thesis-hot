// 热度模块接进接口进程的插口：论文热度榜的数据，和每天拉一次引用数的定时任务。
import { defineServerModule } from "@aihot/backend/modules";
import { siteUrl } from "@aihot/backend/publication/links";
import { sendJsonWithEtag, sendProblem } from "@aihot/api/http/respond";
import { collectPaperSignals } from "./collect.ts";
import { loadHeatHome, loadPaperHeat, loadPaperSignal, WINDOW_DAYS } from "./read.ts";

export default defineServerModule({
  name: "heat",
  http(app) {
    app.get("/api/heat/home", async (req, reply) => {
      try {
        return await sendJsonWithEtag(req, reply, await loadHeatHome(), { etagPrefix: "heat-home", cacheControl: "public, max-age=300, s-maxage=300" });
      } catch (error) {
        req.log.error({ err: error, path: "/api/heat/home" }, "heat home error");
        return sendProblem(req, reply, { status: 503, code: "temporarily_unavailable", detail: "temporarily unavailable", retryAfter: 10 });
      }
    });
    app.get("/api/heat/papers", async (req, reply) => {
      try {
        return await sendJsonWithEtag(req, reply, await loadPaperHeat(), { etagPrefix: "paper-heat", cacheControl: "public, max-age=300, s-maxage=300" });
      } catch (error) {
        req.log.error({ err: error, path: "/api/heat/papers" }, "paper heat error");
        return sendProblem(req, reply, { status: 503, code: "temporarily_unavailable", detail: "temporarily unavailable", retryAfter: 10 });
      }
    });
    app.get("/api/heat/item/:id", async (req, reply) => {
      const id = String((req.params as { id?: string }).id ?? "");
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return sendProblem(req, reply, { status: 404, code: "not_found", detail: "no report for this id" });
      try {
        const signal = await loadPaperSignal(id);
        if (!signal) return sendProblem(req, reply, { status: 404, code: "not_found", detail: "no citation signal for this report" });
        return await sendJsonWithEtag(req, reply, signal, { etagPrefix: `heat-item-${id}`, cacheControl: "public, max-age=300, s-maxage=300" });
      } catch (error) {
        req.log.error({ err: error, path: `/api/heat/item/${id}` }, "paper signal error");
        return sendProblem(req, reply, { status: 503, code: "temporarily_unavailable", detail: "temporarily unavailable", retryAfter: 10 });
      }
    });
  },
  // 引用数一天变一次；外网请求和采集一样受 COLLECT_ENABLED 管（关掉时不留定时任务）。
  schedules: [{
    name: "heat.papers",
    cron: "40 6 * * *",
    missed: "once",
    run: () => collectPaperSignals(),
    when: () => process.env.COLLECT_ENABLED === "true",
  }],
  llms: () => ({
    pages: [
      `- [论文热度](${siteUrl("/hot/papers")}): 最近 ${WINDOW_DAYS} 天上线的论文按引用速度排名，引用数来自 OpenAlex，每天更新；讨论与代码的信号还没有公开来源`,
    ],
  }),
  sitemap: { pages: [{ loc: "/hot/papers", changefreq: "daily", priority: 0.8 }] },
});
