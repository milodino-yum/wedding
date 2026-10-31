import { formatDate } from "../lib/util";

type ImportRow = {
  id: string;
  file_name: string | null;
  people: number;
  families: number;
  missing: number;
  by_name: string | null;
  created_at: number;
};

export function ImportPage(props: { imports: ImportRow[] }) {
  return (
    <>
      <nav class="breadcrumbs" aria-label="Breadcrumb">
        <a href="/admin">Admin</a> › Import from Ancestry
      </nav>
      <h1>Import the family tree</h1>

      <section class="card">
        <h2>1. Download your tree from Ancestry</h2>
        <p>
          On Ancestry, open <strong>Trees</strong>, pick your tree, then <strong>Tree Settings → Export tree</strong>.
          When it's ready, download the <code>.ged</code> file.
        </p>
        <h2>2. Choose the file</h2>
        <p class="muted">
          The file is read on this computer. Nothing is saved until you press Import, and only names, dates, places,
          relationships and life events are sent to the site.
        </p>
        <input type="file" id="gedcom-file" accept=".ged,.gedcom,text/plain" />
        <p class="error" id="import-error" hidden></p>

        <div id="import-preview" hidden>
          <h2>3. Check and import</h2>
          <dl class="import-stats" id="import-stats"></dl>
          <p class="muted small" id="import-living-note"></p>
          <p class="muted small">
            Importing again later is safe: people already on the site are updated, not duplicated, and nobody is
            deleted, so stories stay attached.
          </p>
          <button type="button" class="primary" id="import-button">
            Import
          </button>
          <div class="progress" id="import-progress" hidden>
            <div class="progress-bar" id="import-progress-bar"></div>
          </div>
          <p class="notice" id="import-done" role="status" hidden></p>
        </div>
      </section>

      {props.imports.length > 0 && (
        <section class="card">
          <h2>Earlier imports</h2>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>File</th>
                  <th>People</th>
                  <th>Families</th>
                  <th>Not in file</th>
                </tr>
              </thead>
              <tbody>
                {props.imports.map((i) => (
                  <tr>
                    <td>
                      {formatDate(i.created_at)}
                      {i.by_name && <div class="muted small">by {i.by_name}</div>}
                    </td>
                    <td class="small">{i.file_name ?? ""}</td>
                    <td>{i.people}</td>
                    <td>{i.families}</td>
                    <td>{i.missing}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p class="muted small">"Not in file" counts people on the site who weren't in that file. They are kept.</p>
        </section>
      )}
      <script type="module" src="/import.js"></script>
    </>
  );
}
