// 详情页「来源」栏里的“我的笔记”：登录后加载这篇的笔记，保存到账号，只有本人能看到。
import { useEffect, useState } from "react";

export default function NoteEditor({ itemId, load }: { itemId: string; load: string }) {
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    let live = true;
    fetch(load)
      .then((res) => (res.ok ? (res.json() as Promise<{ body: string | null }>) : null))
      .then((data) => {
        if (!live || !data) return;
        setDraft(data.body ?? "");
        setLoaded(true);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [load]);

  if (!loaded) return null;

  const save = async () => {
    setState("saving");
    try {
      const res = await fetch("/api/account/note", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: itemId, body: draft }),
      });
      setState(res.ok ? "saved" : "error");
      if (res.ok) setTimeout(() => setState("idle"), 1600);
    } catch {
      setState("error");
    }
  };

  return (
    <div className="mt-4 border-t border-line-soft pt-3">
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-ink-4">我的笔记</span>
        <button type="button" onClick={() => void save()} disabled={state === "saving"}
          className="text-[12px] text-accent hover:underline disabled:opacity-50">
          {state === "saving" ? "保存中…" : state === "saved" ? "已保存" : state === "error" ? "重试保存" : "保存"}
        </button>
      </div>
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        rows={3}
        maxLength={20000}
        placeholder="写给自己看的笔记，支持 Markdown；留空保存即删除。"
        className="mt-2 w-full resize-y rounded-tile border border-line-soft bg-surface px-3 py-2 text-[13px] leading-relaxed text-ink outline-none transition-colors placeholder:text-ink-4 focus:border-accent"
      />
    </div>
  );
}
