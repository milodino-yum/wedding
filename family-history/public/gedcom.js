// Reads a GEDCOM file (as exported by Ancestry) into people and families.
// Runs in the browser on the admin's computer; the site receives only the
// fields below. No family data is in this file, so serving it publicly is fine.

/**
 * @typedef {{ level: number, xref: string | null, tag: string, value: string, children: GNode[] }} GNode
 * @typedef {{ kind: string, label: string, date: string | null, place: string | null, details: string | null }} GEvent
 * @typedef {{
 *   xref: string, given: string | null, surname: string | null, suffix: string | null,
 *   altNames: string[], sex: "M" | "F" | "U" | null,
 *   birthDate: string | null, birthPlace: string | null,
 *   deathDate: string | null, deathPlace: string | null,
 *   isLiving: boolean, events: GEvent[]
 * }} GPerson
 * @typedef {{ xref: string, partner1: string | null, partner2: string | null, children: string[],
 *   marriageDate: string | null, marriagePlace: string | null }} GFamily
 */

/**
 * First plausible 4-digit year in a free-text date ("Abt. 1890", "03/14/1920").
 * @param {string | null | undefined} date
 * @returns {number | null}
 */
export function yearOf(date) {
  if (!date) return null;
  const m = String(date).match(/(?:^|\D)(1[0-9]{3}|20[0-9]{2})(?!\d)/);
  return m ? Number(m[1]) : null;
}

/**
 * @param {string} text
 * @returns {GNode[]} level-0 records with their sub-structures
 */
export function parseLines(text) {
  const lines = text.replace(/^﻿/, "").split(/\r\n|\r|\n/);
  /** @type {GNode[]} */
  const roots = [];
  /** @type {GNode[]} */
  const stack = [];
  for (const raw of lines) {
    const m = raw.match(/^\s*(\d+)\s+(?:(@[^@]+@)\s+)?(\S+)(?: (.*))?$/);
    if (!m) continue;
    const level = Number(m[1]);
    const tag = (m[3] ?? "").toUpperCase();
    const value = m[4] ?? "";
    while (stack.length > level) stack.pop();
    const parent = stack[stack.length - 1];
    if ((tag === "CONC" || tag === "CONT") && parent) {
      parent.value += (tag === "CONT" ? "\n" : "") + value;
      continue;
    }
    /** @type {GNode} */
    const node = { level, xref: m[2] ?? null, tag, value, children: [] };
    if (level === 0 || !parent) roots.push(node);
    else parent.children.push(node);
    stack[level] = node;
    stack.length = level + 1;
  }
  return roots;
}

/** @param {GNode} n @param {string} tag */
const child = (n, tag) => n.children.find((c) => c.tag === tag);
/** @param {GNode} n @param {string} tag */
const childValue = (n, tag) => clean(child(n, tag)?.value);
/** ", New Haven, , Connecticut" -> "New Haven, Connecticut" @param {GNode} n */
const placeOf = (n) => {
  const p = clean(child(n, "PLAC")?.value);
  return p ? clean(p.split(",").map((s) => s.trim()).filter(Boolean).join(", ")) : null;
};
/** Like clean(), but keeps line breaks (for notes). @param {string | undefined | null} s */
function cleanText(s) {
  const t = (s ?? "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .trim();
  return t || null;
}
/** @param {string | undefined | null} s */
function clean(s) {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t && t.toUpperCase() !== "UNKNOWN" ? t : null;
}

/** "Mary Ellen /Doyle/ Jr." -> parts. GIVN/SURN sub-tags win when present. */
function parseName(/** @type {GNode} */ n) {
  const m = n.value.match(/^([^/]*)\/([^/]*)\/?(.*)$/);
  const given = childValue(n, "GIVN") ?? clean(m ? m[1] : n.value);
  const surname = childValue(n, "SURN") ?? clean(m ? m[2] : null);
  const suffix = childValue(n, "NSFX") ?? clean(m ? m[3] : null);
  return { given, surname, suffix };
}

const LABELS = /** @type {Record<string, string>} */ ({
  BIRT: "Born", DEAT: "Died", BURI: "Buried", CREM: "Cremated", BAPM: "Baptized", CHR: "Christened",
  CONF: "Confirmed", RESI: "Lived in", CENS: "Census", MARR: "Married", DIV: "Divorced", NATU: "Naturalized",
  IMMI: "Immigrated", EMIG: "Emigrated", OCCU: "Occupation", EDUC: "Education", GRAD: "Graduated",
  RETI: "Retired", RELI: "Religion", PROB: "Probate", WILL: "Will", ADOP: "Adopted", _MILT: "Military service",
  MILI: "Military service", EVEN: "Event",
});
const DEATH_LIKE = new Set(["DEAT", "BURI", "CREM", "PROB", "WILL"]);
// Record-keeping tags that aren't things that happened to the person.
const NOT_EVENTS = new Set([
  "NAME", "SEX", "SOUR", "OBJE", "NOTE", "FAMC", "FAMS", "CHAN", "RIN", "RFN", "AFN", "REFN", "ASSO",
  "ALIA", "SUBM", "ANCI", "DESI", "RESN",
]);

/** @param {GNode} n */
function toEvent(n) {
  const date = childValue(n, "DATE");
  const place = placeOf(n);
  const type = childValue(n, "TYPE");
  const note = cleanText(child(n, "NOTE")?.value);
  const value = cleanText(n.value);
  if (!(n.tag in LABELS) && !date && !place) return null;
  const label = n.tag === "EVEN" && type ? type : LABELS[n.tag] ?? (type || "Event");
  const details = [value, note].filter(Boolean).join("\n") || null;
  /** @type {GEvent} */
  const ev = { kind: n.tag, label, date, place, details };
  return ev;
}

/**
 * @param {string} text the whole .ged file
 * @param {{ currentYear?: number }} [opts]
 */
export function parseGedcom(text, opts = {}) {
  const currentYear = opts.currentYear ?? new Date().getFullYear();
  const cutoff = currentYear - 100; // "100-year rule": born after this and no death record = possibly living
  const roots = parseLines(text);
  const head = roots.find((r) => r.tag === "HEAD");
  const warnings = /** @type {string[]} */ ([]);

  /** @type {Map<string, GPerson & { _years: number[] }>} */
  const people = new Map();
  for (const r of roots) {
    if (r.tag !== "INDI" || !r.xref) continue;
    const names = r.children.filter((c) => c.tag === "NAME").map(parseName);
    const primary = names[0] ?? { given: null, surname: null, suffix: null };
    const full = (/** @type {typeof primary} */ n) => [n.given, n.surname].filter(Boolean).join(" ");
    const altNames = [...new Set(names.slice(1).map(full).filter((n) => n && n !== full(primary)))];
    const sexRaw = childValue(r, "SEX")?.toUpperCase();
    const events = /** @type {GEvent[]} */ ([]);
    for (const c of r.children) {
      if (NOT_EVENTS.has(c.tag) || (c.tag.startsWith("_") && c.tag !== "_MILT")) continue;
      const ev = toEvent(c);
      if (ev) events.push(ev);
    }
    const birth = events.find((e) => e.kind === "BIRT");
    const death = events.find((e) => e.kind === "DEAT");
    people.set(r.xref, {
      xref: r.xref,
      given: primary.given,
      surname: primary.surname,
      suffix: primary.suffix,
      altNames,
      sex: sexRaw === "M" || sexRaw === "F" ? sexRaw : sexRaw === "U" ? "U" : null,
      birthDate: birth?.date ?? null,
      birthPlace: birth?.place ?? null,
      deathDate: death?.date ?? null,
      deathPlace: death?.place ?? null,
      isLiving: !events.some((e) => DEATH_LIKE.has(e.kind)),
      events,
      _years: [],
    });
    if (!primary.given && !primary.surname) warnings.push(`${r.xref} has no name`);
  }

  /** @type {GFamily[]} */
  const families = [];
  for (const r of roots) {
    if (r.tag !== "FAM" || !r.xref) continue;
    const ptr = (/** @type {string} */ tag) => {
      const v = clean(child(r, tag)?.value);
      return v && people.has(v) ? v : null;
    };
    const partner1 = ptr("HUSB");
    const partner2 = ptr("WIFE");
    const children = [
      ...new Set(r.children.filter((c) => c.tag === "CHIL").map((c) => c.value.trim()).filter((x) => people.has(x))),
    ];
    const marr = child(r, "MARR");
    const div = child(r, "DIV");
    const fam = {
      xref: r.xref,
      partner1,
      partner2,
      children,
      marriageDate: marr ? childValue(marr, "DATE") : null,
      marriagePlace: marr ? placeOf(marr) : null,
    };
    families.push(fam);

    // Marriages and divorces belong on both partners' timelines.
    for (const [me, other] of [
      [partner1, partner2],
      [partner2, partner1],
    ]) {
      const p = me ? people.get(me) : null;
      if (!p) continue;
      const o = other ? people.get(other) : null;
      const otherName = o ? [o.given, o.surname].filter(Boolean).join(" ") : null;
      for (const [node, word] of /** @type {const} */ ([
        [marr, "Married"],
        [div, "Divorced"],
      ])) {
        if (!node) continue;
        const date = childValue(node, "DATE");
        const place = placeOf(node);
        // Ancestry sometimes repeats a marriage on the person record too.
        const dupe = p.events.findIndex((e) => e.kind === node.tag && e.date === date && (!place || !e.place || e.place === place));
        const ev = { kind: node.tag, label: otherName ? `${word} ${otherName}` : word, date, place, details: null };
        const existing = p.events[dupe];
        if (existing) p.events[dupe] = { ...ev, place: place ?? existing.place };
        else p.events.push(ev);
      }
    }
  }

  // Who might still be alive? No death record and no sign of being born more
  // than 100 years ago. Unknowns count as living, to stay on the private side.
  const byXref = (/** @type {string | null} */ x) => (x ? people.get(x) : undefined);
  for (const p of people.values()) {
    for (const e of p.events) {
      const y = yearOf(e.date);
      if (y && !DEATH_LIKE.has(e.kind)) p._years.push(y);
    }
  }
  for (const p of people.values()) {
    if (!p.isLiving) continue;
    const born = yearOf(p.birthDate);
    if (born) {
      p.isLiving = born > cutoff;
      continue;
    }
    // No birth year: any dated event in their life before the cutoff means they
    // were born before it. So does a child born, or a marriage, too long ago.
    let earliest = Math.min(...p._years, Infinity);
    for (const f of families) {
      const isPartner = f.partner1 === p.xref || f.partner2 === p.xref;
      if (!isPartner) continue;
      const married = yearOf(f.marriageDate);
      if (married) earliest = Math.min(earliest, married - 15);
      for (const c of f.children) {
        const cb = yearOf(byXref(c)?.birthDate ?? null);
        if (cb) earliest = Math.min(earliest, cb - 15);
      }
    }
    p.isLiving = !(earliest <= cutoff);
  }

  const list = [...people.values()].map(({ _years, ...p }) => p);
  const surnames = new Map();
  for (const p of list) if (p.surname) surnames.set(p.surname, (surnames.get(p.surname) ?? 0) + 1);
  const births = list.map((p) => yearOf(p.birthDate)).filter((y) => y !== null);
  return {
    source: head ? childValue(head, "SOUR") : null,
    treeName: head ? clean(child(child(head, "SOUR") ?? head, "_TREE")?.value) : null,
    people: list,
    families,
    warnings,
    stats: {
      people: list.length,
      families: families.length,
      events: list.reduce((n, p) => n + p.events.length, 0),
      living: list.filter((p) => p.isLiving).length,
      earliestBirth: births.length ? Math.min(...births) : null,
      topSurnames: [...surnames].sort((a, b) => b[1] - a[1]).slice(0, 8),
    },
  };
}
