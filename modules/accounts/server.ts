// 账号模块接进接口进程的插口：/api/account/* 的注册、登录、找回和注销。
import { sendTextWithEtag } from "@aihot/api/http/respond";
import { defineServerModule } from "@aihot/backend/modules";
import { savedSearchFeed } from "./feed.ts";
import { registerAccountRoutes } from "./routes.ts";

export default defineServerModule({
  name: "accounts",
  http(app) {
    registerAccountRoutes(app);
    app.get("/feed/search/:file", async (req, reply) => {
      const file = (req.params as { file: string }).file;
      if (!file.endsWith(".xml")) return reply.code(404).type("text/plain; charset=utf-8").send("Not found");
      const xml = await savedSearchFeed(file.slice(0, -4));
      if (!xml) return reply.code(404).type("text/plain; charset=utf-8").send("Not found");
      return sendTextWithEtag(req, reply, xml, {
        etagPrefix: "saved-search",
        cacheControl: "private, max-age=300",
        contentType: "application/rss+xml; charset=utf-8",
      });
    });
  },
});
