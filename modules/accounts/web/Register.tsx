// 注册页：用户名 + 密码 + 图形验证码。注册成功会跳到账号页，那里显示一次恢复码。
import { useState } from "react";
import { redirect, useLoaderData } from "react-router";
import { SITE } from "@aihot/site";
import { apiGet } from "@aihot/web/lib/api.server";
import { buttonClass } from "@aihot/web/components/ui/Controls";
import type { AccountMe } from "../types.ts";

const ERRORS: Record<string, string> = {
  username: "用户名要 3–20 个字母、数字、下划线或连字符。",
  password: "密码至少 8 位，两次输入要一致。",
  username_taken: "这个用户名已经有人用了，换一个。",
  captcha: "验证码不对，换一张再试。",
  rate: "注册太频繁，请过一会儿再试。",
  origin: "这次提交不是从本站发出的，请刷新页面重试。",
};

export async function loader({ request }: { request: Request }) {
  const cookie = request.headers.get("cookie");
  const me = cookie ? await apiGet<AccountMe>("/api/account/me", { headers: { cookie }, signal: request.signal }).catch(() => null) : null;
  if (me) throw redirect("/account");
  return { error: new URL(request.url).searchParams.get("error") };
}

export const meta = () => [{ title: `注册 · ${SITE.name}` }, { name: "robots", content: "noindex, nofollow" }];
export const headers = () => ({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" });

export default function Register() {
  const { error } = useLoaderData<typeof loader>();
  const [nonce, setNonce] = useState(0);
  const message = error ? (ERRORS[error] ?? ERRORS.username) : null;
  const input = "mt-2 h-10 w-full rounded-full border border-line-strong bg-surface px-4 text-[14px] text-ink outline-none transition-colors focus:border-accent";
  return (
    <div className="mx-auto w-full max-w-[420px] px-4 py-12 lg:py-20">
      <h1 className="text-[22px] font-bold text-ink">注册</h1>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">
        注册后会给你十串恢复码，忘记密码时用它重置；请当场抄下来，之后不再显示。
      </p>
      <form method="post" action="/api/account/register" className="card mt-6 p-6">
        <label htmlFor="username" className="block text-[13px] font-medium text-ink-2">用户名</label>
        <input id="username" name="username" autoComplete="username" required autoFocus minLength={3} maxLength={20}
          pattern="[\p{L}\p{N}_-]{3,20}" title="3–20 个字母、数字、下划线或连字符" className={input} />
        <label htmlFor="password" className="mt-4 block text-[13px] font-medium text-ink-2">密码</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={200} className={input} />
        <label htmlFor="confirm" className="mt-4 block text-[13px] font-medium text-ink-2">再输一次密码</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} maxLength={200} className={input} />
        <label htmlFor="captcha" className="mt-4 block text-[13px] font-medium text-ink-2">验证码</label>
        <div className="mt-2 flex items-center gap-2">
          <input id="captcha" name="captcha" required maxLength={4} autoComplete="off" className={`${input} mt-0 flex-1 uppercase`} />
          <img src={`/api/account/captcha?n=${nonce}`} width={128} height={48} alt="验证码图片" className="rounded-tile" />
          <button type="button" onClick={() => setNonce((n) => n + 1)} className="text-[12.5px] text-ink-4 hover:text-accent">
            换一张
          </button>
        </div>
        {message && <p role="status" className="mt-3 text-[12.5px] leading-relaxed text-hot">{message}</p>}
        <button type="submit" className={`${buttonClass("primary", "lg")} mt-5 w-full`}>注册</button>
      </form>
      <p className="mt-5 text-center text-[13px] text-ink-3">
        已有账号？<a href="/login" className="hover:text-accent">去登录</a>
      </p>
    </div>
  );
}
