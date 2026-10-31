import { Hono } from "hono";
import type { AppEnv, Ctx, Invite, User } from "../types";
import { requireAdmin, requireUser } from "../auth";
import {
  anecdotesByAuthor,
  anecdotesForPerson,
  counts,
  eventsForPerson,
  getPerson,
  getRelatives,
  getUser,
  listMembers,
  recentAnecdotes,
  searchPeople,
  personName,
  type AnecdoteWithAuthor,
} from "../db";
import { DAY, field, newId, newInviteCode, now } from "../lib/util";
import { render } from "../views/layout";
import { EditAnecdote, PersonPage, PeopleList } from "../views/people";
import { AdminPage, EditProfile, FamilyDirectory, Home, MemberProfile } from "../views/members";
import { ImportPage } from "../views/import";
import { finishImport, ImportError, saveFamilies, savePeople, validateFamilies, validatePeople } from "../importer";

export const appRoutes = new Hono<AppEnv>();

const me = (c: Ctx) => c.get("user") as User; // safe behind requireUser

const notFound = (c: Ctx, what = "page") =>
  render(
    c,
    "Not found",
    <section class="card narrow">
      <h1>We couldn't find that {what}</h1>
      <p>
        <a href="/">Go to the home page</a>
      </p>
    </section>,
    404,
  );

for (const path of ["/people", "/people/*", "/anecdotes/*", "/family", "/members/*", "/me", "/me/*"]) {
  appRoutes.use(path, requireUser);
}
appRoutes.use("/admin", requireAdmin);
appRoutes.use("/admin/*", requireAdmin);

// --- Home (signed in) ------------------------------------------------------------

export async function homePage(c: Ctx) {
  const user = me(c);
  const [stats, recent, linkedPerson] = await Promise.all([
    counts(c.env.DB),
    recentAnecdotes(c.env.DB),
    user.person_id ? getPerson(c.env.DB, user.person_id) : Promise.resolve(null),
  ]);
  return render(c, c.env.SITE_NAME, <Home user={user} stats={stats} recent={recent} linkedPerson={linkedPerson} />);
}

// --- People and stories --------------------------------------------------------------

appRoutes.get("/people", async (c) => {
  const q = c.req.query("q")?.trim().slice(0, 100) || null;
  const [people, stats] = await Promise.all([searchPeople(c.env.DB, q), counts(c.env.DB)]);
  return render(c, "People", <PeopleList people={people} q={q} total={stats?.people ?? 0} />);
});

async function personPage(c: Ctx, personId: string, opts: { error?: string; draft?: { body: string | null; heard_from: string | null } } = {}) {
  const person = await getPerson(c.env.DB, personId);
  if (!person) return notFound(c, "person");
  const [relatives, anecdotes, events, claimedBy] = await Promise.all([
    getRelatives(c.env.DB, person.id),
    anecdotesForPerson(c.env.DB, person.id),
    eventsForPerson(c.env.DB, person.id),
    c.env.DB.prepare("SELECT id, display_name FROM users WHERE person_id = ?").bind(person.id).first<{ id: string; display_name: string }>(),
  ]);
  return render(
    c,
    personName(person),
    <PersonPage person={person} relatives={relatives} anecdotes={anecdotes} events={events} viewer={me(c)} claimedBy={claimedBy} {...opts} />,
    opts.error ? 400 : 200,
  );
}

appRoutes.get("/people/:id", (c) => personPage(c, c.req.param("id")));

appRoutes.post("/people/:id/anecdotes", async (c) => {
  const person = await getPerson(c.env.DB, c.req.param("id"));
  if (!person) return notFound(c, "person");
  const form = await c.req.parseBody();
  const body = field(form, "body", 10000);
  const heard_from = field(form, "heard_from", 200);
  if (!body) return personPage(c, person.id, { error: "Please write the story before adding it.", draft: { body, heard_from } });
  const t = now();
  const id = newId();
  await c.env.DB.prepare(
    "INSERT INTO anecdotes (id, person_id, author_id, body, heard_from, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(id, person.id, me(c).id, body, heard_from, t, t)
    .run();
  return c.redirect(`/people/${person.id}?notice=story-added#story-${id}`);
});

appRoutes.post("/people/:id/claim", async (c) => {
  const user = me(c);
  const person = await getPerson(c.env.DB, c.req.param("id"));
  if (!person) return notFound(c, "person");
  if (!person.is_living || user.person_id) return c.redirect(`/people/${person.id}`);
  // users.person_id is UNIQUE, so two people can't claim the same person.
  const res = await c.env.DB.prepare(
    "UPDATE users SET person_id = ? WHERE id = ? AND person_id IS NULL AND NOT EXISTS (SELECT 1 FROM users WHERE person_id = ?)",
  )
    .bind(person.id, user.id, person.id)
    .run();
  return c.redirect(`/people/${person.id}${res.meta.changes ? "?notice=linked" : ""}`);
});

async function editableAnecdote(c: Ctx) {
  const a = await c.env.DB.prepare(
    "SELECT a.*, u.display_name AS author_name FROM anecdotes a LEFT JOIN users u ON u.id = a.author_id WHERE a.id = ?",
  )
    .bind(c.req.param("id"))
    .first<AnecdoteWithAuthor>();
  if (!a) return { error: notFound(c, "story") } as const;
  const user = me(c);
  if (a.author_id !== user.id && user.role !== "admin") {
    return { error: c.text("You can only change stories you shared.", 403) } as const;
  }
  return { a } as const;
}

appRoutes.get("/anecdotes/:id/edit", async (c) => {
  const r = await editableAnecdote(c);
  if ("error" in r) return r.error;
  const person = await getPerson(c.env.DB, r.a.person_id);
  if (!person) return notFound(c, "person");
  return render(c, "Edit story", <EditAnecdote a={r.a} person={person} />);
});

appRoutes.post("/anecdotes/:id/edit", async (c) => {
  const r = await editableAnecdote(c);
  if ("error" in r) return r.error;
  const form = await c.req.parseBody();
  const body = field(form, "body", 10000);
  const heard_from = field(form, "heard_from", 200);
  if (!body) {
    const person = await getPerson(c.env.DB, r.a.person_id);
    if (!person) return notFound(c, "person");
    return render(c, "Edit story", <EditAnecdote a={{ ...r.a, body: "", heard_from }} person={person} error="The story can't be empty." />, 400);
  }
  await c.env.DB.prepare("UPDATE anecdotes SET body = ?, heard_from = ?, updated_at = ? WHERE id = ?")
    .bind(body, heard_from, now(), r.a.id)
    .run();
  return c.redirect(`/people/${r.a.person_id}?notice=story-updated#story-${r.a.id}`);
});

appRoutes.post("/anecdotes/:id/delete", async (c) => {
  const r = await editableAnecdote(c);
  if ("error" in r) return r.error;
  await c.env.DB.prepare("DELETE FROM anecdotes WHERE id = ?").bind(r.a.id).run();
  return c.redirect(`/people/${r.a.person_id}?notice=story-deleted`);
});

// --- Members and profiles ------------------------------------------------------------

appRoutes.get("/family", async (c) => render(c, "Family", <FamilyDirectory members={await listMembers(c.env.DB)} />));

appRoutes.get("/members/:id", async (c) => {
  const member = await getUser(c.env.DB, c.req.param("id"));
  if (!member) return notFound(c, "member");
  const [person, stories] = await Promise.all([
    member.person_id ? getPerson(c.env.DB, member.person_id) : Promise.resolve(null),
    anecdotesByAuthor(c.env.DB, member.id),
  ]);
  return render(c, member.display_name, <MemberProfile member={member} person={person} stories={stories} viewer={me(c)} />);
});

appRoutes.get("/me", async (c) => {
  const user = me(c);
  const person = user.person_id ? await getPerson(c.env.DB, user.person_id) : null;
  return render(c, "Your profile", <EditProfile user={user} person={person} />);
});

appRoutes.post("/me", async (c) => {
  const user = me(c);
  const form = await c.req.parseBody();
  const display_name = field(form, "display_name", 80);
  const relationship = field(form, "relationship", 200);
  const bio = field(form, "bio", 4000);
  if (!display_name) {
    const person = user.person_id ? await getPerson(c.env.DB, user.person_id) : null;
    return render(c, "Your profile", <EditProfile user={{ ...user, relationship, bio }} person={person} error="Please enter your name." />, 400);
  }
  await c.env.DB.prepare("UPDATE users SET display_name = ?, relationship = ?, bio = ? WHERE id = ?")
    .bind(display_name, relationship, bio, user.id)
    .run();
  return c.redirect("/me?notice=saved");
});

appRoutes.post("/me/unlink", async (c) => {
  await c.env.DB.prepare("UPDATE users SET person_id = NULL WHERE id = ?").bind(me(c).id).run();
  return c.redirect("/me?notice=unlinked");
});

// --- Admin ------------------------------------------------------------------------

appRoutes.get("/admin", async (c) => {
  const [invites, members] = await Promise.all([
    c.env.DB.prepare(
      `SELECT i.*, u.display_name AS created_by_name FROM invites i
         LEFT JOIN users u ON u.id = i.created_by ORDER BY i.created_at DESC LIMIT 200`,
    ).all<Invite & { created_by_name: string | null }>(),
    listMembers(c.env.DB),
  ]);
  return render(
    c,
    "Admin",
    <AdminPage
      origin={new URL(c.req.url).origin}
      invites={invites.results}
      members={members}
      viewer={me(c)}
      newInviteId={c.req.query("new") ?? null}
    />,
  );
});

function optionalInt(v: unknown, min: number, max: number): number | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

appRoutes.post("/admin/invites", async (c) => {
  const form = await c.req.parseBody();
  const label = field(form, "label", 100);
  const maxUses = optionalInt(form.max_uses, 1, 500);
  const expiresDays = optionalInt(form.expires_days, 1, 730);
  const t = now();
  const id = newId();
  // Codes are random; on the off chance of a collision, try again.
  for (let attempt = 0; ; attempt++) {
    try {
      await c.env.DB.prepare(
        "INSERT INTO invites (id, code, label, max_uses, expires_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
        .bind(id, newInviteCode(), label, maxUses, expiresDays ? t + expiresDays * DAY : null, me(c).id, t)
        .run();
      break;
    } catch (err) {
      if (attempt >= 3 || !String(err).includes("UNIQUE")) throw err;
    }
  }
  return c.redirect(`/admin?notice=invite-created&new=${id}`);
});

appRoutes.post("/admin/invites/:id/revoke", async (c) => {
  await c.env.DB.prepare("UPDATE invites SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").bind(now(), c.req.param("id")).run();
  return c.redirect("/admin?notice=invite-revoked");
});

appRoutes.post("/admin/members/:id/role", async (c) => {
  const id = c.req.param("id");
  const form = await c.req.parseBody();
  const role = form.role === "admin" ? "admin" : "member";
  if (id === me(c).id) return c.text("You can't change your own role.", 400);
  await c.env.DB.prepare("UPDATE users SET role = ? WHERE id = ?").bind(role, id).run();
  return c.redirect("/admin?notice=member-updated");
});

appRoutes.post("/admin/members/:id/remove", async (c) => {
  const id = c.req.param("id");
  if (id === me(c).id) return c.text("You can't remove yourself.", 400);
  // Sessions cascade; anecdotes keep their text with author set to NULL.
  await c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(id).run();
  return c.redirect("/admin?notice=member-removed");
});

// --- Import from Ancestry -----------------------------------------------------------

appRoutes.get("/admin/import", async (c) => {
  const imports = await c.env.DB.prepare(
    `SELECT i.*, u.display_name AS by_name FROM imports i
       LEFT JOIN users u ON u.id = i.created_by ORDER BY i.created_at DESC LIMIT 10`,
  ).all<{ id: string; file_name: string | null; people: number; families: number; missing: number; by_name: string | null; created_at: number }>();
  return render(c, "Import from Ancestry", <ImportPage imports={imports.results} />);
});

// The browser parses the file and sends it in batches as JSON.
async function importStep(c: Ctx, step: (body: unknown) => Promise<object>) {
  if (!c.req.header("Content-Type")?.startsWith("application/json")) return c.json({ error: "Expected JSON" }, 415);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "That wasn't valid JSON" }, 400);
  }
  try {
    return c.json({ ok: true, ...(await step(body)) });
  } catch (err) {
    if (err instanceof ImportError) return c.json({ error: err.message }, 400);
    throw err;
  }
}

appRoutes.post("/admin/import/people", (c) => importStep(c, (b) => savePeople(c.env.DB, validatePeople(b))));
appRoutes.post("/admin/import/families", (c) => importStep(c, (b) => saveFamilies(c.env.DB, validateFamilies(b))));
appRoutes.post("/admin/import/finish", (c) => importStep(c, (b) => finishImport(c.env.DB, b, me(c).id)));
