// 登录页：用户名 + 密码，表单直接 POST 到接口；失败回 ?error=，成功回 return 或账号页。
import { redirect, useLoaderData } from "react-router";
import { SITE } from "@aihot/site";
import { apiGet } from "@aihot/web/lib/api.server";
import { buttonClass } from "@aihot/web/components/ui/Controls";
import type { AccountMe } from "../types.ts";

const ERRORS: Record<string, string> = {
  login: "用户名或密码不对。",
  rate: "尝试次数太多，请 15 分钟后再试。",
  origin: "这次提交不是从本站发出的，请刷新页面重试。",
};

export async function loader({ request }: { request: Request }) {
  const cookie = request.headers.get("cookie");
  const me = cookie ? await apiGet<AccountMe>("/api/account/me", { headers: { cookie }, signal: request.signal }).catch(() => null) : null;
  if (me) throw redirect("/account");
  const url = new URL(request.url);
  const returnTo = url.searchParams.get("return") ?? "/account";
  return {
    returnTo: returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/account",
    error: url.searchParams.get("error"),
    reset: url.searchParams.get("reset") === "1",
  };
}

export const meta = () => [{ title: `登录 · ${SITE.name}` }, { name: "robots", content: "noindex, nofollow" }];
export const headers = () => ({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" });

export default function Login() {
  const { returnTo, error, reset } = useLoaderData<typeof loader>();
  const message = reset ? "密码已重置，用新密码登录。" : error ? (ERRORS[error] ?? ERRORS.login) : null;
  return (
    <div className="mx-auto w-full max-w-[380px] px-4 py-12 lg:py-20">
      <h1 className="text-[22px] font-bold text-ink">登录</h1>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">
        登录后收藏、阅读状态和笔记会跟着账号走；没登录也能照常看论文。
      </p>
      <form method="post" action="/api/account/login" className="card mt-6 p-6">
        <input type="hidden" name="return" value={returnTo} />
        <label htmlFor="username" className="block text-[13px] font-medium text-ink-2">用户名</label>
        <input id="username" name="username" autoComplete="username" required autoFocus maxLength={20}
          className="mt-2 h-10 w-full rounded-full border border-line-strong bg-surface px-4 text-[14px] text-ink outline-none transition-colors focus:border-accent" />
        <label htmlFor="password" className="mt-4 block text-[13px] font-medium text-ink-2">密码</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required maxLength={200}
          className="mt-2 h-10 w-full rounded-full border border-line-strong bg-surface px-4 text-[14px] text-ink outline-none transition-colors focus:border-accent" />
        {message && <p role="status" className="mt-3 text-[12.5px] leading-relaxed text-hot">{message}</p>}
        <button type="submit" className={`${buttonClass("primary", "lg")} mt-5 w-full`}>登录</button>
      </form>
      <p className="mt-5 flex items-center justify-center gap-3 text-[13px] text-ink-3">
        <a href="/register" className="hover:text-accent">注册账号</a>
        <span aria-hidden="true">·</span>
        <a href="/recover" className="hover:text-accent">忘记密码</a>
      </p>
    </div>
  );
}
