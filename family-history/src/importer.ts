// Saves people and families sent by the admin's browser (parsed from a
// GEDCOM file by public/gedcom.js). Upserts by GEDCOM ID, so re-importing an
// updated Ancestry export updates people in place. Nothing is ever deleted:
// stories hang off people, and they matter more than the tree.

import { newId, now } from "./lib/util";

export const MAX_ITEMS_PER_REQUEST = 100;
const MAX_EVENTS_PER_PERSON = 300;

export class ImportError extends Error {}

const XREF = /^@[^@\s]{1,60}@$/;

function str(v: unknown, max: number): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") throw new ImportError("Expected text");
  const t = v.trim().slice(0, max);
  return t.length ? t : null;
}

function xref(v: unknown): string {
  if (typeof v !== "string" || !XREF.test(v)) throw new ImportError(`Not a GEDCOM ID: ${String(v).slice(0, 40)}`);
  return v;
}

function optXref(v: unknown): string | null {
  return v === null || v === undefined ? null : xref(v);
}

function list(v: unknown, max: number, what: string): unknown[] {
  if (!Array.isArray(v)) throw new ImportError(`Expected a list of ${what}`);
  if (v.length > max) throw new ImportError(`Too many ${what} in one request (max ${max})`);
  return v;
}

/** Server-side twin of yearOf() in public/gedcom.js. */
export function yearOf(date: string | null): number | null {
  if (!date) return null;
  const m = date.match(/(?:^|\D)(1[0-9]{3}|20[0-9]{2})(?!\d)/);
  return m ? Number(m[1]) : null;
}

type PersonIn = {
  xref: string;
  given: string | null;
  surname: string | null;
  suffix: string | null;
  altNames: string | null;
  sex: "M" | "F" | "U" | null;
  birthDate: string | null;
  birthPlace: string | null;
  deathDate: string | null;
  deathPlace: string | null;
  isLiving: boolean;
  events: { kind: string; label: string; date: string | null; place: string | null; details: string | null }[];
};

export function validatePeople(body: unknown): PersonIn[] {
  const items = list((body as { people?: unknown })?.people, MAX_ITEMS_PER_REQUEST, "people");
  return items.map((raw) => {
    const p = (raw ?? {}) as Record<string, unknown>;
    const sex = p.sex === "M" || p.sex === "F" || p.sex === "U" ? p.sex : null;
    const altNames = list(p.altNames ?? [], 50, "names")
      .map((n) => str(n, 200))
      .filter(Boolean)
      .join("\n");
    return {
      xref: xref(p.xref),
      given: str(p.given, 200),
      surname: str(p.surname, 200),
      suffix: str(p.suffix, 20),
      altNames: altNames || null,
      sex,
      birthDate: str(p.birthDate, 100),
      birthPlace: str(p.birthPlace, 300),
      deathDate: str(p.deathDate, 100),
      deathPlace: str(p.deathPlace, 300),
      isLiving: p.isLiving === true,
      events: list(p.events ?? [], MAX_EVENTS_PER_PERSON, "events").map((rawEv) => {
        const e = (rawEv ?? {}) as Record<string, unknown>;
        const kind = str(e.kind, 20);
        const label = str(e.label, 200);
        if (!kind || !label) throw new ImportError("Every event needs a kind and a label");
        return { kind, label, date: str(e.date, 100), place: str(e.place, 300), details: str(e.details, 2000) };
      }),
    };
  });
}

type FamilyIn = {
  xref: string;
  partner1: string | null;
  partner2: string | null;
  children: string[];
  marriageDate: string | null;
  marriagePlace: string | null;
};

export function validateFamilies(body: unknown): FamilyIn[] {
  const items = list((body as { families?: unknown })?.families, MAX_ITEMS_PER_REQUEST, "families");
  return items.map((raw) => {
    const f = (raw ?? {}) as Record<string, unknown>;
    return {
      xref: xref(f.xref),
      partner1: optXref(f.partner1),
      partner2: optXref(f.partner2),
      children: list(f.children ?? [], 100, "children").map(xref),
      marriageDate: str(f.marriageDate, 100),
      marriagePlace: str(f.marriagePlace, 300),
    };
  });
}

const PERSON_ID = "(SELECT id FROM persons WHERE gedcom_xref = ?)";

export async function savePeople(db: D1Database, people: PersonIn[]) {
  const t = now();
  const stmts: D1PreparedStatement[] = [];
  for (const p of people) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO persons (id, gedcom_xref, given_names, surname, suffix, alt_names, sex,
                                birth_date, birth_year, birth_place, death_date, death_year, death_place,
                                is_living, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (gedcom_xref) DO UPDATE SET
             given_names = excluded.given_names, surname = excluded.surname, suffix = excluded.suffix,
             alt_names = excluded.alt_names, sex = excluded.sex,
             birth_date = excluded.birth_date, birth_year = excluded.birth_year, birth_place = excluded.birth_place,
             death_date = excluded.death_date, death_year = excluded.death_year, death_place = excluded.death_place,
             is_living = excluded.is_living, updated_at = excluded.updated_at`,
        )
        .bind(
          newId(), p.xref, p.given, p.surname, p.suffix, p.altNames, p.sex,
          p.birthDate, yearOf(p.birthDate), p.birthPlace, p.deathDate, yearOf(p.deathDate), p.deathPlace,
          p.isLiving ? 1 : 0, t, t,
        ),
      // Events from the file are replaced wholesale; any added on the site are kept.
      db.prepare(`DELETE FROM events WHERE source = 'gedcom' AND person_id = ${PERSON_ID}`).bind(p.xref),
      ...p.events.map((e, i) =>
        db
          .prepare(
            `INSERT INTO events (person_id, kind, label, date, year, place, details, sort_order, source)
             SELECT id, ?, ?, ?, ?, ?, ?, ?, 'gedcom' FROM persons WHERE gedcom_xref = ?`,
          )
          .bind(e.kind, e.label, e.date, yearOf(e.date), e.place, e.details, i, p.xref),
      ),
    );
  }
  if (stmts.length) await db.batch(stmts); // one transaction
  return { people: people.length, events: people.reduce((n, p) => n + p.events.length, 0) };
}

export async function saveFamilies(db: D1Database, families: FamilyIn[]) {
  const stmts: D1PreparedStatement[] = [];
  for (const f of families) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO families (id, gedcom_xref, partner1_id, partner2_id, marriage_date, marriage_year, marriage_place)
           VALUES (?, ?, ${PERSON_ID}, ${PERSON_ID}, ?, ?, ?)
           ON CONFLICT (gedcom_xref) DO UPDATE SET
             partner1_id = excluded.partner1_id, partner2_id = excluded.partner2_id,
             marriage_date = excluded.marriage_date, marriage_year = excluded.marriage_year,
             marriage_place = excluded.marriage_place`,
        )
        .bind(newId(), f.xref, f.partner1, f.partner2, f.marriageDate, yearOf(f.marriageDate), f.marriagePlace),
      db
        .prepare("DELETE FROM family_children WHERE family_id = (SELECT id FROM families WHERE gedcom_xref = ?)")
        .bind(f.xref),
      ...f.children.map((c, i) =>
        db
          .prepare(
            `INSERT OR IGNORE INTO family_children (family_id, child_id, sort_order)
             SELECT f.id, p.id, ? FROM families f, persons p WHERE f.gedcom_xref = ? AND p.gedcom_xref = ?`,
          )
          .bind(i, f.xref, c),
      ),
    );
  }
  if (stmts.length) await db.batch(stmts);
  return { families: families.length };
}

/** Logs the import and counts people on the site who weren't in the file (they're kept). */
export async function finishImport(
  db: D1Database,
  body: unknown,
  userId: string,
): Promise<{ missing: number }> {
  const b = (body ?? {}) as Record<string, unknown>;
  const xrefs = list(b.xrefs, 100_000, "IDs").map(xref);
  const families = list(b.familyXrefs ?? [], 100_000, "IDs").length;
  const missing = await db
    .prepare(
      "SELECT COUNT(*) AS n FROM persons WHERE gedcom_xref IS NOT NULL AND gedcom_xref NOT IN (SELECT value FROM json_each(?))",
    )
    .bind(JSON.stringify(xrefs))
    .first<{ n: number }>();
  await db
    .prepare("INSERT INTO imports (id, file_name, people, families, missing, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(newId(), str(b.fileName, 200), xrefs.length, families, missing?.n ?? 0, userId, now())
    .run();
  return { missing: missing?.n ?? 0 };
}
