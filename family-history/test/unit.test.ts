import { afterEach, describe, expect, it, vi } from "vitest";
import { prettyDate, lifeSpan } from "../src/db";
import { sendEmail, signInEmail } from "../src/email";
import { newInviteCode, normalizeEmail, normalizeInviteCode, safeNext } from "../src/lib/util";
import type { Env } from "../src/types";

describe("helpers", () => {
  it("normalizes invite codes", () => {
    expect(normalizeInviteCode("k7qm 4xrt")).toBe("K7QM-4XRT");
    expect(normalizeInviteCode("K7QM-4XRT")).toBe("K7QM-4XRT");
    expect(normalizeInviteCode("K7QM")).toBeNull();
    for (let i = 0; i < 50; i++) expect(normalizeInviteCode(newInviteCode())).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
  });

  it("normalizes emails", () => {
    expect(normalizeEmail("  Ruth@Example.COM ")).toBe("ruth@example.com");
    expect(normalizeEmail("not an email")).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
  });

  it("only redirects within the site", () => {
    expect(safeNext("/people/abc?x=1")).toBe("/people/abc?x=1");
    expect(safeNext("//evil.com")).toBe("/");
    expect(safeNext("/\\evil.com")).toBe("/");
    expect(safeNext("https://evil.com")).toBe("/");
  });

  it("formats GEDCOM dates for people", () => {
    expect(prettyDate("ABT 1861")).toBe("About 1861");
    expect(prettyDate("19 JUN 1884")).toBe("19 Jun 1884");
    expect(prettyDate("BET 1880 AND 1885")).toBe("Between 1880 and 1885");
    expect(prettyDate("AUG 1906", { capitalize: false })).toBe("Aug 1906");
    expect(prettyDate("BEF 1900", { capitalize: false })).toBe("before 1900");
    expect(lifeSpan({ birth_year: 1884, death_year: 1962, is_living: 0 })).toBe("1884–1962");
    expect(lifeSpan({ birth_year: 1964, death_year: null, is_living: 1 })).toBe("b. 1964");
  });
});

describe("email", () => {
  afterEach(() => vi.restoreAllMocks());

  it("sends through Resend when a key is configured", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const env = { RESEND_API_KEY: "re_test", EMAIL_FROM: "Family <stories@family.test>" } as Env;
    await sendEmail(env, signInEmail({ siteName: "Our <Family>", to: "ruth@example.com", link: "https://family.test/auth/verify?token=abc", name: "Ruth", isNew: true }));
    expect(spy).toHaveBeenCalledOnce();
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer re_test");
    const body = JSON.parse(init!.body as string);
    expect(body.to).toEqual(["ruth@example.com"]);
    expect(body.subject).toBe("Welcome to Our <Family>");
    expect(body.html).toContain("Our &lt;Family&gt;");
    expect(body.text).toContain("https://family.test/auth/verify?token=abc");
  });

  it("reports Resend failures", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("domain not verified", { status: 403 }));
    const env = { RESEND_API_KEY: "re_test", EMAIL_FROM: "x@family.test" } as Env;
    await expect(sendEmail(env, { to: "a@b.c", subject: "s", text: "t", html: "h" })).rejects.toThrow(/403/);
  });
});
