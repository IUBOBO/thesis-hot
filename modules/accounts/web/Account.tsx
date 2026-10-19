// 账号页：用户名、注册时间、注册时那十串恢复码（只在这十分钟内能看到）、退出和注销。
import { Link, redirect, useLoaderData } from "react-router";
import { beijingDate } from "@aihot/contracts/time";
import { SITE } from "@aihot/site";
import { apiGet } from "@aihot/web/lib/api.server";
import { buttonClass } from "@aihot/web/components/ui/Controls";
import type { AccountMe } from "../types.ts";

export async function loader({ request }: { request: Request }) {
  const cookie = request.headers.get("cookie");
  if (!cookie) throw redirect("/login?return=/account");
  const me = await apiGet<AccountMe>("/api/account/me", { headers: { cookie }, signal: request.signal }).catch(() => null);
  if (!me) throw redirect("/login?return=/account");
  const { codes } = await apiGet<{ codes: string[] }>("/api/account/recovery-codes", { headers: { cookie }, signal: request.signal })
    .catch(() => ({ codes: [] as string[] }));
  const library = await apiGet<{ stars: unknown[]; reads: string[] }>("/api/account/library", { headers: { cookie }, signal: request.signal })
    .catch(() => ({ stars: [], reads: [] }));
  const { searches } = await apiGet<{ searches: unknown[] }>("/api/account/searches", { headers: { cookie }, signal: request.signal })
    .catch(() => ({ searches: [] as unknown[] }));
  return { me, codes, counts: { stars: library.stars.length, reads: library.reads.length, searches: searches.length } };
}

export const meta = () => [{ title: `我的账号 · ${SITE.name}` }, { name: "robots", content: "noindex, nofollow" }];
export const headers = () => ({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" });

const codeStyle = "mono select-all rounded-mark bg-bg-sunk px-2 py-1 text-[13px] tracking-[0.08em] text-ink";

export default function Account() {
  const { me, codes, counts } = useLoaderData<typeof loader>();
  return (
    <div className="mx-auto w-full max-w-[640px] px-4 py-10 lg:py-14">
      <h1 className="text-[22px] font-bold text-ink">我的账号</h1>
      <p className="mt-1.5 text-[13px] text-ink-3">登录状态会保持 30 天；收藏和已读会自动同步到这个账号。</p>

      <section className="card mt-6 divide-y divide-line-soft">
        <div className="flex items-center justify-between px-5 py-4">
          <span className="text-[13px] text-ink-3">用户名</span>
          <span className="text-[14px] font-semibold text-ink">{me.username}</span>
        </div>
        <div className="flex items-center justify-between px-5 py-4">
          <span className="text-[13px] text-ink-3">注册时间</span>
          <span className="num text-[13.5px] text-ink-2">{beijingDate(me.createdAt)}</span>
        </div>
        <Link to="/subscriptions" className="flex items-center justify-between px-5 py-4 transition-colors hover:bg-bg-sunk">
          <span className="text-[13px] text-ink-3">订阅</span>
          <span className="text-[13.5px] text-ink-2">{counts.searches} 条 · RSS →</span>
        </Link>
        <Link to="/starred" className="flex items-center justify-between px-5 py-4 transition-colors hover:bg-bg-sunk">
          <span className="text-[13px] text-ink-3">文献库</span>
          <span className="text-[13.5px] text-ink-2">收藏 <span className="num">{counts.stars}</span> · 已读 <span className="num">{counts.reads}</span> ›</span>
        </Link>
      </section>

      {codes.length > 0 && (
        <section className="card mt-6 p-5">
          <h2 className="text-[15px] font-semibold text-ink">恢复码</h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">
            只显示这一次（十分钟内）。请抄下来或存进密码管理器；每串只能用一次，忘记密码时在这里重置。
          </p>
          <ul className="mt-4 grid grid-cols-2 gap-2">
            {codes.map((code) => <li key={code}><code className={codeStyle}>{code}</code></li>)}
          </ul>
        </section>
      )}

      <section className="card mt-6 divide-y divide-line-soft">
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <div>
            <h2 className="text-[14px] font-semibold text-ink">退出登录</h2>
            <p className="mt-0.5 text-[12.5px] text-ink-3">只退出这台设备，收藏和笔记还在。</p>
          </div>
          <form method="post" action="/api/account/logout">
            <button type="submit" className={buttonClass("secondary", "md")}>退出</button>
          </form>
        </div>
        <details className="px-5 py-4">
          <summary className="cursor-pointer text-[14px] font-semibold text-hot">注销账号</summary>
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">
            注销会立即删除账号、登录会话、恢复码、收藏、已读记录和笔记，不能恢复。
          </p>
          <form method="post" action="/api/account/delete" className="mt-3"
            onSubmit={(event) => { if (!confirm("确定注销这个账号吗？删除后不能恢复。")) event.preventDefault(); }}>
            <label className="flex items-center gap-2 text-[13px] text-ink-2">
              <input type="checkbox" required className="size-4 accent-hot" />
              我知道删除后不能恢复
            </label>
            <button type="submit" className={`${buttonClass("secondary", "md")} mt-3 border-hot/40 text-hot`}>注销账号</button>
          </form>
        </details>
      </section>
    </div>
  );
}
