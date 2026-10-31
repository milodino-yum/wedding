import { env, SELF } from "cloudflare:test";

export const ORIGIN = "https://family.test";
let counter = 0;
export const uniqueEmail = (prefix = "user") => `${prefix}-${Date.now()}-${++counter}@example.com`;

/** A tiny cookie-keeping client, like one browser. */
export class Browser {
  cookies = new Map<string, string>();

  async fetch(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    if (this.cookies.size) headers.set("Cookie", [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "));
    if (init.method === "POST" && !headers.has("Origin")) headers.set("Origin", ORIGIN);
    const res = await SELF.fetch(ORIGIN + path, { ...init, headers, redirect: "manual" });
    for (const sc of res.headers.getSetCookie()) {
      const [pair = ""] = sc.split(";");
      const i = pair.indexOf("=");
      const name = pair.slice(0, i);
      const value = pair.slice(i + 1);
      if (!value || /max-age=0/i.test(sc)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    return res;
  }

  postJson(path: string, data: unknown) {
    return this.fetch(path, { method: "POST", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } });
  }

  post(path: string, data: Record<string, string>, headers: Record<string, string> = {}) {
    return this.fetch(path, {
      method: "POST",
      body: new URLSearchParams(data),
      headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers },
    });
  }
}

/** Pulls the development-mode sign-in link out of a "check your email" page. */
export function devToken(html: string): string | null {
  const m = html.match(/href="https:\/\/family\.test\/auth\/verify\?token=([A-Za-z0-9_-]+)"/);
  return m ? m[1]! : null;
}

export async function signIn(b: Browser, email: string) {
  const res = await b.post("/signin", { email });
  const token = devToken(await res.text());
  if (!token) throw new Error(`no sign-in link issued for ${email}`);
  const verify = await b.post("/auth/verify", { token });
  if (verify.status !== 302) throw new Error(`verify failed: ${verify.status}`);
  return verify;
}

export async function createMember(role: "member" | "admin" = "member", name = "Test Person") {
  const email = uniqueEmail(role);
  const id = `u-${crypto.randomUUID()}`;
  await env.DB.prepare("INSERT INTO users (id, email, display_name, role, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id, email, name, role, Math.floor(Date.now() / 1000))
    .run();
  const b = new Browser();
  await signIn(b, email);
  return { id, email, b };
}

export async function createPerson(fields: { given?: string; surname?: string; living?: boolean } = {}) {
  const id = `p-${crypto.randomUUID()}`;
  await env.DB.prepare(
    "INSERT INTO persons (id, given_names, surname, is_living, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 0)",
  )
    .bind(id, fields.given ?? "Margaret", fields.surname ?? "Ashworth", fields.living ? 1 : 0)
    .run();
  return id;
}

export async function createInvite(opts: { maxUses?: number | null; expiresAt?: number | null; revoked?: boolean } = {}) {
  const id = `i-${crypto.randomUUID()}`;
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const pick = () => alphabet[Math.floor(Math.random() * alphabet.length)];
  const code = `${Array.from({ length: 4 }, pick).join("")}-${Array.from({ length: 4 }, pick).join("")}`;
  await env.DB.prepare(
    "INSERT INTO invites (id, code, max_uses, expires_at, created_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(id, code, opts.maxUses === undefined ? 1 : opts.maxUses, opts.expiresAt ?? null, 0, opts.revoked ? 1 : null)
    .run();
  return { id, code };
}
