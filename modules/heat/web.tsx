// 热度模块在网页上的一面：它自己的页面在 module.ts 里登记（/hot/papers），导航沿用引擎的「热点」；
// 首页时间线上方的两栏「最热 / 最新」，详情页「来源」栏里的被引数。
import type { WebModule } from "@aihot/web/modules";
import HeatHomeBlock from "./web/HeatHome.tsx";
import ItemFacts from "./web/ItemFacts.tsx";

export const heatWeb: WebModule = {
  name: "heat",
  home: async () => ({ default: { load: "/api/heat/home", Block: HeatHomeBlock } }),
  item: async () => ({ default: { load: (id: string) => `/api/heat/item/${encodeURIComponent(id)}`, Block: ItemFacts } }),
};
