import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import type { AppEnv, Ctx, Env, User } from "./types";
import { DAY, newId, now, randomToken, sha256 } from "./lib/util";

const SESSION_TTL = 180 * DAY; // relatives shouldn't have to sign in often
const SESSION_RENEW_BELOW = 90 * DAY; // sliding: extend when less than this remains
const LOGIN_TOKEN_TTL = 60 * 60; // one hour to find the email and click
const MAX_LINKS_PER_HOUR = 5;

/** `__Host-` cookies must be Secure, which plain-http localhost can't do. */
function cookieName(c: Ctx) {
  return new URL(c.req.url).protocol === "https:" ? "__Host-session" : "session";
}

function setSessionCookie(c: Ctx, token: string) {
  setCookie(c, cookieName(c), token, {
    path: "/",
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    maxAge: SESSION_TTL,
  });
}

export async function createSession(c: Ctx, userId: string) {
  const token = randomToken();
  const t = now();
  await c.env.DB.prepare("INSERT INTO sessions (id_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256(token), userId, t, t + SESSION_TTL)
    .run();
  setSessionCookie(c, token);
}

export async function destroySession(c: Ctx) {
  const token = getCookie(c, cookieName(c));
  if (token) {
    await c.env.DB.prepare("DELETE FROM sessions WHERE id_hash = ?").bind(await sha256(token)).run();
  }
  deleteCookie(c, cookieName(c), { path: "/", secure: new URL(c.req.url).protocol === "https:" });
}

/** Loads the signed-in user (or null) into c.var.user on every request. */
export const loadUser = createMiddleware<AppEnv>(async (c, next) => {
  c.set("user", null);
  const token = getCookie(c, cookieName(c));
  if (token) {
    const idHash = await sha256(token);
    const t = now();
    const row = await c.env.DB.prepare(
      `SELECT u.*, s.expires_at AS session_expires_at
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.id_hash = ? AND s.expires_at > ?`,
    )
      .bind(idHash, t)
      .first<User & { session_expires_at: number }>();
    if (row) {
      const { session_expires_at, ...user } = row;
      c.set("user", user);
      if (session_expires_at - t < SESSION_RENEW_BELOW) {
        await c.env.DB.prepare("UPDATE sessions SET expires_at = ? WHERE id_hash = ?").bind(t + SESSION_TTL, idHash).run();
        setSessionCookie(c, token);
      }
      if (!user.last_seen_at || t - user.last_seen_at > 3600) {
        await c.env.DB.prepare("UPDATE users SET last_seen_at = ? WHERE id = ?").bind(t, user.id).run();
      }
    }
  }
  await next();
});

export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get("user")) {
    const url = new URL(c.req.url);
    return c.redirect(`/signin?next=${encodeURIComponent(url.pathname + url.search)}`);
  }
  await next();
});

export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.get("user");
  if (!user) return c.redirect("/signin");
  if (user.role !== "admin") return c.text("Only family admins can see this page.", 403);
  await next();
});

// ---------------------------------------------------------------------------
// One-time email links
// ---------------------------------------------------------------------------

export type SignupPayload = { display_name: string; relationship: string | null; invite_id: string };
export type SigninPayload = { next?: string };

export type IssueResult = { ok: true; token: string } | { ok: false; reason: "rate_limited" };

export async function issueLoginToken(
  env: Env,
  email: string,
  purpose: "signin" | "signup",
  payload: SignupPayload | SigninPayload,
): Promise<IssueResult> {
  const t = now();
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM login_tokens WHERE email = ? AND created_at > ?")
    .bind(email, t - 3600)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= MAX_LINKS_PER_HOUR) return { ok: false, reason: "rate_limited" };

  const token = randomToken();
  await env.DB.prepare(
    "INSERT INTO login_tokens (token_hash, email, purpose, payload, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(await sha256(token), email, purpose, JSON.stringify(payload), t, t + LOGIN_TOKEN_TTL)
    .run();
  return { ok: true, token };
}

export type ConsumedToken = {
  email: string;
  purpose: "signin" | "signup";
  payload: SignupPayload | SigninPayload;
};

/** Marks the token used and returns it, or null if unknown/expired/already used. */
export async function consumeLoginToken(env: Env, token: string): Promise<ConsumedToken | null> {
  const t = now();
  const row = await env.DB.prepare(
    `UPDATE login_tokens SET used_at = ?
      WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?
      RETURNING email, purpose, payload`,
  )
    .bind(t, await sha256(token), t)
    .first<{ email: string; purpose: "signin" | "signup"; payload: string | null }>();
  if (!row) return null;
  return { email: row.email, purpose: row.purpose, payload: row.payload ? JSON.parse(row.payload) : {} };
}

export async function createUser(
  env: Env,
  u: { email: string; display_name: string; relationship?: string | null; role: "member" | "admin"; invite_id?: string | null },
): Promise<User> {
  const user = await env.DB.prepare(
    `INSERT INTO users (id, email, display_name, relationship, role, invite_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(newId(), u.email, u.display_name, u.relationship ?? null, u.role, u.invite_id ?? null, now())
    .first<User>();
  if (!user) throw new Error("Failed to create user");
  return user;
}
