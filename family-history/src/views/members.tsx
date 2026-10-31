import type { Invite, Person, User } from "../types";
import type { AnecdoteWithPerson } from "../db";
import { inviteStatus } from "../db";
import { formatDate, now } from "../lib/util";
import { Prose } from "./layout";
import { AnecdoteCard, PersonLink } from "./people";

export function Home(props: {
  user: User;
  stats: { people: number; stories: number; members: number } | null;
  recent: AnecdoteWithPerson[];
  linkedPerson: Person | null;
}) {
  const first = props.user.display_name.split(" ")[0];
  const s = props.stats ?? { people: 0, stories: 0, members: 0 };
  return (
    <>
      <section class="welcome">
        <h1>Welcome, {first}</h1>
        <p class="stats">
          <span>
            <strong>{s.people}</strong> {s.people === 1 ? "person" : "people"} in the tree
          </span>
          <span>
            <strong>{s.stories}</strong> {s.stories === 1 ? "story" : "stories"} shared
          </span>
          <span>
            <strong>{s.members}</strong> {s.members === 1 ? "relative has" : "relatives have"} joined
          </span>
        </p>
      </section>

      <div class="home-grid">
        <section>
          <h2>Latest stories</h2>
          {props.recent.length === 0 ? (
            <div class="card empty">
              <p>
                No stories yet. Find someone on the <a href="/people">People</a> page and be the first to add a memory.
              </p>
            </div>
          ) : (
            props.recent.map((a) => <AnecdoteCard a={a} viewer={props.user} about={a} />)
          )}
        </section>
        <aside>
          <div class="card">
            <h2>Explore</h2>
            <ul class="plain">
              <li>
                <a href="/people">Browse everyone in the tree</a>
              </li>
              <li>
                <a href="/family">See who has joined</a>
              </li>
              <li>
                {props.linkedPerson ? (
                  <>
                    You in the tree: <PersonLink p={props.linkedPerson} />
                  </>
                ) : (
                  <a href="/people">Find yourself in the tree</a>
                )}
              </li>
            </ul>
          </div>
          <div class="card soft">
            <h2>Coming soon</h2>
            <p>An interactive family tree, and a guided journey through the family's story.</p>
          </div>
        </aside>
      </div>
    </>
  );
}

export function FamilyDirectory(props: { members: (User & { story_count: number })[] }) {
  return (
    <>
      <h1>Family members</h1>
      <p class="muted">Relatives who have joined the site.</p>
      <ul class="member-grid">
        {props.members.map((m) => (
          <li class="card member-card">
            <a href={`/members/${m.id}`} class="member-name">
              {m.display_name}
            </a>
            {m.relationship && <p>{m.relationship}</p>}
            <p class="muted small">
              {m.story_count} {m.story_count === 1 ? "story" : "stories"} · joined {formatDate(m.created_at)}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}

export function MemberProfile(props: {
  member: User;
  person: Person | null;
  stories: AnecdoteWithPerson[];
  viewer: User;
}) {
  const { member: m } = props;
  const isMe = props.viewer.id === m.id;
  return (
    <>
      <nav class="breadcrumbs" aria-label="Breadcrumb">
        <a href="/family">Family</a> › {m.display_name}
      </nav>
      <header class="person-header">
        <h1>{m.display_name}</h1>
        {m.relationship && <p class="nickname">{m.relationship}</p>}
        {props.person && (
          <p>
            In the tree: <PersonLink p={props.person} />
          </p>
        )}
        {isMe && (
          <p>
            <a class="button" href="/me">
              Edit your profile
            </a>
          </p>
        )}
      </header>
      <Prose text={m.bio} />
      <section class="stories">
        <h2>Stories {isMe ? "you've" : `${m.display_name.split(" ")[0]} has`} shared</h2>
        {props.stories.length === 0 && <p class="muted">None yet.</p>}
        {props.stories.map((a) => (
          <AnecdoteCard a={a} viewer={props.viewer} about={a} />
        ))}
      </section>
    </>
  );
}

export function EditProfile(props: { user: User; person: Person | null; error?: string }) {
  const u = props.user;
  return (
    <section class="card">
      <h1>Your profile</h1>
      {props.error && <p class="error">{props.error}</p>}
      <form method="post" action="/me" class="stack">
        <label for="display_name">Your name</label>
        <input id="display_name" name="display_name" required maxlength={80} value={u.display_name} />
        <span class="hint">How you'd like to appear next to the stories you share.</span>

        <label for="relationship">How you're part of the family</label>
        <input
          id="relationship"
          name="relationship"
          maxlength={200}
          placeholder="e.g. Margaret's granddaughter"
          value={u.relationship ?? ""}
        />

        <label for="bio">A little about you (optional)</label>
        <textarea id="bio" name="bio" rows={5} maxlength={4000} placeholder="Where you live, what you do, what you'd love to learn about the family…">
          {u.bio ?? ""}
        </textarea>

        <p class="muted small">
          Signed in as <strong>{u.email}</strong>.
        </p>
        <div class="actions">
          <button type="submit" class="primary">
            Save profile
          </button>
          <a class="button" href={`/members/${u.id}`}>
            View my profile
          </a>
        </div>
      </form>

      <h2>You in the family tree</h2>
      {props.person ? (
        <>
          <p>
            Your profile is linked to <PersonLink p={props.person} />.
          </p>
          <form method="post" action="/me/unlink" data-confirm="Unlink your profile from this person in the tree?">
            <button type="submit">That's not me, unlink</button>
          </form>
        </>
      ) : (
        <p>
          Not linked yet. Find yourself on the <a href="/people">People</a> page and click "Yes, this is me".
        </p>
      )}
    </section>
  );
}

export function AdminPage(props: {
  origin: string;
  invites: (Invite & { created_by_name: string | null })[];
  members: (User & { story_count: number })[];
  viewer: User;
  newInviteId?: string | null;
}) {
  const t = now();
  return (
    <>
      <h1>Admin</h1>

      <section class="card">
        <h2>Invite relatives</h2>
        <p>
          Make a personal invite for each person (one use), or one shared invite for a group, like a code printed in the
          Christmas cards. Anyone with a valid invite can create an account, so keep them within the family.
        </p>
        <form method="post" action="/admin/invites" class="invite-form">
          <div>
            <label for="label">Who is it for?</label>
            <input id="label" name="label" maxlength={100} placeholder="e.g. Aunt Ruth, or Christmas cards" />
          </div>
          <div>
            <label for="max_uses">Number of uses</label>
            <input id="max_uses" name="max_uses" type="number" min={1} max={500} value="1" />
            <span class="hint">Leave blank for unlimited.</span>
          </div>
          <div>
            <label for="expires_days">Expires after (days)</label>
            <input id="expires_days" name="expires_days" type="number" min={1} max={730} value="90" />
          </div>
          <div class="invite-submit">
            <button type="submit" class="primary">
              Create invite
            </button>
          </div>
        </form>

        {props.invites.length > 0 && (
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>For</th>
                  <th>Link / code</th>
                  <th>Used</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {props.invites.map((inv) => {
                  const status = inviteStatus(inv, t);
                  const url = `${props.origin}/join/${inv.code}`;
                  return (
                    <tr class={inv.id === props.newInviteId ? "highlight" : ""}>
                      <td>
                        {inv.label ?? <span class="muted">(no label)</span>}
                        <div class="muted small">
                          {formatDate(inv.created_at)}
                          {inv.created_by_name ? ` by ${inv.created_by_name}` : ""}
                        </div>
                      </td>
                      <td>
                        <input class="copy-field" readonly value={url} aria-label={`Invite link for ${inv.label ?? inv.code}`} data-copy />
                        <div class="muted small">
                          Code: <span class="code">{inv.code}</span>
                        </div>
                      </td>
                      <td>
                        {inv.uses}
                        {inv.max_uses !== null ? ` of ${inv.max_uses}` : ""}
                      </td>
                      <td>
                        <span class={`badge ${status.replace(" ", "-")}`}>{status}</span>
                        {inv.expires_at && status === "active" && (
                          <div class="muted small">until {formatDate(inv.expires_at)}</div>
                        )}
                      </td>
                      <td>
                        {status === "active" && (
                          <form method="post" action={`/admin/invites/${inv.id}/revoke`} data-confirm="Revoke this invite?">
                            <button type="submit" class="link-button danger">
                              Revoke
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section class="card">
        <h2>Members ({props.members.length})</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Stories</th>
                <th>Last seen</th>
                <th>Role</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {props.members.map((m) => {
                const isMe = m.id === props.viewer.id;
                return (
                  <tr>
                    <td>
                      <a href={`/members/${m.id}`}>{m.display_name}</a>
                    </td>
                    <td class="small">{m.email}</td>
                    <td>{m.story_count}</td>
                    <td class="small">{m.last_seen_at ? formatDate(m.last_seen_at) : "never"}</td>
                    <td>{m.role}</td>
                    <td class="row-actions">
                      {!isMe && (
                        <>
                          <form method="post" action={`/admin/members/${m.id}/role`}>
                            <input type="hidden" name="role" value={m.role === "admin" ? "member" : "admin"} />
                            <button type="submit" class="link-button">
                              {m.role === "admin" ? "Remove admin" : "Make admin"}
                            </button>
                          </form>
                          <form
                            method="post"
                            action={`/admin/members/${m.id}/remove`}
                            data-confirm={`Remove ${m.display_name} from the site? Their stories will stay.`}
                          >
                            <button type="submit" class="link-button danger">
                              Remove
                            </button>
                          </form>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

