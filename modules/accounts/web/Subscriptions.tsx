// 订阅：保存一条搜索条件，给它一个 RSS 地址；换设备或给阅读器都能用。
// 页面只读接口，不碰数据库；feed 地址里带不可猜的 token，页面上提醒不要外传。
import { useState } from "react";
import { Link, redirect, useLoaderData, useRevalidator } from "react-router";
import { CATEGORY_KEYS, CATEGORY_LABELS } from "@aihot/contracts/taxonomy";
import { beijingDate } from "@aihot/contracts/time";
import { SITE } from "@aihot/site";
import { apiGet } from "@aihot/web/lib/api.server";
import { buttonClass } from "@aihot/web/components/ui/Controls";
import { IconClose } from "@aihot/web/components/icons";

interface SavedSearchView {
  id: string;
  name: string;
  query: string;
  filters: { channel: string; category: string | null; kind: string | null; oa: boolean | null; within: number | null };
  feedUrl: string;
  createdAt: string;
}

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const back = encodeURIComponent(`${url.pathname}${url.search}`);
  const cookie = request.headers.get("cookie");
  if (!cookie) throw redirect(`/login?return=${back}`);
  const me = await apiGet<{ username: string }>("/api/account/me", { headers: { cookie }, signal: request.signal }).catch(() => null);
  if (!me) throw redirect(`/login?return=${back}`);
  const { searches } = await apiGet<{ searches: SavedSearchView[] }>("/api/account/searches", { headers: { cookie }, signal: request.signal })
    .catch(() => ({ searches: [] as SavedSearchView[] }));
  return {
    searches,
    initial: {
      query: url.searchParams.get("q") ?? "",
      category: url.searchParams.get("category") ?? "",
      kind: url.searchParams.get("kind") ?? "",
      within: url.searchParams.get("within") ?? "",
    },
  };
}

export const meta = () => [{ title: `订阅 · ${SITE.name}` }, { name: "robots", content: "noindex, nofollow" }];
export const headers = () => ({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" });

const inputClass = "h-9 w-full rounded-tile border border-line bg-surface px-3 text-[13.5px] text-ink outline-none transition-colors placeholder:text-ink-4 focus:border-accent";
const labelClass = "text-[12px] font-medium text-ink-3";

export default function Subscriptions() {
  const { searches, initial } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const [name, setName] = useState("");
  const [query, setQuery] = useState(initial.query);
  const [category, setCategory] = useState(initial.category);
  const [kind, setKind] = useState(initial.kind);
  const [within, setWithin] = useState(initial.within);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const post = (url: string, body: unknown) => fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setNotice(null);
    const res = await post("/api/account/searches", {
      name, query,
      filters: { category: category || null, kind: kind || null, within: within ? Number(within) : null },
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setNotice(res?.status === 401 ? "登录已过期，请重新登录。" : "保存失败，稍后再试。");
      return;
    }
    setName("");
    setQuery("");
    setCategory("");
    setKind("");
    setWithin("");
    setNotice("已保存，下面就是它的 RSS 地址。");
    revalidator.revalidate();
  };

  const rename = async (id: string, current: string) => {
    const next = prompt("新的订阅名称", current)?.trim();
    if (!next) return;
    const res = await post("/api/account/searches/update", { id, name: next }).catch(() => null);
    if (!res?.ok) {
      setNotice("重命名失败，稍后再试。");
      return;
    }
    revalidator.revalidate();
  };

  const remove = async (id: string) => {
    if (!confirm("删除这条订阅吗？RSS 地址会立即失效。")) return;
    const res = await post("/api/account/searches/delete", { id }).catch(() => null);
    if (!res?.ok) {
      setNotice("删除失败，稍后再试。");
      return;
    }
    revalidator.revalidate();
  };

  const copy = async (id: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setNotice("复制失败，请手动选中地址。");
    }
  };

  const summary = (search: SavedSearchView) => {
    const parts = [search.query || "全部内容"];
    if (search.filters.category) parts.push(CATEGORY_LABELS[search.filters.category as keyof typeof CATEGORY_LABELS] ?? search.filters.category);
    if (search.filters.kind === "paper") parts.push("期刊论文");
    if (search.filters.kind === "preprint") parts.push("预印本");
    if (search.filters.within) parts.push(`最近 ${search.filters.within} 天`);
    return parts.join(" · ");
  };

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 py-10 lg:py-14">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-ink">订阅</h1>
          <p className="mt-1.5 text-[13px] text-ink-3">把常搜的条件存下来，给阅读器一个固定的 RSS 地址。</p>
        </div>
        <Link to="/account" className="mt-1 text-[12.5px] text-ink-3 transition-colors hover:text-accent">我的账号 →</Link>
      </header>

      <form onSubmit={create} className="card mt-6 p-5">
        <h2 className="text-[15px] font-semibold text-ink">新建订阅</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>名称</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="例如：遥感 + 高光谱" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>检索词（可用 AND / OR / NOT）</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} maxLength={200} placeholder="留空表示全部" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>分类</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
              <option value="">全部分类</option>
              {CATEGORY_KEYS.map((key) => <option key={key} value={key}>{CATEGORY_LABELS[key]}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>来源类型</span>
            <select value={kind} onChange={(e) => setKind(e.target.value)} className={inputClass}>
              <option value="">期刊与预印本</option>
              <option value="paper">期刊论文</option>
              <option value="preprint">预印本</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>时间范围</span>
            <select value={within} onChange={(e) => setWithin(e.target.value)} className={inputClass}>
              <option value="">不限</option>
              <option value="7">最近 7 天</option>
              <option value="30">最近 30 天</option>
              <option value="365">最近一年</option>
            </select>
          </label>
        </div>
        <button type="submit" disabled={busy} className={`${buttonClass("primary", "md")} mt-4 disabled:opacity-60`}>
          {busy ? "保存中…" : "保存并生成 RSS"}
        </button>
        {notice && <p role="status" className="mt-3 text-[12.5px] text-ink-3">{notice}</p>}
        <p className="mt-3 text-[12px] leading-relaxed text-ink-4">
          RSS 地址里带一串随机 token，知道地址的人都能读；不要发到公开的地方。删除订阅后地址立即失效。
        </p>
      </form>

      <section className="mt-6">
        <h2 className="text-[15px] font-semibold text-ink">已保存 {searches.length > 0 && <span className="num text-ink-3">{searches.length}</span>}</h2>
        {searches.length === 0 ? (
          <p className="mt-2 rounded-tile border border-dashed border-line-strong px-4 py-8 text-center text-[13px] text-ink-3">
            还没有订阅。上面填一个条件就能生成。
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {searches.map((search) => (
              <li key={search.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-[14.5px] font-semibold text-ink">{search.name}</h3>
                    <p className="mt-0.5 text-[12.5px] text-ink-3">{summary(search)}</p>
                    <p className="num mt-0.5 text-[11.5px] text-ink-4">保存于 {beijingDate(search.createdAt)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={() => rename(search.id, search.name)} aria-label="重命名订阅" title="重命名订阅"
                      className="rounded-full px-2 py-1 text-[12px] text-ink-4 transition-colors hover:bg-bg-sunk hover:text-ink">
                      重命名
                    </button>
                    <button type="button" onClick={() => remove(search.id)} aria-label="删除订阅" title="删除订阅"
                    className="grid size-7 shrink-0 place-items-center rounded-full text-ink-4 transition-colors hover:bg-bg-sunk hover:text-hot">
                      <IconClose size={14} />
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input readOnly value={search.feedUrl} aria-label={`${search.name} 的 RSS 地址`}
                    className="mono h-8 min-w-0 flex-1 rounded-tile bg-bg-sunk px-2.5 text-[11.5px] text-ink-2" />
                  <button type="button" onClick={() => copy(search.id, search.feedUrl)} className={buttonClass("secondary", "md")}>
                    {copied === search.id ? "已复制" : "复制"}
                  </button>
                  <a href={search.feedUrl} target="_blank" rel="noreferrer" className={buttonClass("secondary", "md")}>打开 RSS</a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
