-- Life events, alternate names and an import log, for the Ancestry (GEDCOM) importer.

ALTER TABLE persons ADD COLUMN suffix TEXT;      -- "Jr.", "Sr."
ALTER TABLE persons ADD COLUMN alt_names TEXT;   -- other names, one per line: maiden/married names, spellings

-- Everything that happened to a person: residences (censuses), arrivals,
-- burials, marriages, obituaries...
CREATE TABLE events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id   TEXT NOT NULL REFERENCES persons (id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,                 -- GEDCOM tag: BIRT, RESI, EVEN, MARR, BURI...
  label       TEXT NOT NULL,                 -- shown to people: "Lived in", "Arrival", "Married Mary Doyle"
  date        TEXT,                          -- as recorded
  year        INTEGER,                       -- parsed, for ordering
  place       TEXT,
  details     TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,    -- order in the source file
  source      TEXT NOT NULL DEFAULT 'gedcom' -- 'gedcom' rows are replaced on each re-import
);
CREATE INDEX events_person ON events (person_id, year);

CREATE TABLE imports (
  id          TEXT PRIMARY KEY,
  file_name   TEXT,
  people      INTEGER NOT NULL,
  families    INTEGER NOT NULL,
  missing     INTEGER NOT NULL DEFAULT 0,    -- people on the site who weren't in this file
  created_by  TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at  INTEGER NOT NULL
);
