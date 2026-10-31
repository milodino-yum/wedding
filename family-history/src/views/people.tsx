import type { Person, User } from "../types";
import type { AnecdoteWithAuthor, Relatives } from "../db";
import { lifeSpan, personName, prettyDate } from "../db";
import { formatDate } from "../lib/util";
import { Prose } from "./layout";

export function PersonLink(props: { p: Person }) {
  const span = lifeSpan(props.p);
  return (
    <>
      <a href={`/people/${props.p.id}`}>{personName(props.p)}</a>
      {span && <span class="muted"> ({span})</span>}
    </>
  );
}

export function PeopleList(props: { people: Person[]; q: string | null; total: number }) {
  const groups = new Map<string, Person[]>();
  for (const p of props.people) {
    const key = p.surname || "Surname unknown";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }
  return (
    <>
      <h1>People in the tree</h1>
      <form method="get" action="/people" class="search">
        <label for="q" class="visually-hidden">
          Search by name
        </label>
        <input id="q" name="q" type="search" placeholder="Search by name" value={props.q ?? ""} />
        <button type="submit">Search</button>
      </form>
      {props.q && (
        <p class="muted">
          {props.people.length} {props.people.length === 1 ? "person matches" : "people match"} "{props.q}".{" "}
          <a href="/people">Show everyone</a>
        </p>
      )}
      {props.total === 0 ? (
        <div class="card empty">
          <p>No one has been added to the tree yet. The family tree from Ancestry will be imported here soon.</p>
        </div>
      ) : (
        [...groups].map(([surname, people]) => (
          <section class="surname-group">
            <h2>{surname}</h2>
            <ul class="people-list">
              {people.map((p) => (
                <li>
                  <PersonLink p={p} />
                  {p.birth_place && <span class="muted small"> · born {p.birth_place}</span>}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}

function Fact(props: { label: string; date: string | null; place: string | null }) {
  if (!props.date && !props.place) return null;
  return (
    <>
      <dt>{props.label}</dt>
      <dd>{[prettyDate(props.date), props.place].filter(Boolean).join(", ")}</dd>
    </>
  );
}

function RelativeList(props: { title: string; people: Person[] }) {
  if (!props.people.length) return null;
  return (
    <div class="relatives">
      <h3>{props.title}</h3>
      <ul>
        {props.people.map((p) => (
          <li>
            <PersonLink p={p} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AnecdoteCard(props: { a: AnecdoteWithAuthor; viewer: User; about?: Pick<Person, "given_names" | "surname"> }) {
  const { a, viewer } = props;
  const canEdit = viewer.role === "admin" || a.author_id === viewer.id;
  return (
    <article class="story" id={`story-${a.id}`}>
      <div class="story-body">
        <Prose text={a.body} />
      </div>
      <footer class="story-meta">
        {props.about && (
          <span>
            About <a href={`/people/${a.person_id}`}>{personName(props.about)}</a>
          </span>
        )}
        <span>
          Shared by{" "}
          {a.author_id && a.author_name ? <a href={`/members/${a.author_id}`}>{a.author_name}</a> : "a former member"} ·{" "}
          {formatDate(a.created_at)}
        </span>
        {a.heard_from && <span class="heard-from">Heard from: {a.heard_from}</span>}
        {canEdit && (
          <span class="story-actions">
            <a href={`/anecdotes/${a.id}/edit`}>Edit</a>
            <form method="post" action={`/anecdotes/${a.id}/delete`} class="inline" data-confirm="Remove this story? This can't be undone.">
              <button type="submit" class="link-button danger">
                Delete
              </button>
            </form>
          </span>
        )}
      </footer>
    </article>
  );
}

export function StoryFields(props: { firstName: string; body?: string | null; heardFrom?: string | null }) {
  return (
    <>
      <label for="body">What do you remember, or what were you told about {props.firstName}?</label>
      <textarea
        id="body"
        name="body"
        rows={6}
        required
        maxlength={10000}
        placeholder={`e.g. "My mom always told me that ${props.firstName} was an avid knitter, and every grandchild got a sweater for Christmas."`}
      >
        {props.body ?? ""}
      </textarea>
      <label for="heard_from">Where did this come from? (optional)</label>
      <input
        id="heard_from"
        name="heard_from"
        maxlength={200}
        placeholder="e.g. My mom, every Christmas; or 'I was there'"
        value={props.heardFrom ?? ""}
      />
      <span class="hint">Helps future generations know which stories are first-hand and which were passed down.</span>
    </>
  );
}

export function PersonPage(props: {
  person: Person;
  relatives: Relatives;
  anecdotes: AnecdoteWithAuthor[];
  viewer: User;
  claimedBy: { id: string; display_name: string } | null;
  error?: string;
  draft?: { body: string | null; heard_from: string | null };
}) {
  const { person: p, relatives: r, viewer } = props;
  const firstName = p.nickname || p.given_names?.split(" ")[0] || personName(p);
  const span = lifeSpan(p);
  const canClaim = p.is_living === 1 && !viewer.person_id && !props.claimedBy;
  return (
    <>
      <nav class="breadcrumbs" aria-label="Breadcrumb">
        <a href="/people">People</a> › {personName(p)}
      </nav>
      <header class="person-header">
        <h1>{personName(p)}</h1>
        {p.nickname && <p class="nickname">Known as "{p.nickname}"</p>}
        {span && <p class="lifespan">{span}</p>}
        {props.claimedBy && (
          <p class="muted">
            This is <a href={`/members/${props.claimedBy.id}`}>{props.claimedBy.display_name}</a>, a member of this site.
          </p>
        )}
      </header>

      <div class="person-grid">
        <div class="person-main">
          {(p.birth_date || p.birth_place || p.death_date || p.death_place) && (
            <dl class="facts">
              <Fact label="Born" date={p.birth_date} place={p.birth_place} />
              <Fact label="Died" date={p.death_date} place={p.death_place} />
            </dl>
          )}
          <Prose text={p.summary} />

          <section class="stories" aria-labelledby="stories-h">
            <h2 id="stories-h">Stories and memories</h2>
            {props.anecdotes.length === 0 && (
              <p class="muted">No stories yet. If you remember something about {firstName}, or were told something, add it below.</p>
            )}
            {props.anecdotes.map((a) => (
              <AnecdoteCard a={a} viewer={viewer} />
            ))}
          </section>

          <section class="card add-story" id="add-story">
            <h2>Add a story</h2>
            {props.error && <p class="error">{props.error}</p>}
            <form method="post" action={`/people/${p.id}/anecdotes`} class="stack">
              <StoryFields firstName={firstName} body={props.draft?.body} heardFrom={props.draft?.heard_from} />
              <button type="submit" class="primary">
                Add story
              </button>
            </form>
          </section>
        </div>

        <aside class="person-side">
          <h2 class="side-title">Family</h2>
          <RelativeList title="Parents" people={r.parents} />
          {r.unions.map((u) => (
            <div class="relatives">
              <h3>{u.spouse ? "Spouse" : "Family"}</h3>
              {u.spouse && (
                <p>
                  <PersonLink p={u.spouse} />
                  {(u.marriage_date || u.marriage_place) && (
                    <span class="muted small">
                      <br />
                      Married {[prettyDate(u.marriage_date, { capitalize: false }), u.marriage_place].filter(Boolean).join(", ")}
                    </span>
                  )}
                </p>
              )}
              {u.children.length > 0 && (
                <>
                  <h4>Children</h4>
                  <ul>
                    {u.children.map((ch) => (
                      <li>
                        <PersonLink p={ch} />
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          ))}
          <RelativeList title="Brothers and sisters" people={r.siblings} />
          {!r.parents.length && !r.unions.length && !r.siblings.length && <p class="muted">No relatives recorded yet.</p>}

          {canClaim && (
            <div class="claim">
              <p>Is this you?</p>
              <form method="post" action={`/people/${p.id}/claim`}>
                <button type="submit">Yes, this is me</button>
              </form>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}

export function EditAnecdote(props: { a: AnecdoteWithAuthor; person: Person; error?: string }) {
  const firstName = props.person.nickname || props.person.given_names?.split(" ")[0] || personName(props.person);
  return (
    <section class="card">
      <nav class="breadcrumbs" aria-label="Breadcrumb">
        <a href={`/people/${props.person.id}`}>{personName(props.person)}</a> › Edit story
      </nav>
      <h1>Edit story</h1>
      {props.error && <p class="error">{props.error}</p>}
      <form method="post" action={`/anecdotes/${props.a.id}/edit`} class="stack">
        <StoryFields firstName={firstName} body={props.a.body} heardFrom={props.a.heard_from} />
        <div class="actions">
          <button type="submit" class="primary">
            Save changes
          </button>
          <a class="button" href={`/people/${props.person.id}#story-${props.a.id}`}>
            Cancel
          </a>
        </div>
      </form>
    </section>
  );
}
