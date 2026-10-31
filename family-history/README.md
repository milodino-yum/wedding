# Clan Destiny

A private, invite-only website where the family can explore our history, and
everyone can add the stories only they know ("My mom always told me that
Grandmother Coe was an avid knitter…") to an ancestor's page.

This folder is the backbone: accounts, invites, profiles, people pages and
stories. The Ancestry import, interactive tree and guided narrative come next
(see [Roadmap](#roadmap)).

## What works today

- **Invite-only sign-up.** An admin makes invite links: a personal one per
  relative, or one shared code (e.g. printed in Christmas cards). Codes look like
  `K7QM-4XRT`, with no 0/O or 1/I/L to misread.
- **No passwords.** Sign-in is a one-time link sent by email, and the session
  lasts six months, so relatives rarely need to sign in again.
- **Profiles.** Name, how you're part of the family, a short bio, and "Yes, this
  is me" to link your account to yourself in the tree.
- **People pages.** Birth and death details, parents, spouses, children and
  siblings, each linked to their own page.
- **Stories.** Any member can add a memory to anyone in the tree. Each story
  records who shared it and, optionally, where they heard it, so first-hand
  memories can be told apart from family lore. Authors (and admins) can edit or
  delete their stories, and stories stay on the site if their author leaves.
- **Admin page.** Create and revoke invites, see who has joined, make other
  admins, remove members.
- Large, readable type, works on phones and iPads, and supports dark mode.

## Run it on your computer

Needs Node.js 20 or newer.

```bash
cd family-history
npm install
cp .dev.vars.example .dev.vars          # then put your email in ADMIN_EMAILS
npm run db:migrate:local
npm run db:seed:local                   # optional: a small, fictional sample family
npm run dev                             # http://localhost:8787
```

Sign in with the address you put in `ADMIN_EMAILS`. In development no email is
sent: the sign-in link appears on the "Check your email" page instead.

```bash
npm test          # 27 tests, run inside the real Workers runtime
npm run typecheck
```

## Going live

Hosting is [Cloudflare Workers](https://developers.cloudflare.com/workers/)
with a [D1](https://developers.cloudflare.com/d1/) (SQLite) database. At family
scale this fits in Cloudflare's free plan, and unlike some free tiers it doesn't
go to sleep when nobody has visited for a while. Sign-in email goes through
[Resend](https://resend.com) (the free tier is 3,000 emails a month).

1. **Make a Cloudflare account** at dash.cloudflare.com.
2. **Buy the domain** under *Domain Registration → Register Domains*. Cloudflare
   sells domains at cost and includes WHOIS privacy. Pick something short that
   is easy to say out loud to a grandparent, with no hyphens.
3. **Create the database** and paste the ID it prints into `wrangler.jsonc`:
   ```bash
   npx wrangler login
   npx wrangler d1 create family-history
   npm run db:migrate:remote
   ```
4. **Set up email.** Make a Resend account, add your domain under *Domains*,
   and click *Auto configure* (or copy its DNS records into Cloudflare). Then set
   `EMAIL_FROM` in `wrangler.jsonc` to an address on that domain, e.g.
   `Family History <stories@yourdomain.com>`.
5. **Set the secrets.** This repository is public, so these never go in a file:
   ```bash
   npx wrangler secret put ADMIN_EMAILS      # your email address
   npx wrangler secret put RESEND_API_KEY    # from resend.com → API Keys
   ```
6. **Check the name** in `wrangler.jsonc` (`SITE_NAME`, currently "Clan Destiny"), then deploy:
   ```bash
   npm run deploy
   ```
7. **Attach the domain.** In the Cloudflare dashboard, go to *Workers & Pages →
   family-history → Settings → Domains & Routes → Add → Custom domain*.
8. **Sign in** with your admin address, fill in your profile, and make invites
   from the Admin page.

Back up the live database whenever you like with `npm run db:backup`. It writes
a `.sql` file to `backups/`, which is git-ignored. D1 also keeps its own
point-in-time history ("Time Travel").

## How sign-in works, and why

- An invite only lets someone *request* an account. The account is created when
  they click the link emailed to them, so every account has a working email.
- The emailed link opens a page with a **Continue** button rather than signing
  in immediately. Email security scanners (common with Outlook and work email)
  open links before the person does. If opening the link signed you in, the
  scanner would use up the one-time link.
- Links expire after an hour and work once. Each address can request at most 5
  per hour.
- The database stores only SHA-256 hashes of sign-in links and session cookies.
- The sign-in page responds the same way whether or not an address belongs to a
  member, so it can't be used to find out who is in the family.
- Every page except the landing, sign-in and join pages needs a sign-in. Pages
  ask search engines not to index them, form posts from other websites are
  rejected, and a strict Content-Security-Policy is set.

## Keeping family data private

- **Never commit** the Ancestry export (`.ged`), the family history document,
  photos, or anything about living relatives to this repository: **it is
  public**. `.gitignore` already blocks `*.ged` files and a `private/` folder;
  keep source material there or outside the repo. The real data lives only in
  the Cloudflare D1 database.
- Living people are flagged (`is_living`) so we can decide how much of their
  details to show before launch.

## Roadmap

1. **Backbone:** accounts, invites, profiles, people, stories. *(this)*
2. **Import the Ancestry tree.** On Ancestry: *Trees → (your tree) → Tree
   Settings → Export tree* to download a `.ged` (GEDCOM) file. An importer will
   load people and families into D1. Re-importing updates them without
   duplicates, because each record keeps its GEDCOM ID.
3. **The family document.** Transcribe it, and link passages to the people
   they're about, so quotes can appear on their pages and in the narrative.
4. **Interactive tree.** Pan and zoom, starting from *you* ("Margaret is your
   great-great-grandmother").
5. **Guided story.** Chapters that walk through generations, places and
   events, drawing on the document, the tree and members' stories.
6. **Photos** stored privately in Cloudflare R2. Ancestry's GEDCOM export
   doesn't include media, so these need a separate download.
7. **Launch for Christmas.** Test with one or two relatives in early December,
   then send invites, perhaps as a QR code in the Christmas cards.

## Layout

```
migrations/      database schema (D1 / SQLite)
seed/            fictional sample family for local development only
src/index.tsx    app setup: security headers, CSRF, sessions, routes
src/auth.ts      sessions, one-time links, sign-in middleware
src/routes/      sign-in/join flow; people, stories, profiles, admin
src/views/       server-rendered pages (Hono JSX)
src/db.ts        queries
src/email.ts     Resend email and the sign-in email template
public/          CSS and a small script. Served publicly, so no family data here.
test/            tests that run in the Workers runtime via Vitest
```
