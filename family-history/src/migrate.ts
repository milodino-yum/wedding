// Applies database migrations from inside the Worker, on the first request
// after a deploy. Deploys from GitHub (Workers Builds) then need no database
// permissions and nobody has to remember to run `wrangler d1 migrations apply`.
//
// Uses the same `d1_migrations` table as Wrangler, so the Wrangler commands
// (`npm run db:migrate:local`, `wrangler d1 migrations list`) keep working.

import m0001 from "../migrations/0001_init.sql";

/**
 * Every file in migrations/, in order. When you add a migration file, add it
 * here too; a test fails if this list and the folder disagree.
 */
export const MIGRATIONS: { name: string; sql: string }[] = [{ name: "0001_init.sql", sql: m0001 }];

const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS d1_migrations(
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
)`;

/**
 * Splits a SQL file into statements: drops comments, splits on semicolons
 * outside quotes. Doesn't understand CREATE TRIGGER ... BEGIN ...; END; (a
 * test compares the result with Wrangler's own splitter for every file).
 */
export function splitSql(sql: string): string[] {
  const out: string[] = [];
  let cur = "";
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i]!;
    const next = sql[i + 1];
    if (ch === "-" && next === "-") {
      const end = sql.indexOf("\n", i);
      i = end === -1 ? sql.length : end;
    } else if (ch === "/" && next === "*") {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? sql.length : end + 2;
      cur += " ";
    } else if (ch === "'" || ch === '"' || ch === "`" || ch === "[") {
      const close = ch === "[" ? "]" : ch;
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === close) {
          if (close !== "]" && sql[j + 1] === close) {
            j += 2; // doubled quote is an escaped quote
            continue;
          }
          break;
        }
        j++;
      }
      cur += sql.slice(i, j + 1);
      i = j + 1;
    } else if (ch === ";") {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
      i++;
    } else {
      cur += ch;
      i++;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Applies any migrations not yet recorded. Returns the names it applied. */
export async function applyMigrations(db: D1Database, migrations = MIGRATIONS): Promise<string[]> {
  await db.prepare(CREATE_TABLE).run();
  const done = new Set(
    (await db.prepare("SELECT name FROM d1_migrations").all<{ name: string }>()).results.map((r) => r.name),
  );
  const applied: string[] = [];
  for (const m of migrations) {
    if (done.has(m.name)) continue;
    try {
      // A batch is one transaction: the migration and its record go in together or not at all.
      await db.batch([
        ...splitSql(m.sql).map((q) => db.prepare(q)),
        db.prepare("INSERT INTO d1_migrations (name) VALUES (?)").bind(m.name),
      ]);
      applied.push(m.name);
    } catch (err) {
      // Two requests can race right after a deploy; if the other one won, we're fine.
      const appliedElsewhere = await db.prepare("SELECT 1 FROM d1_migrations WHERE name = ?").bind(m.name).first();
      if (!appliedElsewhere) throw err;
    }
  }
  if (applied.length) console.log(`Applied migrations: ${applied.join(", ")}`);
  return applied;
}

let ready: Promise<unknown> | null = null;

/** Runs once per Worker instance; later requests reuse the result. Retries after a failure. */
export function ensureMigrated(db: D1Database): Promise<unknown> {
  ready ??= applyMigrations(db).catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}
