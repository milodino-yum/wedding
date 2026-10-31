import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { Browser, createInvite, createMember, createPerson, devToken, signIn, uniqueEmail } from "./helpers";

describe("privacy", () => {
  it("shows only the landing page to visitors", async () => {
    const b = new Browser();
    const home = await b.fetch("/");
    expect(home.status).toBe(200);
    expect(home.headers.get("X-Robots-Tag")).toContain("noindex");
    const html = await home.text();
    expect(html).toContain("Sign in");
    expect(html).not.toContain("Latest stories");

    for (const path of ["/people", "/people/anyone", "/family", "/me", "/members/x", "/anecdotes/x/edit"]) {
      const res = await b.fetch(path);
      expect(res.status, path).toBe(302);
      expect(res.headers.get("Location"), path).toMatch(/^\/signin\?next=/);
    }
  });

  it("keeps the admin page from members", async () => {
    const { b } = await createMember("member");
    expect((await b.fetch("/admin")).status).toBe(403);
    expect((await b.post("/admin/invites", { label: "x" })).status).toBe(403);
  });

  it("rejects form posts from other websites", async () => {
    const { b } = await createMember("member");
    const person = await createPerson();
    const res = await b.post(`/people/${person}/anecdotes`, { body: "forged" }, { Origin: "https://evil.example" });
    expect(res.status).toBe(403);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM anecdotes WHERE person_id = ?").bind(person).first<{ n: number }>();
    expect(n?.n).toBe(0);
  });
});

describe("signing in", () => {
  it("lets a configured admin bootstrap the site without an invite", async () => {
    const b = new Browser();
    const verify = await signIn(b, "Bootstrap-Admin@Example.com ");
    expect(verify.headers.get("Location")).toBe("/me?notice=welcome");
    expect([...b.cookies.keys()]).toEqual(["__Host-session"]);
    const user = await env.DB.prepare("SELECT role FROM users WHERE email = ?").bind("bootstrap-admin@example.com").first<{ role: string }>();
    expect(user?.role).toBe("admin");
    expect((await b.fetch("/admin")).status).toBe(200);
  });

  it("sets a secure, http-only session cookie and stores only its hash", async () => {
    const email = uniqueEmail();
    await env.DB.prepare("INSERT INTO users (id, email, display_name, created_at) VALUES ('u-cookie', ?, 'C', 0)").bind(email).run();
    const b = new Browser();
    const res = await b.post("/signin", { email });
    const token = devToken(await res.text())!;
    const verify = await b.post("/auth/verify", { token });
    const cookie = verify.headers.getSetCookie().join("\n");
    expect(cookie).toMatch(/__Host-session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    const raw = b.cookies.get("__Host-session")!;
    const stored = await env.DB.prepare("SELECT COUNT(*) AS n FROM sessions WHERE id_hash = ?").bind(raw).first<{ n: number }>();
    expect(stored?.n).toBe(0);
  });

  it("gives the same answer for unknown addresses and sends no link", async () => {
    const b = new Browser();
    const res = await b.post("/signin", { email: uniqueEmail("stranger") });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Check your email");
    expect(devToken(html)).toBeNull();
  });

  it("does not use up the link when the email is merely opened (GET)", async () => {
    const email = uniqueEmail();
    await env.DB.prepare("INSERT INTO users (id, email, display_name, created_at) VALUES ('u-scan', ?, 'S', 0)").bind(email).run();
    const b = new Browser();
    const token = devToken(await (await b.post("/signin", { email })).text())!;

    // An email scanner follows the link first.
    const scanned = await new Browser().fetch(`/auth/verify?token=${token}`);
    expect(scanned.status).toBe(200);
    expect(scanned.headers.get("Referrer-Policy")).toBe("same-origin");

    // The person can still use it, but only once.
    expect((await b.post("/auth/verify", { token })).status).toBe(302);
    expect((await new Browser().post("/auth/verify", { token })).status).toBe(400);
  });

  it("rejects expired links", async () => {
    const email = uniqueEmail();
    await env.DB.prepare("INSERT INTO users (id, email, display_name, created_at) VALUES ('u-exp', ?, 'E', 0)").bind(email).run();
    const b = new Browser();
    const token = devToken(await (await b.post("/signin", { email })).text())!;
    await env.DB.prepare("UPDATE login_tokens SET expires_at = 0 WHERE email = ?").bind(email).run();
    expect((await b.post("/auth/verify", { token })).status).toBe(400);
  });

  it("limits how many links one address can request per hour", async () => {
    const email = uniqueEmail();
    await env.DB.prepare("INSERT INTO users (id, email, display_name, created_at) VALUES ('u-rate', ?, 'R', 0)").bind(email).run();
    const b = new Browser();
    for (let i = 0; i < 5; i++) expect((await b.post("/signin", { email })).status).toBe(200);
    const sixth = await b.post("/signin", { email });
    expect(sixth.status).toBe(429);
    expect(devToken(await sixth.text())).toBeNull();
  });

  it("signs out on the server, not just in the browser", async () => {
    const { b } = await createMember();
    const stolen = new Browser();
    stolen.cookies = new Map(b.cookies);
    expect((await b.post("/signout", {})).status).toBe(302);
    expect((await stolen.fetch("/people")).status).toBe(302);
  });
});

describe("invites", () => {
  async function join(code: string, name: string, email: string) {
    const b = new Browser();
    const form = await b.post(`/join/${code}`, { display_name: name, email, relationship: "Nell's daughter" });
    const token = devToken(await form.text());
    return { b, form, token };
  }

  it("creates an account from an invite after the email link is clicked", async () => {
    const invite = await createInvite({ maxUses: 1 });
    const email = uniqueEmail("ruth");
    const { b, token } = await join(invite.code, "Ruth Miller", email);
    expect(token).toBeTruthy();
    // Nothing is created until the email address is proven.
    expect(await env.DB.prepare("SELECT 1 FROM users WHERE email = ?").bind(email).first()).toBeNull();

    const verify = await b.post("/auth/verify", { token: token! });
    expect(verify.headers.get("Location")).toBe("/me?notice=welcome");
    const user = await env.DB.prepare("SELECT display_name, relationship, role, invite_id FROM users WHERE email = ?")
      .bind(email)
      .first<{ display_name: string; relationship: string; role: string; invite_id: string }>();
    expect(user).toEqual({ display_name: "Ruth Miller", relationship: "Nell's daughter", role: "member", invite_id: invite.id });
  });

  it("accepts codes typed loosely", async () => {
    const invite = await createInvite();
    const res = await new Browser().post("/join", { code: ` ${invite.code.toLowerCase().replace("-", " ")} ` });
    expect(res.headers.get("Location")).toBe(`/join/${invite.code}`);
  });

  it("stops a single-use invite from being used twice", async () => {
    const invite = await createInvite({ maxUses: 1 });
    const first = await join(invite.code, "First", uniqueEmail());
    const second = await join(invite.code, "Second", uniqueEmail());
    expect(second.token).toBeTruthy(); // still unused when the second person filled the form
    expect((await first.b.post("/auth/verify", { token: first.token! })).status).toBe(302);
    expect((await second.b.post("/auth/verify", { token: second.token! })).status).toBe(400);
    expect((await new Browser().fetch(`/join/${invite.code}`)).status).toBe(404);
  });

  it("refuses revoked, expired and unknown invites", async () => {
    const revoked = await createInvite({ revoked: true });
    const expired = await createInvite({ expiresAt: 1 });
    for (const code of [revoked.code, expired.code, "ZZZZ-ZZZZ"]) {
      expect((await new Browser().fetch(`/join/${code}`)).status, code).toBe(404);
      const res = await new Browser().post(`/join/${code}`, { display_name: "X", email: uniqueEmail() });
      expect(res.status, code).toBe(404);
    }
  });

  it("lets admins create and revoke invites", async () => {
    const { b } = await createMember("admin");
    const created = await b.post("/admin/invites", { label: "Christmas cards", max_uses: "", expires_days: "30" });
    expect(created.status).toBe(302);
    const id = new URL(created.headers.get("Location")!, "https://x").searchParams.get("new")!;
    const inv = await env.DB.prepare("SELECT * FROM invites WHERE id = ?").bind(id).first<{ code: string; max_uses: number | null; label: string }>();
    expect(inv?.label).toBe("Christmas cards");
    expect(inv?.max_uses).toBeNull();
    expect(inv?.code).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
    expect(await (await b.fetch("/admin")).text()).toContain(`https://family.test/join/${inv!.code}`);

    await b.post(`/admin/invites/${id}/revoke`, {});
    expect((await new Browser().fetch(`/join/${inv!.code}`)).status).toBe(404);
  });
});

describe("stories", () => {
  it("lets members add stories, credited to them, with where they heard it", async () => {
    const { b } = await createMember("member", "Ruth Miller");
    const person = await createPerson({ given: "Margaret", surname: "Ashworth" });
    const res = await b.post(`/people/${person}/anecdotes`, {
      body: "My mom always told me that Grandma Maggie was an avid knitter.",
      heard_from: "My mother, Nell",
    });
    expect(res.status).toBe(302);
    const page = await (await b.fetch(`/people/${person}`)).text();
    expect(page).toContain("avid knitter");
    expect(page).toContain("Ruth Miller");
    expect(page).toContain("Heard from: My mother, Nell");
  });

  it("escapes what people type", async () => {
    const { b } = await createMember();
    const person = await createPerson();
    await b.post(`/people/${person}/anecdotes`, { body: `<script>alert("x")</script><img src=x onerror=alert(1)>` });
    const page = await (await b.fetch(`/people/${person}`)).text();
    expect(page).not.toContain("<script>alert");
    expect(page).not.toContain("<img src=x");
    expect(page).toContain("&lt;script&gt;");
  });

  it("only lets the author (or an admin) edit or delete a story", async () => {
    const author = await createMember();
    const other = await createMember();
    const admin = await createMember("admin");
    const person = await createPerson();
    await author.b.post(`/people/${person}/anecdotes`, { body: "Original" });
    const { id } = (await env.DB.prepare("SELECT id FROM anecdotes WHERE person_id = ?").bind(person).first<{ id: string }>())!;

    expect((await other.b.fetch(`/anecdotes/${id}/edit`)).status).toBe(403);
    expect((await other.b.post(`/anecdotes/${id}/edit`, { body: "Hijacked" })).status).toBe(403);
    expect((await other.b.post(`/anecdotes/${id}/delete`, {})).status).toBe(403);

    expect((await author.b.post(`/anecdotes/${id}/edit`, { body: "Edited", heard_from: "I was there" })).status).toBe(302);
    const row = await env.DB.prepare("SELECT body, heard_from FROM anecdotes WHERE id = ?").bind(id).first();
    expect(row).toEqual({ body: "Edited", heard_from: "I was there" });

    expect((await admin.b.post(`/anecdotes/${id}/delete`, {})).status).toBe(302);
    expect(await env.DB.prepare("SELECT 1 FROM anecdotes WHERE id = ?").bind(id).first()).toBeNull();
  });

  it("keeps stories when their author is removed", async () => {
    const author = await createMember();
    const admin = await createMember("admin");
    const person = await createPerson();
    await author.b.post(`/people/${person}/anecdotes`, { body: "Worth keeping" });
    await admin.b.post(`/admin/members/${author.id}/remove`, {});
    const page = await (await admin.b.fetch(`/people/${person}`)).text();
    expect(page).toContain("Worth keeping");
    expect(page).toContain("a former member");
    expect((await author.b.fetch("/people")).status).toBe(302); // their session is gone too
  });
});

describe("profiles", () => {
  it("lets members edit their own profile", async () => {
    const { b, id } = await createMember();
    await b.post("/me", { display_name: "Aunt Ruth", relationship: "Nell's daughter", bio: "Lives in Albany." });
    const page = await (await b.fetch(`/members/${id}`)).text();
    expect(page).toContain("Aunt Ruth");
    expect(page).toContain("Nell&#39;s daughter");
    expect(page).toContain("Lives in Albany.");
  });

  it("lets a member say which living person in the tree they are, once", async () => {
    const a = await createMember();
    const b = await createMember();
    const living = await createPerson({ given: "Ruth", living: true });
    const ancestor = await createPerson({ given: "Thomas", living: false });

    await a.b.post(`/people/${ancestor}/claim`, {});
    await a.b.post(`/people/${living}/claim`, {});
    await b.b.post(`/people/${living}/claim`, {});
    const rows = await env.DB.prepare("SELECT id, person_id FROM users WHERE id IN (?, ?) ORDER BY id").bind(a.id, b.id).all();
    const byId = Object.fromEntries(rows.results.map((r) => [r.id, r.person_id]));
    expect(byId[a.id]).toBe(living);
    expect(byId[b.id]).toBeNull();
  });
});
