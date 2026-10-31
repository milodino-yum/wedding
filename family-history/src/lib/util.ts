const enc = new TextEncoder();

export const now = () => Math.floor(Date.now() / 1000);
export const DAY = 86_400;

export function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Cryptographically random, URL-safe string. 32 bytes = 256 bits. */
export function randomToken(bytes = 32): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return base64url(b);
}

export async function sha256(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return base64url(new Uint8Array(digest));
}

/** 16-character random id for database rows. */
export const newId = () => randomToken(12);

// No 0/O, 1/I/L: invite codes get read off Christmas cards.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function newInviteCode(): string {
  const out: string[] = [];
  const limit = 256 - (256 % CODE_ALPHABET.length); // rejection sampling, no bias
  while (out.length < 8) {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    for (const x of b) {
      if (x < limit && out.length < 8) out.push(CODE_ALPHABET[x % CODE_ALPHABET.length]!);
    }
  }
  return `${out.slice(0, 4).join("")}-${out.slice(4).join("")}`;
}

/** Accepts "k7qm 4xrt", "K7QM4XRT", "k7qm-4xrt" etc. Returns "K7QM-4XRT" or null. */
export function normalizeInviteCode(input: string): string | null {
  const s = input.toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (s.length !== 8) return null;
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const e = input.trim().toLowerCase();
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  return e;
}

/** Trimmed string field from a form, capped in length; empty becomes null. */
export function field(form: Record<string, unknown>, name: string, max: number): string | null {
  const v = form[name];
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, max);
  return t.length ? t : null;
}

export function adminEmails(env: { ADMIN_EMAILS?: string }): Set<string> {
  return new Set(
    (env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Only allow same-site relative redirects ("/people/abc"), never "//evil.com". */
export function safeNext(next: unknown): string {
  if (typeof next !== "string") return "/";
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}
