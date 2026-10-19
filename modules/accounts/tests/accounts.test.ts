// 读者账号：验证码注册、会话、登录失败、恢复码重置和注销即删。
import { tag } from "../../../tests/setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { installModules } from "@aihot/backend/modules";
import { closeDb } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { buildApp } from "../../../apps/api/src/app.ts";
import accounts from "../server.ts";

const T = tag();
installModules([accounts]);
const app = await buildApp();

after(async () => {
  await app.close();
  await stopBoss();
  await closeDb();
});

/** 一张验证码：图片给浏览器，答案在 HttpOnly Cookie 里，测试从 Cookie 里读出来。 */
async function captcha(): Promise<{ cookie: string; code: string }> {
  const res = await app.inject({ method: "GET", url: "/api/account/captcha" });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers["content-type"] as string, /image\/svg\+xml/);
  const cookie = String(res.headers["set-cookie"]).split(";")[0]!;
  const code = decodeURIComponent(cookie.slice(cookie.indexOf("=") + 1)).split(".")[1]!;
  return { cookie, code };
}

const post = (url: string, body: unknown, cookie?: string) =>
  app.inject({ method: "POST", url, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, payload: JSON.stringify(body) });

/** 响应里 aihot_account 那一条 Cookie；注册还会同时发恢复码的 Cookie。 */
function sessionOf(res: { headers: Record<string, unknown> }): string {
  const header = Array.isArray(res.headers["set-cookie"]) ? res.headers["set-cookie"].join(",") : String(res.headers["set-cookie"] ?? "");
  const match = /aihot_account=([^;,\s]+)/.exec(header);
  return match ? `aihot_account=${match[1]}` : "";
}

const username = `reader_${T}`;
let recoveryCodes: string[] = [];

test("验证码注册、会话和重复用户名", async () => {
  const { cookie, code } = await captcha();
  const res = await post("/api/account/register", { username, password: "secret-pass-123", confirm: "secret-pass-123", captcha: code }, cookie);
  assert.equal(res.statusCode, 201, res.body);
  const body = JSON.parse(res.body);
  assert.equal(body.account.username, username);
  assert.equal(body.recoveryCodes.length, 10);
  recoveryCodes = body.recoveryCodes;

  const session = sessionOf(res);
  const me = await app.inject({ method: "GET", url: "/api/account/me", headers: { cookie: session } });
  assert.equal(me.statusCode, 200);
  assert.equal(JSON.parse(me.body).username, username);

  const again = await captcha();
  const duplicate = await post("/api/account/register", { username: username.toUpperCase(), password: "secret-pass-123", confirm: "secret-pass-123", captcha: again.code }, again.cookie);
  assert.equal(duplicate.statusCode, 400);
});

test("密码不对不登录，也不透露用户名是否存在", async () => {
  const wrong = await post("/api/account/login", { username, password: "not-the-password" });
  assert.equal(wrong.statusCode, 400);
  const missing = await post("/api/account/login", { username: `nobody_${T}`, password: "whatever-123" });
  assert.equal(missing.statusCode, 400);
  assert.equal(JSON.parse(wrong.body).detail, JSON.parse(missing.body).detail);
});

test("恢复码重置密码并让旧会话失效；注销立即删除", async () => {
  const login = await post("/api/account/login", { username, password: "secret-pass-123" });
  assert.equal(login.statusCode, 200);
  const oldSession = sessionOf(login);
  assert.equal((await app.inject({ method: "GET", url: "/api/account/me", headers: { cookie: oldSession } })).statusCode, 200);

  const recovered = await post("/api/account/recover", { username, code: recoveryCodes[0], password: "another-pass-456", confirm: "another-pass-456" });
  assert.equal(recovered.statusCode, 204, recovered.body);
  assert.equal((await app.inject({ method: "GET", url: "/api/account/me", headers: { cookie: oldSession } })).statusCode, 401, "旧会话随重置退出");

  const relogin = await post("/api/account/login", { username, password: "another-pass-456" });
  assert.equal(relogin.statusCode, 200);
  const session = sessionOf(relogin);
  const deleted = await post("/api/account/delete", {}, session);
  assert.equal(deleted.statusCode, 204);
  assert.equal((await app.inject({ method: "GET", url: "/api/account/me", headers: { cookie: session } })).statusCode, 401);
});

test("收藏与已读按账号存取：登录后合并本地记录，取消收藏只删一条", async () => {
  const { cookie, code } = await captcha();
  const name = `lib_${T.slice(0, 8)}`;
  const reg = await post("/api/account/register", { username: name, password: "library-pass-123", confirm: "library-pass-123", captcha: code }, cookie);
  assert.equal(reg.statusCode, 201, reg.body);
  const session = sessionOf(reg);
  const star = {
    id: "sije7sy2hprebjiicsqadnlm2", title: "富氢天然气燃烧用多模式超低 NOX 燃烧器", summary: "问题：…",
    sourceName: "Fuel", savedAt: new Date().toISOString(), publishedAt: null, score: 80, aiSelected: true,
    folder: "毕业论文", tags: ["遥感", "综述"], status: "saved",
  };

  assert.equal((await post("/api/account/star", { on: true, item: star }, session)).statusCode, 204);
  assert.equal((await post("/api/account/read", { ids: [star.id, "another-id"] }, session)).statusCode, 204);
  let library = JSON.parse((await app.inject({ method: "GET", url: "/api/account/library", headers: { cookie: session } })).body);
  assert.equal(library.stars.length, 1);
  assert.equal(library.stars[0].title, star.title);
  assert.equal(library.stars[0].folder, "毕业论文");
  assert.deepEqual(library.stars[0].tags, ["遥感", "综述"]);
  assert.equal(library.stars[0].status, "saved");
  assert.deepEqual([...library.reads].sort(), ["another-id", star.id].sort(), "两篇都记下了");

  const merged = await post("/api/account/library/merge", { stars: [{ ...star, id: "second-id", title: "第二篇" }], reads: ["third-id"] }, session);
  assert.equal(merged.statusCode, 200);
  library = JSON.parse(merged.body);
  assert.equal(library.stars.length, 2, "同一篇不会重复");
  assert.equal(library.reads.length, 3);

  assert.equal((await post("/api/account/star/meta", { id: star.id, folder: "开题", tags: ["SAR", "方法"], status: "reading" }, session)).statusCode, 204);
  library = JSON.parse((await app.inject({ method: "GET", url: "/api/account/library", headers: { cookie: session } })).body);
  assert.equal(library.stars.find((s: { id: string }) => s.id === star.id).folder, "开题");
  assert.equal(library.stars.find((s: { id: string }) => s.id === star.id).status, "reading");

  assert.equal((await post("/api/account/star", { on: false, id: star.id }, session)).statusCode, 204);
  library = JSON.parse((await app.inject({ method: "GET", url: "/api/account/library", headers: { cookie: session } })).body);
  assert.deepEqual(library.stars.map((s: { id: string }) => s.id), ["second-id"]);

  assert.equal((await post("/api/account/delete", {}, session)).statusCode, 204);
});

test("订阅：保存搜索、RSS 可读、删除后地址失效", async () => {
  const { cookie, code } = await captcha();
  const name = `sub_${T.slice(0, 8)}`;
  const reg = await post("/api/account/register", { username: name, password: "sub-pass-123", confirm: "sub-pass-123", captcha: code }, cookie);
  assert.equal(reg.statusCode, 201, reg.body);
  const session = sessionOf(reg);

  const created = await post("/api/account/searches", { name: "遥感论文", query: "遥感", filters: { category: "rs", kind: "paper" } }, session);
  assert.equal(created.statusCode, 201, created.body);
  const search = JSON.parse(created.body).search;
  assert.equal(search.name, "遥感论文");
  assert.equal(search.filters.category, "rs");
  assert.match(search.feedUrl, /\/feed\/search\/[\w-]+\.xml$/);

  const path = new URL(search.feedUrl).pathname;
  const feed = await app.inject({ method: "GET", url: path });
  assert.equal(feed.statusCode, 200);
  assert.match(String(feed.headers["content-type"]), /application\/rss\+xml/);
  assert.match(feed.body, /<rss version="2.0"/);

  const list = await app.inject({ method: "GET", url: "/api/account/searches", headers: { cookie: session } });
  assert.equal(JSON.parse(list.body).searches.length, 1);

  assert.equal((await post("/api/account/searches/update", { id: search.id, name: "改名后的订阅" }, session)).statusCode, 204);
  const renamed = JSON.parse((await app.inject({ method: "GET", url: "/api/account/searches", headers: { cookie: session } })).body);
  assert.equal(renamed.searches[0].name, "改名后的订阅");

  assert.equal((await post("/api/account/searches/delete", { id: search.id }, session)).statusCode, 204);
  assert.equal((await app.inject({ method: "GET", url: path })).statusCode, 404);
});

test("笔记按篇保存，留空即删除；没登录读不到", async () => {
  const { cookie, code } = await captcha();
  const name = `note_${T.slice(0, 8)}`;
  const reg = await post("/api/account/register", { username: name, password: "note-pass-123", confirm: "note-pass-123", captcha: code }, cookie);
  assert.equal(reg.statusCode, 201, reg.body);
  const session = sessionOf(reg);
  const id = "sije7sy2hprebjiicsqadnlm2";

  assert.equal((await post("/api/account/note", { id, body: "我的第一条笔记" }, session)).statusCode, 204);
  let note = await app.inject({ method: "GET", url: `/api/account/note/${id}`, headers: { cookie: session } });
  assert.equal(JSON.parse(note.body).body, "我的第一条笔记");

  assert.equal((await post("/api/account/note", { id, body: "" }, session)).statusCode, 204);
  note = await app.inject({ method: "GET", url: `/api/account/note/${id}`, headers: { cookie: session } });
  assert.equal(JSON.parse(note.body).body, null);

  assert.equal((await app.inject({ method: "GET", url: `/api/account/note/${id}` })).statusCode, 401);
  assert.equal((await post("/api/account/delete", {}, session)).statusCode, 204);
});

