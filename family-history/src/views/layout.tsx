import type { Child } from "hono/jsx";
import { raw } from "hono/html";
import type { Ctx, User } from "../types";

// Fixed messages shown after a redirect (?notice=saved). Never reflects
// arbitrary text from the URL.
const NOTICES: Record<string, string> = {
  saved: "Saved.",
  "story-added": "Thank you! Your story has been added.",
  "story-updated": "Your story has been updated.",
  "story-deleted": "The story has been removed.",
  welcome: "Welcome! Take a moment to tell the family a little about yourself.",
  "signed-out": "You're signed out. See you soon.",
  linked: "Linked! This is you in the family tree.",
  unlinked: "Your profile is no longer linked to the tree.",
  "invite-created": "Invite created. Copy the link below and send it along.",
  "invite-revoked": "Invite revoked.",
  "member-updated": "Member updated.",
  "member-removed": "Member removed. Their stories stay on the site.",
};

export function Layout(props: { title: string; siteName: string; user: User | null; notice?: string | null; children?: Child }) {
  const { user } = props;
  const notice = props.notice ? NOTICES[props.notice] : null;
  return (
    <>
      {raw("<!doctype html>")}
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="robots" content="noindex, nofollow" />
          <title>{props.title === props.siteName ? props.siteName : `${props.title} · ${props.siteName}`}</title>
          <link rel="stylesheet" href="/styles.css" />
          <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
          <script src="/app.js" defer></script>
        </head>
        <body>
          <header class="site-header">
            <div class="wrap header-row">
              <a class="brand" href="/">
                <TreeMark />
                {props.siteName}
              </a>
              {user && (
                <nav class="site-nav" aria-label="Main">
                  <a href="/people">People</a>
                  <a href="/family">Family</a>
                  <a href="/me">My profile</a>
                  {user.role === "admin" && <a href="/admin">Admin</a>}
                  <form method="post" action="/signout" class="inline">
                    <button type="submit" class="link-button">Sign out</button>
                  </form>
                </nav>
              )}
            </div>
          </header>
          <main class="wrap">
            {notice && (
              <p class="notice" role="status">
                {notice}
              </p>
            )}
            {props.children}
          </main>
          <footer class="site-footer wrap">A private site for our family. Please don't share links outside the family.</footer>
        </body>
      </html>
    </>
  );
}

export function TreeMark() {
  return (
    <svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="11" r="8" fill="currentColor" opacity=".9" />
      <circle cx="9" cy="15" r="5" fill="currentColor" opacity=".75" />
      <circle cx="23" cy="15" r="5" fill="currentColor" opacity=".75" />
      <path d="M15 14h2v11c0 1 2 2.5 4 3h-10c2-.5 4-2 4-3z" fill="currentColor" />
    </svg>
  );
}

export function render(c: Ctx, title: string, body: Child, status: 200 | 400 | 403 | 404 | 429 | 500 = 200) {
  return c.html(
    <Layout title={title} siteName={c.env.SITE_NAME} user={c.get("user")} notice={c.req.query("notice")}>
      {body}
    </Layout>,
    status,
  );
}

/** Paragraphs from plain text, split on blank lines. Text is escaped by JSX. */
export function Prose(props: { text: string | null }) {
  if (!props.text) return null;
  return (
    <>
      {props.text
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => (
          <p class="prose">{p}</p>
        ))}
    </>
  );
}
