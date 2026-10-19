// 读者账号的接口：注册、登录、登出、找回、注销、验证码和当前账号。
// 网页上的表单直接 POST 到这里（成功 303 回页面），接口客户端用 JSON 拿同样的结果。
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { sendProblem } from "@aihot/api/http/respond";
import { config } from "@aihot/backend/config";
import {
  accountFromCookie, AccountError, checkCaptcha, clearSessionCookie, createAccount, createSession, deleteAccount,
  endSession, newCaptcha, parseCookies, recoverAccount, SESSION_COOKIE, SESSION_DAYS, sessionCookie, verifyLogin,
} from "./auth.ts";
import { getNote, listLibrary, markRead, mergeLibrary, readIds, readStar, readStatus, readTags, saveNote, setStar, setStarMeta, unsetStar, type LibraryStar } from "./library.ts";
import { createSearch, deleteSearch, listSearches, renameSearch } from "./searches.ts";

const formPost = (req: FastifyRequest) => String(req.headers["content-type"] ?? "").startsWith("application/x-www-form-urlencoded");
const bodyOf = (req: FastifyRequest) => (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
const field = (body: Record<string, unknown>, name: string) => (typeof body[name] === "string" ? (body[name] as string) : "");

/** 只回到站内路径，防止登录后被带去外站。 */
function safeReturn(value: unknown): string {
  const path = typeof value === "string" ? value : "";
  return path.startsWith("/") && !path.startsWith("//") ? path : "/account";
}

/** 浏览器带来的 Origin 如果和本站不一致，就不接受这次提交（SameSite=Lax 之外的第二道）。 */
function foreignOrigin(req: FastifyRequest): boolean {
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    return new URL(origin).host !== req.headers.host;
  } catch {
    return true;
  }
}

/** 同一地址的提交次数：注册更严，登录和找回宽一些。 */
const attempts = new Map<string, number[]>();
function overLimit(scope: string, ip: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  if (attempts.size > 5000) attempts.clear();
  const key = `${scope}:${ip}`;
  const recent = (attempts.get(key) ?? []).filter((at) => now - at < windowMs);
  recent.push(now);
  attempts.set(key, recent);
  return recent.length > limit;
}

function redirectWith(reply: FastifyReply, path: string, params: Record<string, string>): FastifyReply {
  const search = new URLSearchParams(params).toString();
  return reply.header("Cache-Control", "no-store").redirect(search ? `${path}?${search}` : path, 303);
}

function fail(req: FastifyRequest, reply: FastifyReply, page: string, params: Record<string, string>) {
  if (formPost(req)) return redirectWith(reply, page, params);
  return sendProblem(req, reply, { status: 400, code: "invalid_request", detail: Object.values(params)[0] ?? "invalid request" });
}

export function registerAccountRoutes(app: FastifyInstance) {
  app.register(async (scope) => {
    // 登录、注册的表单以 urlencoded 提交，只有这组路由读这种格式。
    scope.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string", bodyLimit: 16 * 1024 }, (_req, body, done) => {
      done(null, Object.fromEntries(new URLSearchParams(String(body))));
    });

    scope.get("/api/account/captcha", async (_req, reply) => {
      const captcha = newCaptcha();
      return reply.header("Set-Cookie", captcha.cookie).header("Cache-Control", "no-store").type("image/svg+xml; charset=utf-8").send(captcha.svg);
    });

    scope.get("/api/account/me", async (req, reply) => {
      const account = await accountFromCookie(req.headers.cookie);
      reply.header("Cache-Control", "no-store");
      if (!account) return sendProblem(req, reply, { status: 401, code: "unauthorized", detail: "Sign in first." });
      return reply.send(account);
    });

    scope.post("/api/account/register", async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      if (foreignOrigin(req)) return fail(req, reply, "/register", { error: "origin" });
      if (overLimit("register", String(req.ip), 5, 3600_000)) return fail(req, reply, "/register", { error: "rate" });
      const body = bodyOf(req);
      if (!checkCaptcha(req.headers.cookie, field(body, "captcha"))) return fail(req, reply, "/register", { error: "captcha" });
      const password = field(body, "password");
      if (password !== field(body, "confirm")) return fail(req, reply, "/register", { error: "password" });
      try {
        const account = await createAccount(field(body, "username"), password);
        const { token } = await createSession(account.id);
        const codes = account.recoveryCodes.join(",");
        const secure = config.siteUrl.startsWith("https://") ? "; Secure" : "";
        reply.header("Set-Cookie", [
          sessionCookie(token, SESSION_DAYS * 86400),
          `aihot_recovery=${encodeURIComponent(codes)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${secure}`,
        ]);
        if (formPost(req)) return redirectWith(reply, "/account", { welcome: "1" });
        return reply.code(201).send({ account: { id: account.id, username: account.username, createdAt: account.createdAt }, recoveryCodes: account.recoveryCodes });
      } catch (error) {
        if (error instanceof AccountError) return fail(req, reply, "/register", { error: error.code });
        throw error;
      }
    });

    scope.post("/api/account/login", async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      if (foreignOrigin(req)) return fail(req, reply, "/login", { error: "origin" });
      if (overLimit("login", String(req.ip), 10, 15 * 60_000)) return fail(req, reply, "/login", { error: "rate" });
      const body = bodyOf(req);
      const returnTo = safeReturn(body.return);
      try {
        const account = await verifyLogin(field(body, "username"), field(body, "password"));
        const { token } = await createSession(account.id);
        reply.header("Set-Cookie", sessionCookie(token, SESSION_DAYS * 86400));
        if (formPost(req)) return reply.header("Cache-Control", "no-store").redirect(returnTo, 303);
        return reply.send({ account });
      } catch (error) {
        if (error instanceof AccountError) return fail(req, reply, "/login", { error: "login", return: returnTo });
        throw error;
      }
    });

    scope.post("/api/account/logout", async (req, reply) => {
      const token = parseCookies(req.headers.cookie)[SESSION_COOKIE] ?? null;
      await endSession(token);
      reply.header("Set-Cookie", clearSessionCookie()).header("Cache-Control", "no-store");
      if (formPost(req)) return reply.redirect("/", 303);
      return reply.code(204).send();
    });

    scope.post("/api/account/recover", async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      if (foreignOrigin(req)) return fail(req, reply, "/recover", { error: "origin" });
      if (overLimit("recover", String(req.ip), 5, 15 * 60_000)) return fail(req, reply, "/recover", { error: "rate" });
      const body = bodyOf(req);
      const password = field(body, "password");
      if (password !== field(body, "confirm")) return fail(req, reply, "/recover", { error: "password" });
      try {
        await recoverAccount(field(body, "username"), field(body, "code"), password);
        if (formPost(req)) return redirectWith(reply, "/login", { reset: "1" });
        return reply.code(204).send();
      } catch (error) {
        if (error instanceof AccountError) return fail(req, reply, "/recover", { error: error.code });
        throw error;
      }
    });

    scope.get("/api/account/recovery-codes", async (req, reply) => {
      const account = await accountFromCookie(req.headers.cookie);
      reply.header("Cache-Control", "no-store");
      if (!account) return sendProblem(req, reply, { status: 401, code: "unauthorized", detail: "Sign in first." });
      const raw = parseCookies(req.headers.cookie).aihot_recovery ?? "";
      const codes = raw ? raw.split(",").filter(Boolean) : [];
      return reply.send({ codes });
    });

    scope.get("/api/account/library", async (req, reply) => {
      const account = await accountFromCookie(req.headers.cookie);
      reply.header("Cache-Control", "no-store");
      if (!account) return sendProblem(req, reply, { status: 401, code: "unauthorized", detail: "Sign in first." });
      return reply.send(await listLibrary(account));
    });

    // 登录后把浏览器里的收藏和已读并进账号；已经有的不覆盖。
    scope.post("/api/account/library/merge", async (req, reply) => {
      const account = await accountFromCookie(req.headers.cookie);
      reply.header("Cache-Control", "no-store");
      if (!account) return sendProblem(req, reply, { status: 401, code: "unauthorized", detail: "Sign in first." });
      const body = bodyOf(req) as { stars?: unknown; reads?: unknown };
      const stars = (Array.isArray(body.stars) ? body.stars : []).map(readStar).filter((star): star is LibraryStar => star !== null);
      await mergeLibrary(account, stars, readIds(body.reads));
      return reply.send(await listLibrary(account));
    });

    scope.post("/api/account/star", async (req, reply) => {
      const account = await accountFromCookie(req.headers.cookie);
      reply.header("Cache-Control", "no-store");
      if (!account) return sendProblem(req, reply, { status: 401, code: "unauthorized", detail: "Sign in first." });
      const body = bodyOf(req) as { on?: unknown; item?: unknown; id?: unknown };
      if (body.on !== true) {
        const id = typeof body.id === "string" ? body.id : (body.item && typeof body.item === "object" ? (body.item as { id?: unknown }).id : null);
        if (typeof id !== "string") return sendProblem(req, reply, { status: 400, code: "invalid_request", detail: "invalid id" });
        await unsetStar(account, id);
        return reply.code(204).send();
      }
      const star = readStar(body.item);
      if (!star) return sendProblem(req, reply, { status: 400, code: "invalid_request", detail: "invalid item" });
      await setStar(account, star, true);
      return reply.code(204).send();
    });

    scope.post("/api/account/star/meta", async (req, reply) => {
      const account = await accountFromCookie(req.headers.cookie);
      reply.header("Cache-Control", "no-store");
      if (!account) return sendProblem(req, reply, { status: 401, code: "unauthorized", detail: "Sign in first." });
      const body = bodyOf(req) as { id?: unknown; folder?: unknown; tags?: unknown; status?: unknown };
      if (typeof body.id !== "string") return sendProblem(req, reply, { status: 400, code: "invalid_request", detail: "invalid id" });
      const folder = typeof body.folder === "string" ? body.folder.trim().slice(0, 40) || null : null;
      await setStarMeta(account, body.id, folder, readTags(body.tags), readStatus(body.status));
      return reply.code(204).send();
    });

    scope.post("/api/account/read", async (req, reply) => {
      const account = await accountFromCookie(req.headers.cookie);
      reply.header("Cache-Control", "no-store");
      if (!account) return sendProblem(req, reply, { status: 401, code: "unauthorized", detail: "Sign in first." });
      await markRead(account, readIds((bodyOf(req) as { ids?: unknown }).ids));
      return reply.code(204).send();
    });

    scope.get("/api/account/note/:id", async (req, reply) => {
      const account = await accountFromCookie(req.headers.cookie);
      reply.header("Cache-Control", "no-store");
      if (!account) return sendProblem(req, reply, { status: 401, code: "unauthorized", detail: "Sign in first." });
      const id = String((req.params as { id?: string }).id ?? "");
      return reply.send({ body: await getNote(account, id) });
    });

    scope.post("/api/account/note", async (req, reply) => {
      const account = await accountFromCookie(req.headers.cookie);
      reply.header("Cache-Control", "no-store");
      if (!account) return sendProblem(req, reply, { status: 401, code: "unauthorized", detail: "Sign in first." });
      const body = bodyOf(req) as { id?: unknown; body?: unknown };
      if (typeof body.id !== "string" || typeof body.body !== "string") {
        return sendProblem(req, reply, { status: 400, code: "invalid_request", detail: "invalid note" });
      }
      await saveNote(account, body.id, body.body);
      return reply.code(204).send();
    });

    scope.get("/api/account/searches", async (req, reply) => {
      const account = await accountFromCookie(req.headers.cookie);
      reply.header("Cache-Control", "no-store");
      if (!account) return sendProblem(req, reply, { status: 401, code: "unauthorized", detail: "Sign in first." });
      return reply.send({ searches: await listSearches(account) });
    });

    scope.post("/api/account/searches", async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      if (foreignOrigin(req)) return sendProblem(req, reply, { status: 403, code: "forbidden", detail: "cross-site request" });
      const account = await accountFromCookie(req.headers.cookie);
      if (!account) return sendProblem(req, reply, { status: 401, code: "unauthorized", detail: "Sign in first." });
      const body = bodyOf(req) as { name?: unknown; query?: unknown; filters?: unknown };
      return reply.code(201).send({ search: await createSearch(account, body) });
    });

    scope.post("/api/account/searches/update", async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      if (foreignOrigin(req)) return sendProblem(req, reply, { status: 403, code: "forbidden", detail: "cross-site request" });
      const account = await accountFromCookie(req.headers.cookie);
      if (!account) return sendProblem(req, reply, { status: 401, code: "unauthorized", detail: "Sign in first." });
      const body = bodyOf(req) as { id?: unknown; name?: unknown };
      if (typeof body.id !== "string") return sendProblem(req, reply, { status: 400, code: "invalid_request", detail: "invalid id" });
      await renameSearch(account, body.id, body.name);
      return reply.code(204).send();
    });

    scope.post("/api/account/searches/delete", async (req, reply) => {
      if (foreignOrigin(req)) return sendProblem(req, reply, { status: 403, code: "forbidden", detail: "cross-site request" });
      const account = await accountFromCookie(req.headers.cookie);
      reply.header("Cache-Control", "no-store");
      if (!account) return sendProblem(req, reply, { status: 401, code: "unauthorized", detail: "Sign in first." });
      const body = bodyOf(req) as { id?: unknown };
      if (typeof body.id !== "string") return sendProblem(req, reply, { status: 400, code: "invalid_request", detail: "invalid id" });
      await deleteSearch(account, body.id);
      return reply.code(204).send();
    });

    scope.post("/api/account/delete", async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      if (foreignOrigin(req)) return fail(req, reply, "/account", { error: "origin" });
      const account = await accountFromCookie(req.headers.cookie);
      if (!account) return sendProblem(req, reply, { status: 401, code: "unauthorized", detail: "Sign in first." });
      await deleteAccount(account.id);
      reply.header("Set-Cookie", clearSessionCookie());
      if (formPost(req)) return reply.redirect("/", 303);
      return reply.code(204).send();
    });
  });
}
