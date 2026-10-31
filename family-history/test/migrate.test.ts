import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { applyMigrations, MIGRATIONS, splitSql } from "../src/migrate";

const normalize = (q: string) => q.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").replace(/;\s*$/, "").trim();

describe("self-migration", () => {
  it("lists every file in migrations/, in order", () => {
    expect(MIGRATIONS.map((m) => m.name)).toEqual(env.TEST_MIGRATIONS.map((m) => m.name));
  });

  it("splits each file into the same statements Wrangler does", () => {
    for (const [i, m] of MIGRATIONS.entries()) {
      const ours = splitSql(m.sql).map(normalize);
      const wranglers = env.TEST_MIGRATIONS[i]!.queries.map(normalize).filter(Boolean);
      expect(ours, m.name).toEqual(wranglers);
    }
  });

  it("ignores semicolons in strings and comments", () => {
    expect(splitSql("INSERT INTO t VALUES ('a;b', 'it''s'); -- note; here\n/* x; y */ SELECT \"c;d\";")).toEqual([
      "INSERT INTO t VALUES ('a;b', 'it''s')",
      'SELECT "c;d"',
    ]);
  });

  it("builds an empty database, once, even when requests race", async () => {
    const db = env.FRESH_DB;
    const [a, b] = await Promise.all([applyMigrations(db), applyMigrations(db)]);
    expect([...a, ...b]).toEqual(MIGRATIONS.map((m) => m.name));
    expect(await applyMigrations(db)).toEqual([]);
    const tables = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all<{ name: string }>();
    expect(tables.results.map((t) => t.name)).toEqual(
      expect.arrayContaining(["anecdotes", "d1_migrations", "families", "invites", "persons", "sessions", "users"]),
    );
    const rows = await db.prepare("SELECT name FROM d1_migrations").all();
    expect(rows.results).toHaveLength(MIGRATIONS.length);
  });
});

describe("addresses", () => {
  it("sends www. visitors to the main address", async () => {
    const res = await SELF.fetch("https://www.family.test/people?q=Coe", { redirect: "manual" });
    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe("https://family.test/people?q=Coe");
  });
});
