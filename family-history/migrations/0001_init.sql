-- Family History: initial schema.
-- Times are Unix seconds (INTEGER). IDs are random URL-safe strings.

------------------------------------------------------------------------------
-- The family tree. Mirrors GEDCOM's INDI / FAM records so an Ancestry export
-- can be imported (and re-imported) without losing structure.
------------------------------------------------------------------------------

CREATE TABLE persons (
  id            TEXT PRIMARY KEY,
  gedcom_xref   TEXT UNIQUE,              -- e.g. "@I123@" from the GEDCOM file
  given_names   TEXT,
  surname       TEXT,
  nickname      TEXT,                     -- e.g. "Grandmother Coe"
  sex           TEXT CHECK (sex IN ('M', 'F', 'U')),
  birth_date    TEXT,                     -- as recorded, e.g. "ABT 1884", "12 MAR 1884"
  birth_year    INTEGER,                  -- parsed, for sorting and timelines
  birth_place   TEXT,
  death_date    TEXT,
  death_year    INTEGER,
  death_place   TEXT,
  is_living     INTEGER NOT NULL DEFAULT 0,
  summary       TEXT,                     -- short narrative blurb
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX persons_name ON persons (surname COLLATE NOCASE, given_names COLLATE NOCASE);

-- A couple and their children (GEDCOM FAM). Either partner may be unknown.
CREATE TABLE families (
  id              TEXT PRIMARY KEY,
  gedcom_xref     TEXT UNIQUE,
  partner1_id     TEXT REFERENCES persons (id) ON DELETE SET NULL,
  partner2_id     TEXT REFERENCES persons (id) ON DELETE SET NULL,
  marriage_date   TEXT,
  marriage_year   INTEGER,
  marriage_place  TEXT
);
CREATE INDEX families_partner1 ON families (partner1_id);
CREATE INDEX families_partner2 ON families (partner2_id);

CREATE TABLE family_children (
  family_id  TEXT NOT NULL REFERENCES families (id) ON DELETE CASCADE,
  child_id   TEXT NOT NULL REFERENCES persons (id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (family_id, child_id)
);
CREATE INDEX family_children_child ON family_children (child_id);

------------------------------------------------------------------------------
-- Site members (living relatives who sign in) and sign-in plumbing.
------------------------------------------------------------------------------

CREATE TABLE invites (
  id          TEXT PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,       -- "K7QM-4XRT": short enough to print on a card
  label       TEXT,                       -- "For Aunt Ruth", "Christmas cards 2026"
  max_uses    INTEGER,                    -- NULL = unlimited
  uses        INTEGER NOT NULL DEFAULT 0,
  expires_at  INTEGER,                    -- NULL = never
  created_by  TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at  INTEGER NOT NULL,
  revoked_at  INTEGER
);

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name  TEXT NOT NULL,
  relationship  TEXT,                     -- "Ruth's daughter", "married into the Coes in 1988"
  bio           TEXT,
  person_id     TEXT UNIQUE REFERENCES persons (id) ON DELETE SET NULL,  -- "this is me in the tree"
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  invite_id     TEXT REFERENCES invites (id) ON DELETE SET NULL,
  created_at    INTEGER NOT NULL,
  last_seen_at  INTEGER
);

-- Only a SHA-256 hash of the cookie value is stored, so a database leak
-- doesn't hand out working sessions.
CREATE TABLE sessions (
  id_hash     TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);

-- One-time email links. purpose = 'signin' for existing members,
-- 'signup' for someone who used an invite (payload holds their name etc.).
CREATE TABLE login_tokens (
  token_hash  TEXT PRIMARY KEY,
  email       TEXT NOT NULL COLLATE NOCASE,
  purpose     TEXT NOT NULL CHECK (purpose IN ('signin', 'signup')),
  payload     TEXT,                       -- JSON
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  used_at     INTEGER
);
CREATE INDEX login_tokens_email ON login_tokens (email, created_at);

------------------------------------------------------------------------------
-- Stories members tell about people in the tree.
------------------------------------------------------------------------------

CREATE TABLE anecdotes (
  id          TEXT PRIMARY KEY,
  person_id   TEXT NOT NULL REFERENCES persons (id) ON DELETE CASCADE,
  author_id   TEXT REFERENCES users (id) ON DELETE SET NULL,   -- stories outlive accounts
  body        TEXT NOT NULL,
  heard_from  TEXT,                       -- provenance: "My mom, Ruth, every Christmas"
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX anecdotes_person ON anecdotes (person_id, created_at);
CREATE INDEX anecdotes_author ON anecdotes (author_id, created_at);
CREATE INDEX anecdotes_recent ON anecdotes (created_at);
