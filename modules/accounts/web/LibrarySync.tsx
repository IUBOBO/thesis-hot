// 账号同步：登录后在所有公开页后台运行。
// 登录时把浏览器里的收藏/已读并进账号，再把账号里的并回本地；之后收藏和已读的变化随事件推给接口。
// 没登录时只发一次 /api/account/me，拿到 401 就停。
import { useEffect } from "react";
import {
  getReadIds, getStarred, LOCAL_CHANGE_EVENT, mergeRead, mergeStarred,
  type LocalChange, type LocalStarredItem,
} from "@aihot/web/lib/local-state";

const post = (body: unknown) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export default function LibrarySync() {
  useEffect(() => {
    let live = true;
    const run = async () => {
      const me = await fetch("/api/account/me").catch(() => null);
      if (!me?.ok || !live) return;
      const merged = await fetch("/api/account/library/merge", post({ stars: getStarred(), reads: getReadIds() })).catch(() => null);
      if (!merged?.ok || !live) return;
      const library = (await merged.json().catch(() => null)) as { stars?: LocalStarredItem[]; reads?: string[] } | null;
      if (!live || !library) return;
      mergeStarred(library.stars ?? []);
      mergeRead(library.reads ?? []);
    };
    void run();

    const onChange = (event: Event) => {
      const change = (event as CustomEvent<LocalChange>).detail;
      if (!change) return;
      if (change.kind === "read") {
        void fetch("/api/account/read", post({ ids: [change.id] })).catch(() => {});
        return;
      }
      if (change.kind === "star-meta") {
        void fetch("/api/account/star/meta", post({ id: change.id, folder: change.folder, tags: change.tags, status: change.status })).catch(() => {});
        return;
      }
      if (change.on) void fetch("/api/account/star", post({ on: true, item: change.item })).catch(() => {});
      else void fetch("/api/account/star", post({ on: false, id: change.id })).catch(() => {});
    };
    window.addEventListener(LOCAL_CHANGE_EVENT, onChange);
    return () => {
      live = false;
      window.removeEventListener(LOCAL_CHANGE_EVENT, onChange);
    };
  }, []);
  return null;
}
