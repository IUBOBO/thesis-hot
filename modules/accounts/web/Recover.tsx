// 找回密码：用户名 + 一串恢复码 + 新密码。恢复码用一次就作废，其他登录会话也会退出。
import { useLoaderData } from "react-router";
import { SITE } from "@aihot/site";
import { buttonClass } from "@aihot/web/components/ui/Controls";

const ERRORS: Record<string, string> = {
  recover: "用户名或恢复码不对，或者这串码已经用过了。",
  password: "密码至少 8 位，两次输入要一致。",
  rate: "尝试次数太多，请 15 分钟后再试。",
  origin: "这次提交不是从本站发出的，请刷新页面重试。",
};

export async function loader({ request }: { request: Request }) {
  return { error: new URL(request.url).searchParams.get("error") };
}

export const meta = () => [{ title: `找回密码 · ${SITE.name}` }, { name: "robots", content: "noindex, nofollow" }];
export const headers = () => ({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" });

export default function Recover() {
  const { error } = useLoaderData<typeof loader>();
  const message = error ? (ERRORS[error] ?? ERRORS.recover) : null;
  const input = "mt-2 h-10 w-full rounded-full border border-line-strong bg-surface px-4 text-[14px] text-ink outline-none transition-colors focus:border-accent";
  return (
    <div className="mx-auto w-full max-w-[420px] px-4 py-12 lg:py-20">
      <h1 className="text-[22px] font-bold text-ink">找回密码</h1>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">
        用注册时抄下的十串恢复码中的任意一串重设密码。每串只能用一次。
      </p>
      <form method="post" action="/api/account/recover" className="card mt-6 p-6">
        <label htmlFor="username" className="block text-[13px] font-medium text-ink-2">用户名</label>
        <input id="username" name="username" autoComplete="username" required autoFocus maxLength={20} className={input} />
        <label htmlFor="code" className="mt-4 block text-[13px] font-medium text-ink-2">恢复码</label>
        <input id="code" name="code" required autoComplete="off" placeholder="XXXX-XXXX" className={`${input} uppercase`} />
        <label htmlFor="password" className="mt-4 block text-[13px] font-medium text-ink-2">新密码</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={200} className={input} />
        <label htmlFor="confirm" className="mt-4 block text-[13px] font-medium text-ink-2">再输一次新密码</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} maxLength={200} className={input} />
        {message && <p role="status" className="mt-3 text-[12.5px] leading-relaxed text-hot">{message}</p>}
        <button type="submit" className={`${buttonClass("primary", "lg")} mt-5 w-full`}>重设密码</button>
      </form>
      <p className="mt-5 text-center text-[13px] text-ink-3">
        想起来了？<a href="/login" className="hover:text-accent">去登录</a>
      </p>
    </div>
  );
}
