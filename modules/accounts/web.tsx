// 账号模块在网页上的一面：侧栏和「我的」页的入口，所有公开页上的收藏/已读同步，
// 以及详情页「来源」栏里的我的笔记。页面本身在 module.ts 里登记。
import type { WebModule } from "@aihot/web/modules";
import { IconRss, IconUser } from "@aihot/web/components/icons";
import LibrarySync from "./web/LibrarySync.tsx";
import NoteEditor from "./web/NoteEditor.tsx";

export const accountsWeb: WebModule = {
  name: "accounts",
  sidebar: { section: "更多", items: [{ to: "/account", label: "账号", icon: IconUser }, { to: "/subscriptions", label: "订阅", icon: IconRss }] },
  tools: [{ to: "/account", label: "账号与恢复码", icon: <IconUser size={18} /> }, { to: "/subscriptions", label: "订阅与 RSS", icon: <IconRss size={18} /> }],
  root: { Bottom: LibrarySync },
  item: async () => ({ default: { load: (id: string) => `/api/account/note/${encodeURIComponent(id)}`, Block: NoteEditor } }),
};
