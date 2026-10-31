import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { parseGedcom } from "../public/gedcom.js";
import { FIXTURE_GEDCOM } from "./fixture-gedcom";
import { createMember } from "./helpers";

const parsed = parseGedcom(FIXTURE_GEDCOM, { currentYear: 2026 });

async function runImport(b: Awaited<ReturnType<typeof createMember>>["b"], data = parsed) {
  const people = await b.postJson("/admin/import/people", { people: data.people });
  expect(people.status, await people.clone().text()).toBe(200);
  const families = await b.postJson("/admin/import/families", { families: data.families });
  expect(families.status).toBe(200);
  const finish = await b.postJson("/admin/import/finish", {
    fileName: "tree.ged",
    xrefs: data.people.map((p) => p.xref),
    familyXrefs: data.families.map((f) => f.xref),
  });
  expect(finish.status).toBe(200);
  return (await finish.json()) as { missing: number };
}

const idOf = async (xref: string) =>
  (await env.DB.prepare("SELECT id FROM persons WHERE gedcom_xref = ?").bind(xref).first<{ id: string }>())!.id;

describe("importing from Ancestry", () => {
  it("is for admins only", async () => {
    const { b } = await createMember("member");
    expect((await b.fetch("/admin/import")).status).toBe(403);
    expect((await b.postJson("/admin/import/people", { people: [] })).status).toBe(403);
  });

  it("only accepts JSON, and rejects malformed data", async () => {
    const { b } = await createMember("admin");
    expect((await b.post("/admin/import/people", { people: "x" })).status).toBe(415);
    const bad = await b.postJson("/admin/import/people", { people: [{ xref: "not-an-id", events: [] }] });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toMatch(/GEDCOM ID/);
    const tooMany = await b.postJson("/admin/import/people", { people: Array.from({ length: 101 }, (_, i) => ({ xref: `@T${i}@` })) });
    expect(tooMany.status).toBe(400);
  });

  it("brings in people, families and life events", async () => {
    const { b } = await createMember("admin");
    await runImport(b);

    const josef = await idOf("@I1@");
    const page = await (await b.fetch(`/people/${josef}`)).text();
    expect(page).toContain("Josef Hartwell");
    expect(page).toContain("Also recorded as Józef Hartwelski");
    expect(page).toContain("Life events");
    expect(page).toContain("Arrival");
    expect(page).toContain("New York, New York, USA");
    expect(page).toContain("Married Anna Kowal");
    expect(page).toContain("Walter Hartwell Sr."); // child, with suffix
    expect(page).toContain("About 1871"); // tidied date

    const person = await env.DB.prepare("SELECT birth_year, death_year, is_living FROM persons WHERE gedcom_xref = '@I1@'").first();
    expect(person).toEqual({ birth_year: 1871, death_year: 1941, is_living: 0 });
    const junior = await env.DB.prepare("SELECT is_living FROM persons WHERE gedcom_xref = '@I5@'").first();
    expect(junior).toEqual({ is_living: 1 });

    // Maiden and married names are both searchable.
    const search = await (await b.fetch("/people?q=Kowal")).text();
    expect(search).toContain("Anna");
    const search2 = await (await b.fetch("/people?q=Hartwelski")).text();
    expect(search2).toContain("Josef");
  });

  it("updates in place on re-import, keeping stories and adding nobody twice", async () => {
    const { b } = await createMember("admin");
    await runImport(b);
    const josef = await idOf("@I1@");
    await b.post(`/people/${josef}/anecdotes`, { body: "He carried his tools in a canvas bag." });
    const before = await env.DB.prepare("SELECT COUNT(*) AS n FROM persons").first<{ n: number }>();

    // Fix a typo on Ancestry, drop someone from the tree, export again.
    const updated = structuredClone(parsed);
    updated.people.find((p) => p.xref === "@I1@")!.birthPlace = "Kraków, Galicia";
    updated.people = updated.people.filter((p) => p.xref !== "@I6@");
    const { missing } = await runImport(b, updated);

    expect(await idOf("@I1@")).toBe(josef);
    const after = await env.DB.prepare("SELECT COUNT(*) AS n FROM persons").first<{ n: number }>();
    expect(after?.n).toBe(before?.n);
    expect(missing).toBeGreaterThanOrEqual(1); // @I6@ is kept, and reported
    const page = await (await b.fetch(`/people/${josef}`)).text();
    expect(page).toContain("Kraków, Galicia");
    expect(page).toContain("canvas bag");
    const events = await env.DB.prepare("SELECT COUNT(*) AS n FROM events WHERE person_id = ?").bind(josef).first<{ n: number }>();
    expect(events?.n).toBe(parsed.people.find((p) => p.xref === "@I1@")!.events.length);
    const kids = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM family_children fc JOIN families f ON f.id = fc.family_id WHERE f.gedcom_xref = '@F1@'",
    ).first<{ n: number }>();
    expect(kids?.n).toBe(1);
  });

  it("logs each import", async () => {
    const { b } = await createMember("admin");
    await runImport(b);
    const page = await (await b.fetch("/admin/import")).text();
    expect(page).toContain("Earlier imports");
    expect(page).toContain("tree.ged");
  });
});
