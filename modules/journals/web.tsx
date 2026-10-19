// 期刊模块在网页上的一面：侧栏入口、手机「我的」里的入口，以及首页时间线上方的「今日顶刊」。
import type { WebModule } from "@aihot/web/modules";
import { IconRss } from "@aihot/web/components/icons";
import JournalHomeBlock from "./web/Home.tsx";

export const journalsWeb: WebModule = {
  name: "journals",
  sidebar: { section: "内容", items: [{ to: "/journals", label: "期刊", icon: IconRss }] },
  tools: [{ to: "/journals", label: "期刊", icon: <IconRss size={20} /> }],
  home: async () => ({ default: { load: "/api/journal/home", Block: JournalHomeBlock } }),
};
