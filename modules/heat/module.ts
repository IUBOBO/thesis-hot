// 热度模块的地址：论文热度页。（旧的 /hot 是事件榜，这里改道过去。）
import { defineModule } from "@aihot/contracts/modules";

export default defineModule({
  name: "heat",
  pages: [{ path: "hot/papers", file: "web/HotPapers.tsx" }],
  redirects: [{ match: "exact", path: "/hot", status: 301, location: "/hot/papers", why: "热点榜换成论文热度榜" }],
  apiPaths: [/^\/api\/heat(?:\/|$)/],
});
