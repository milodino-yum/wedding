import type { Anecdote, Invite, Person, User } from "./types";

export type AnecdoteWithAuthor = Anecdote & { author_name: string | null };
export type AnecdoteWithPerson = AnecdoteWithAuthor & {
  given_names: string | null;
  surname: string | null;
  nickname: string | null;
};

export function personName(p: Pick<Person, "given_names" | "surname">): string {
  return [p.given_names, p.surname].filter(Boolean).join(" ") || "Unknown";
}

const GEDCOM_WORDS: Record<string, string> = {
  JAN: "Jan", FEB: "Feb", MAR: "Mar", APR: "Apr", MAY: "May", JUN: "Jun",
  JUL: "Jul", AUG: "Aug", SEP: "Sep", OCT: "Oct", NOV: "Nov", DEC: "Dec",
  ABT: "about", EST: "about", CAL: "about", BEF: "before", AFT: "after",
  BET: "between", AND: "and", FROM: "from", TO: "to",
};

/** "ABT 1861" -> "About 1861", "19 JUN 1884" -> "19 Jun 1884". Other text is left alone. */
export function prettyDate(d: string | null, opts: { capitalize?: boolean } = {}): string | null {
  if (!d) return d;
  const s = d.trim().split(/\s+/).map((tok) => GEDCOM_WORDS[tok.toUpperCase()] ?? tok).join(" ");
  return opts.capitalize === false ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

export function lifeSpan(p: Pick<Person, "birth_year" | "death_year" | "is_living">): string {
  if (p.birth_year && p.death_year) return `${p.birth_year}–${p.death_year}`;
  if (p.birth_year) return p.is_living ? `b. ${p.birth_year}` : `${p.birth_year}–?`;
  if (p.death_year) return `d. ${p.death_year}`;
  return "";
}

export async function getPerson(db: D1Database, id: string) {
  return db.prepare("SELECT * FROM persons WHERE id = ?").bind(id).first<Person>();
}

export async function searchPeople(db: D1Database, q: string | null, limit = 300) {
  if (q) {
    const like = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    return (
      await db
        .prepare(
          `SELECT * FROM persons
            WHERE given_names LIKE ?1 ESCAPE '\\' OR surname LIKE ?1 ESCAPE '\\' OR nickname LIKE ?1 ESCAPE '\\'
               OR (given_names || ' ' || surname) LIKE ?1 ESCAPE '\\'
            ORDER BY surname COLLATE NOCASE, given_names COLLATE NOCASE LIMIT ?2`,
        )
        .bind(like, limit)
        .all<Person>()
    ).results;
  }
  return (
    await db
      .prepare("SELECT * FROM persons ORDER BY surname COLLATE NOCASE, given_names COLLATE NOCASE LIMIT ?")
      .bind(limit)
      .all<Person>()
  ).results;
}

export type Relatives = {
  parents: Person[];
  siblings: Person[];
  unions: { family_id: string; spouse: Person | null; marriage_date: string | null; marriage_place: string | null; children: Person[] }[];
};

export async function getRelatives(db: D1Database, personId: string): Promise<Relatives> {
  const [parents, siblings, unions, children] = await db.batch([
    db
      .prepare(
        `SELECT DISTINCT p.* FROM family_children fc
           JOIN families f ON f.id = fc.family_id
           JOIN persons p ON p.id IN (f.partner1_id, f.partner2_id)
          WHERE fc.child_id = ?1
          ORDER BY p.sex DESC`,
      )
      .bind(personId),
    db
      .prepare(
        `SELECT DISTINCT p.* FROM family_children mine
           JOIN family_children sib ON sib.family_id = mine.family_id AND sib.child_id != mine.child_id
           JOIN persons p ON p.id = sib.child_id
          WHERE mine.child_id = ?1
          ORDER BY p.birth_year IS NULL, p.birth_year, sib.sort_order`,
      )
      .bind(personId),
    db
      .prepare(
        `SELECT f.id AS family_id, f.marriage_date, f.marriage_place, f.marriage_year,
                CASE WHEN f.partner1_id = ?1 THEN f.partner2_id ELSE f.partner1_id END AS spouse_id
           FROM families f
          WHERE f.partner1_id = ?1 OR f.partner2_id = ?1
          ORDER BY f.marriage_year IS NULL, f.marriage_year`,
      )
      .bind(personId),
    db
      .prepare(
        `SELECT fc.family_id, p.* FROM families f
           JOIN family_children fc ON fc.family_id = f.id
           JOIN persons p ON p.id = fc.child_id
          WHERE f.partner1_id = ?1 OR f.partner2_id = ?1
          ORDER BY p.birth_year IS NULL, p.birth_year, fc.sort_order`,
      )
      .bind(personId),
  ]);

  type UnionRow = { family_id: string; marriage_date: string | null; marriage_place: string | null; spouse_id: string | null };
  const unionRows = unions!.results as UnionRow[];
  const spouseIds = unionRows.map((u) => u.spouse_id).filter((x): x is string => !!x);
  const spouses = new Map<string, Person>();
  if (spouseIds.length) {
    const rows = await db
      .prepare(`SELECT * FROM persons WHERE id IN (${spouseIds.map(() => "?").join(",")})`)
      .bind(...spouseIds)
      .all<Person>();
    for (const s of rows.results) spouses.set(s.id, s);
  }
  const childRows = children!.results as (Person & { family_id: string })[];

  return {
    parents: parents!.results as Person[],
    siblings: siblings!.results as Person[],
    unions: unionRows.map((u) => ({
      family_id: u.family_id,
      spouse: u.spouse_id ? spouses.get(u.spouse_id) ?? null : null,
      marriage_date: u.marriage_date,
      marriage_place: u.marriage_place,
      children: childRows.filter((ch) => ch.family_id === u.family_id),
    })),
  };
}

export async function anecdotesForPerson(db: D1Database, personId: string) {
  return (
    await db
      .prepare(
        `SELECT a.*, u.display_name AS author_name FROM anecdotes a
           LEFT JOIN users u ON u.id = a.author_id
          WHERE a.person_id = ? ORDER BY a.created_at`,
      )
      .bind(personId)
      .all<AnecdoteWithAuthor>()
  ).results;
}

export async function anecdotesByAuthor(db: D1Database, authorId: string) {
  return (
    await db
      .prepare(
        `SELECT a.*, u.display_name AS author_name, p.given_names, p.surname, p.nickname
           FROM anecdotes a
           JOIN persons p ON p.id = a.person_id
           LEFT JOIN users u ON u.id = a.author_id
          WHERE a.author_id = ? ORDER BY a.created_at DESC`,
      )
      .bind(authorId)
      .all<AnecdoteWithPerson>()
  ).results;
}

export async function recentAnecdotes(db: D1Database, limit = 8) {
  return (
    await db
      .prepare(
        `SELECT a.*, u.display_name AS author_name, p.given_names, p.surname, p.nickname
           FROM anecdotes a
           JOIN persons p ON p.id = a.person_id
           LEFT JOIN users u ON u.id = a.author_id
          ORDER BY a.created_at DESC LIMIT ?`,
      )
      .bind(limit)
      .all<AnecdoteWithPerson>()
  ).results;
}

export async function counts(db: D1Database) {
  return db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM persons) AS people,
              (SELECT COUNT(*) FROM anecdotes) AS stories,
              (SELECT COUNT(*) FROM users) AS members`,
    )
    .first<{ people: number; stories: number; members: number }>();
}

export async function getUser(db: D1Database, id: string) {
  return db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<User>();
}

export async function getUserByEmail(db: D1Database, email: string) {
  return db.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<User>();
}

export async function listMembers(db: D1Database) {
  return (
    await db
      .prepare(
        `SELECT u.*, (SELECT COUNT(*) FROM anecdotes a WHERE a.author_id = u.id) AS story_count
           FROM users u ORDER BY u.display_name COLLATE NOCASE`,
      )
      .all<User & { story_count: number }>()
  ).results;
}

export async function findInviteByCode(db: D1Database, code: string) {
  return db.prepare("SELECT * FROM invites WHERE code = ?").bind(code).first<Invite>();
}

export function inviteStatus(inv: Invite, t: number): "active" | "revoked" | "expired" | "used up" {
  if (inv.revoked_at) return "revoked";
  if (inv.expires_at && inv.expires_at <= t) return "expired";
  if (inv.max_uses !== null && inv.uses >= inv.max_uses) return "used up";
  return "active";
}

/** Atomically takes one use from an invite. False if it's no longer usable. */
export async function claimInviteUse(db: D1Database, inviteId: string, t: number): Promise<boolean> {
  const row = await db
    .prepare(
      `UPDATE invites SET uses = uses + 1
        WHERE id = ? AND revoked_at IS NULL
          AND (expires_at IS NULL OR expires_at > ?)
          AND (max_uses IS NULL OR uses < max_uses)
        RETURNING id`,
    )
    .bind(inviteId, t)
    .first();
  return !!row;
}
