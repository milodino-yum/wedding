// Admin import page: parse the chosen .ged file here in the browser, preview
// it, then send it to the site in small batches.
import { parseGedcom } from "/gedcom.js";

const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
const fileInput = /** @type {HTMLInputElement} */ ($("gedcom-file"));
const button = /** @type {HTMLButtonElement} */ ($("import-button"));
const BATCH = 25;

/** @type {ReturnType<typeof parseGedcom> | null} */
let parsed = null;
let fileName = "";

function showError(msg) {
  const el = $("import-error");
  el.textContent = msg;
  el.hidden = !msg;
}

function stat(dl, label, value) {
  const dt = document.createElement("dt");
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.textContent = String(value);
  dl.append(dt, dd);
}

fileInput.addEventListener("change", async () => {
  showError("");
  $("import-preview").hidden = true;
  $("import-done").hidden = true;
  const file = fileInput.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    if (!/^﻿?\s*0\s+HEAD/.test(text)) throw new Error("This doesn't look like a GEDCOM (.ged) file.");
    parsed = parseGedcom(text);
    fileName = file.name;
  } catch (err) {
    parsed = null;
    showError(err instanceof Error ? err.message : String(err));
    return;
  }
  const s = parsed.stats;
  const dl = $("import-stats");
  dl.replaceChildren();
  if (parsed.treeName) stat(dl, "Tree", parsed.treeName);
  stat(dl, "People", s.people.toLocaleString());
  stat(dl, "Families", s.families.toLocaleString());
  stat(dl, "Life events", s.events.toLocaleString());
  if (s.earliestBirth) stat(dl, "Earliest birth", s.earliestBirth);
  if (s.topSurnames.length) stat(dl, "Most common surnames", s.topSurnames.map(([n, c]) => `${n} (${c})`).join(", "));
  $("import-living-note").textContent =
    `${s.living} ${s.living === 1 ? "person looks" : "people look"} like they may still be living ` +
    "(no death record, and not known to be born more than 100 years ago).";
  button.textContent = `Import ${s.people.toLocaleString()} people`;
  button.disabled = false;
  $("import-preview").hidden = false;
});

async function post(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `The site answered ${res.status}`);
  return data;
}

button.addEventListener("click", async () => {
  if (!parsed) return;
  button.disabled = true;
  fileInput.disabled = true;
  showError("");
  const bar = $("import-progress-bar");
  $("import-progress").hidden = false;
  const { people, families } = parsed;
  const total = Math.ceil(people.length / BATCH) + Math.ceil(families.length / BATCH) + 1;
  let done = 0;
  const tick = () => (bar.style.width = `${Math.round((++done / total) * 100)}%`);
  try {
    for (let i = 0; i < people.length; i += BATCH) {
      await post("/admin/import/people", { people: people.slice(i, i + BATCH) });
      tick();
    }
    for (let i = 0; i < families.length; i += BATCH) {
      await post("/admin/import/families", { families: families.slice(i, i + BATCH) });
      tick();
    }
    const fin = await post("/admin/import/finish", {
      fileName,
      xrefs: people.map((p) => p.xref),
      familyXrefs: families.map((f) => f.xref),
    });
    tick();
    const doneEl = $("import-done");
    doneEl.replaceChildren(
      `Imported ${people.length.toLocaleString()} people and ${families.length.toLocaleString()} families. `,
    );
    if (fin.missing) doneEl.append(`${fin.missing} people on the site weren't in this file and were kept. `);
    const link = document.createElement("a");
    link.href = "/people";
    link.textContent = "See everyone";
    doneEl.append(link);
    doneEl.hidden = false;
    button.textContent = "Imported";
  } catch (err) {
    showError(`The import stopped: ${err instanceof Error ? err.message : err}. You can safely try again.`);
    button.disabled = false;
  } finally {
    fileInput.disabled = false;
  }
});
