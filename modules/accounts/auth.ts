// 读者账号的后端：用户名 + 密码（scrypt 哈希）、不透明的登录会话（库里只存哈希）、恢复码和验证码。
// 与后台管理员的那套（admin/auth.ts）分开：读者不是管理员，两边的 Cookie 也不共用。
import { createHash, createHmac, randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { config, credential } from "@aihot/backend/config";
import { sql } from "@aihot/backend/db";
import { newArticleId, newShortId, sha256 } from "@aihot/backend/lib/ids";

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>;

/** 登录 Cookie 的名字和有效期（天）。 */
export const SESSION_COOKIE = "aihot_account";
export const SESSION_DAYS = 30;
/** 验证码 Cookie 的名字和有效期（秒）。 */
export const CAPTCHA_COOKIE = "aihot_captcha";
export const CAPTCHA_SECONDS = 10 * 60;

const SCRYPT = { N: 16384, r: 8, p: 1 };

/** 一个账号对外能看到的字段。 */
export interface AccountPublic {
  id: string;
  username: string;
  createdAt: string;
}

/** 注册、登录、找回的失败原因；路由把它翻成页面上的提示。 */
export class AccountError extends Error {
  readonly code: "username" | "password" | "username_taken" | "login" | "recover" | "captcha" | "origin";
  constructor(code: "username" | "password" | "username_taken" | "login" | "recover" | "captcha" | "origin") {
    super(code);
    this.code = code;
  }
}

export function normalizeUsername(value: string): string {
  return value.normalize("NFKC").trim();
}

const usernameKey = (username: string) => normalizeUsername(username).toLowerCase();

/** 3–20 个字母、数字、下划线或连字符（中文等文字也算字母）。 */
export function checkUsername(username: string): string {
  const value = normalizeUsername(username);
  if (!/^[\p{L}\p{N}_-]{3,20}$/u.test(value)) throw new AccountError("username");
  return value;
}

/** 至少 8 位，最多 200 位；不设字符种类要求，长口令本身就够。 */
export function checkPassword(password: string): string {
  if (password.length < 8 || password.length > 200) throw new AccountError("password");
  return password;
}

/** `scrypt$N$r$p$salt$hash`：参数一起存，以后换参数时旧密码还能验证。 */
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, salt, key] = parts as [string, string, string, string, string, string];
  const expected = Buffer.from(key, "base64url");
  const actual = await scrypt(password, Buffer.from(salt, "base64url"), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** 恢复码：`XXXX-XXXX`，去掉了容易看混的 0/O/1/I。 */
function newRecoveryCode(): string {
  const pick = () => Array.from({ length: 4 }, () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)]).join("");
  return `${pick()}-${pick()}`;
}

/** 用户抄写的恢复码在比较前统一成大写、去掉空格和连字符。 */
export const normalizeRecoveryCode = (value: string) => value.toUpperCase().replace(/[\s-]/g, "");

/** 恢复码只存哈希；返回的明文只在注册成功那一屏出现一次。 */
export async function issueRecoveryCodes(accountId: string): Promise<string[]> {
  const codes = Array.from({ length: 10 }, newRecoveryCode);
  await sql`INSERT INTO account_recovery_codes ${sql(codes.map((code) => ({ account_id: accountId, code_hash: sha256(normalizeRecoveryCode(code)) })))}`;
  return codes;
}

export interface CreatedAccount extends AccountPublic {
  recoveryCodes: string[];
}

/** 建一个账号，同时发十串恢复码。用户名不区分大小写地唯一。 */
export async function createAccount(username: string, password: string): Promise<CreatedAccount> {
  const name = checkUsername(username);
  checkPassword(password);
  const id = newArticleId();
  const hash = await hashPassword(password);
  try {
    await sql`INSERT INTO accounts (id, username, username_key, password_hash) VALUES (${id}, ${name}, ${usernameKey(name)}, ${hash})`;
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new AccountError("username_taken");
    throw error;
  }
  return { id, username: name, createdAt: new Date().toISOString(), recoveryCodes: await issueRecoveryCodes(id) };
}

/** 登录成功后的会话；Cookie 里放明文 token，库里只存它的哈希。 */
export async function createSession(accountId: string): Promise<{ token: string; expires: Date }> {
  const token = newShortId(32);
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await sql`INSERT INTO account_sessions (token_hash, account_id, expires_at) VALUES (${sha256(token)}, ${accountId}, ${expires})`;
  return { token, expires };
}

export async function endSession(token: string | null | undefined): Promise<void> {
  if (!token) return;
  await sql`DELETE FROM account_sessions WHERE token_hash = ${sha256(token)}`;
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const at = part.indexOf("=");
    if (at < 0) continue;
    const name = part.slice(0, at).trim();
    if (!name) continue;
    try {
      out[name] = decodeURIComponent(part.slice(at + 1).trim());
    } catch {
      // A malformed value is not this cookie.
    }
  }
  return out;
}

/** 请求里的登录会话，过期或没有就是 null。 */
export async function accountFromCookie(header: string | undefined): Promise<AccountPublic | null> {
  const token = parseCookies(header)[SESSION_COOKIE];
  if (!token) return null;
  const [row] = await sql<{ id: string; username: string; created_at: Date }[]>`
    SELECT a.id, a.username, a.created_at
    FROM account_sessions s JOIN accounts a ON a.id = s.account_id
    WHERE s.token_hash = ${sha256(token)} AND s.expires_at > now()`;
  return row ? { id: row.id, username: row.username, createdAt: row.created_at.toISOString() } : null;
}

/** 登录校验；密码不对和账号不存在给同一个错误，不告诉对方用户名是否存在。 */
export async function verifyLogin(username: string, password: string): Promise<AccountPublic> {
  const [row] = await sql<{ id: string; username: string; password_hash: string; created_at: Date }[]>`
    SELECT id, username, password_hash, created_at FROM accounts WHERE username_key = ${usernameKey(username)}`;
  if (!row || !(await verifyPassword(password, row.password_hash))) throw new AccountError("login");
  await sql`UPDATE accounts SET last_login_at = now() WHERE id = ${row.id}`;
  return { id: row.id, username: row.username, createdAt: row.created_at.toISOString() };
}

/** 用一串恢复码重置密码；这串码只能用一次，其他会话全部作废。 */
export async function recoverAccount(username: string, code: string, password: string): Promise<void> {
  checkPassword(password);
  const [account] = await sql<{ id: string }[]>`SELECT id FROM accounts WHERE username_key = ${usernameKey(username)}`;
  if (!account) throw new AccountError("recover");
  const [used] = await sql<{ code_hash: string }[]>`
    UPDATE account_recovery_codes SET used_at = now()
    WHERE account_id = ${account.id} AND code_hash = ${sha256(normalizeRecoveryCode(code))} AND used_at IS NULL
    RETURNING code_hash`;
  if (!used) throw new AccountError("recover");
  await sql`UPDATE accounts SET password_hash = ${await hashPassword(password)} WHERE id = ${account.id}`;
  await sql`DELETE FROM account_sessions WHERE account_id = ${account.id}`;
}

/** 注销即删：会话和恢复码随外键一起删掉，之后同名的账号是全新的一个。 */
export async function deleteAccount(accountId: string): Promise<void> {
  await sql`DELETE FROM accounts WHERE id = ${accountId}`;
}

/** Cookie 属性：HTTPS 时加 Secure；HttpOnly 和 SameSite=Lax 防止脚本读取和跨站提交。 */
export function sessionCookie(token: string, maxAge: number): string {
  const secure = config.siteUrl.startsWith("https://") ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearSessionCookie(): string {
  return sessionCookie("", 0);
}

function secret(): string {
  const value = credential("auth", "SESSION_SECRET");
  if (!value) throw new Error("SESSION_SECRET is not configured");
  return value;
}

const captchaSignature = (issued: number, code: string) => createHmac("sha256", secret()).update(`${issued}:${code}`).digest("base64url");

export interface Captcha {
  /** 给 `<img src="/api/account/captcha">` 的 SVG 图片。 */
  svg: string;
  /** 验证码的 Cookie：答案在里面，但不是明文给页面脚本的。 */
  cookie: string;
}

/** 四字符的图形验证码；答案签在 HttpOnly Cookie 里，注册时比对。 */
export function newCaptcha(): Captcha {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const code = Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join("");
  const chars = [...code].map((ch, i) => {
    const x = 16 + i * 26;
    const y = 34 + randomInt(-4, 4);
    const rotate = randomInt(-14, 14);
    const color = ["#3b4a5a", "#7a4a2a", "#2f5d50", "#5a3a6a"][randomInt(4)];
    return `<text x="${x}" y="${y}" font-family="ui-monospace,monospace" font-size="26" font-weight="600" fill="${color}" transform="rotate(${rotate} ${x} ${y})">${ch}</text>`;
  }).join("");
  const lines = Array.from({ length: 4 }, () => {
    const x1 = randomInt(0, 128), y1 = randomInt(0, 48), x2 = randomInt(0, 128), y2 = randomInt(0, 48);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#b8c2cc" stroke-width="1" />`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="48" viewBox="0 0 128 48" role="img" aria-label="验证码"><rect width="128" height="48" rx="8" fill="#f1f4f7"/>${lines}${chars}</svg>`;
  const issued = Date.now();
  const token = `${issued}.${code}.${captchaSignature(issued, code)}`;
  const secure = config.siteUrl.startsWith("https://") ? "; Secure" : "";
  return { svg, cookie: `${CAPTCHA_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${CAPTCHA_SECONDS}${secure}` };
}

/** 用户填的验证码对不对：十分钟内、签名对得上、忽略大小写。 */
export function checkCaptcha(cookieHeader: string | undefined, answer: string): boolean {
  const raw = parseCookies(cookieHeader)[CAPTCHA_COOKIE];
  if (!raw) return false;
  const [issuedText, code, signature] = raw.split(".");
  if (!issuedText || !code || !signature) return false;
  const issued = Number(issuedText);
  if (!Number.isFinite(issued) || Date.now() - issued > CAPTCHA_SECONDS * 1000) return false;
  const expected = Buffer.from(captchaSignature(issued, code));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  const typed = answer.trim().toUpperCase();
  return typed.length === code.length && Buffer.from(typed).equals(Buffer.from(code));
}

