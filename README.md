# Basin Harbor Reception Layout Planner

A single-page, browser-based 3D layout planner for two Basin Harbor reception spaces: the
outdoor **Surprise Garden** and the indoor **Town Hall**. No backend, no build step.

Pick the venue in the header. Each venue is its own page (`index.html?venue=garden` or
`index.html?venue=townhall`) and keeps its own autosaved layout; opening the page without
`?venue` brings back the last one used.

## Run it

Option A: double-click `index.html`. Everything is local, so it works offline.

Option B: any static server, e.g.

```
python3 -m http.server 8000
# then open http://localhost:8000/
```

Option C: the desktop app (below).

## Desktop app

The same planner in its own window, for macOS, Windows and Linux (Electron). It adds native
menus and keeps its own autosave, separate from any browser's:

| Menu | |
| --- | --- |
| File | Open Layout… (`Ctrl/Cmd+O`), Save Layout… (`Ctrl/Cmd+S`), Export PNG… (`Ctrl/Cmd+E`), Load Example, Clear Layout |
| Venue | Surprise Garden (`Ctrl/Cmd+1`), Town Hall (`Ctrl/Cmd+2`) |
| View | Top-down, Reset View, zoom, full screen |

Save and export ask where to put the file and remember the folder; the window reopens at its
last size and position. To move a layout from the browser version, Save JSON there and use
File → Open Layout… in the app.

**Getting the installers.** Download them from the repository's **Releases** page, which also
lists the install steps. GitHub also builds them whenever the planner changes (workflow
`Desktop app`, also runnable by hand from the Actions tab); those builds sit under each run's
artifacts:

- macOS: `Wedding-Layout-Planner-…-mac-universal.dmg` (Apple silicon and Intel). Open it and drag the
  app to Applications.
- Windows: `Wedding-Layout-Planner-…-win-x64.exe`, a setup program.
- Linux: `Wedding-Layout-Planner-…-linux-x86_64.AppImage`; make it executable and run it.

Pushing a `v*` tag (e.g. `v1.0.1`, after raising `version` in `package.json`) publishes a release with the three installers.

The installers are not signed with an Apple or Microsoft developer certificate, so the first
launch needs one extra step:

- macOS: if it says the app can't be opened, go to System Settings → Privacy & Security and
  click **Open Anyway** (or right-click the app → Open).
- Windows: on the SmartScreen prompt, click **More info → Run anyway**.

**From source:** `npm install`, then `npm start` runs the app and `npm run dist` builds an
installer for the current system into `dist/` (`dist:mac`, `dist:win`, `dist:linux` pick one).
The shell is `desktop/main.js`; `desktop/build/icon.png` is the app icon.

## What's in the box

- `index.html` – the whole app (all CSS and JS inline).
- `vendor/three.bundle.js` – Three.js 0.170 plus OrbitControls, bundled into one classic
  script so the page runs from `file://` without a server or a CDN (MIT, see `vendor/THREE-LICENSE`).
- `plan-image.js` – the garden floor plan from the PDF, embedded as a base64 WebP and
  scaled from the plan's 20 ft bar (6 px per foot). Shown under the grid; toggle with
  the "Floor plan" checkbox.
- `desktop/`, `package.json` – the desktop app (see above); `.github/workflows/desktop.yml` builds its installers.
- `town-hall-plan.js` – the Town Hall floor from the Matterport tour's floor-plan view, as a
  base64 WebP (12 px per foot): turned to match the venue's plan, levelled, scaled from the
  measured 68'11" wall, with the scanned chairs and the measurement overlay painted out so the
  real carpet shows under your layout.

## Surprise Garden

The room boundary is a polygon traced from the PDF (deck edge, garden, curved walkway
and the lower lawn). Objects are clamped so their footprint, chairs included, stays inside it.

### Site features (from the venue photos)

Toggled with the **Site** checkbox. They are context, not placeable objects:

- Main lodge (three storeys, red roof) with the vine-covered porch face and the raised,
  railed **lodge deck** with its two stair notches where the PDF draws them. A path runs
  along the foot of the deck and joins the terrace.
- The single-storey **dining wing** with its curved roof. Its **porch** is the roof
  overhang: posts stand on the PDF's walkway line and the wall is about 10 ft behind them.
- The paved **terrace** along the posts (where the venue's own drawing puts cocktail
  tables), and the oval **flower bed** on the lawn side of it, running only along the
  pavilion. A small hydrangea bed sits in front of the enclosed porch. Both beds are
  no-go zones: objects cannot be placed on them.
- The shrub bank along the lake-view edge and the lake beyond it, for orientation.

- The **Terrace Room** (35 × 49 ft, 10 ft ceiling, about 1,715 sq ft) at the far end of the
  dining wing, past Ardelia's dining room, drawn open-topped so you can place things inside.
  Its exit wall with the door sits on the porch facing the lower lawn of the surprise garden,
  its long window wall faces the end of the wing, and French doors open into Ardelia's. It is a second placeable zone with its own table, seat and free-area
  tally in the Layout panel; the selected-object panel says which zone an object is in.

Depths and heights are estimates from the photos; the PDF gives the positions. Mature
trees are regular palette objects (footprint = trunk only) so you can move them to where
the trees really are; the example layout drops seven at approximate spots.

## Town Hall

Sources: the Matterport tour (Basin Harbor – Town Hall, by Adirondack Drone) and its
floor-plan view measurements, the venue's spec sheet (29' × 82' × 17' ceiling, 2,372 sq ft)
and its schematic plan, photos from the tour, and street-view photos of the outside.

Three placeable zones, each tallied separately in the Layout panel:

- **Town Hall** (about 2,180 sq ft of floor): the 68'11" × 28'8" hall plus the 10'3" side bay
  at its east end. The bay has a lower ceiling behind a beam carried on a single post (a
  no-go spot), restroom doors, and an alcove to the Board Room corridor. The stairwell down to
  the Ranger Room is a 19'5" × 5' box let into the hall's deck-side corner. The four dark wall
  posts under the trusses are no-go spots too.
- **Sun Porch** (29'3" × 15'): glazed doors from the side bay, windows on the deck sides, a
  glazed door out to the deck, one to the entrance porch and one to the Board Room.
- **Deck (approx.)**: not in the scan. It runs right along the Sun Porch windows and the front of
  the Board Room, as the street view shows; the rest of its outline is scaled from the venue's
  plan, which is not drawn to scale, so treat it as a sketch until it is measured.

The **Site** checkbox draws the room around them: walls with the tall draped windows, glazed
doors and doors; the exit doors next to the stairwell (push bars, transoms, EXIT sign) out to
the gabled entrance porch with its stone steps; the stained trusses with knee braces and
rafters; the three iron chandeliers; the projector screen housing; and the restrooms and Board
Room for orientation. The hall has a tray ceiling, as in the tour: walls up to the tie beams
at about 13½ ft, then slopes rising to a flat 17 ft down the middle. Ceilings only appear when
the camera is inside, so orbit down to eye level in the hall to see the room as a guest would.
Otherwise walls are open at the top, and any wall (or the entrance porch roof) standing between
the camera and the room drops to sill height, so you can always see in. Looking straight down
(Top-down, or Export PNG) shows every wall as a low outline and hides the trusses and
chandeliers.

What is measured and what is estimated: the room outlines are from the tour's measurements
(the 68'11", 49'11", 19'5", 28'8", 23'8", 10'3", 28'10", 9'7", 29'3", 14'10" and 15'3"
dimensions). Door, window, truss, post and chandelier positions are read off the photos and the
floor-plan view, to within a couple of feet; the entrance porch's size and the 13½ ft eave of
the tray ceiling are estimated from photos. The side bay and porch ceiling heights (about
9 ft) are estimates; the 17 ft hall ceiling is the venue's figure.

**Load example** sets up a reception for about 100. A head table sits at the screen wall with
the dance floor and DJ in front of it. Eight 72" rounds of ten fill the rest of the hall, kept
clear of the doors. The bar and cake go in the side bay, escort cards, gifts and cocktail
tables on the Sun Porch, and four cocktail tables out on the deck.

## Controls

| Action | How |
| --- | --- |
| Add object | click it in the left palette (lands at the centre of the current view) |
| Select | click it |
| Move | drag on the ground, or arrow keys (Shift = 4× step) |
| Rotate | drag the orange knob, `R` / `Shift+R`, or type degrees in the panel; the step (1°, 5°, 15°, 45°, default 5°) is set in the header and also snaps the knob when Snap is on |
| Delete | `Delete` or `Backspace` |
| Duplicate | `Ctrl/Cmd+D` |
| Orbit / pan / zoom | left-drag on empty ground / right-drag / wheel |
| Top-down view | `T` or the Top-down button; Reset view restores the 3/4 view |
| Snap to grid | header toggle, 3 in / 6 in / 1 ft / 2 ft (default 6 in) |

The right panel shows the selected object's label, position (feet from the plan's top-left
corner), rotation (degrees, clockwise from above), dimensions (editable for bars, buffets,
dance floor, stage, DJ booth, lounge pieces, trees, arch and custom boxes) and seat count
for dining tables and ceremony rows. Chairs are auto-arranged around dining tables and follow the
seat count; a ceremony chair row grows with its seat count and is tallied separately.

## Saving

- Autosave to `localStorage` on every change, per venue; reopening the page restores the last layout.
- **Save JSON / Load JSON** download or upload the layout as a file. The file records its
  venue; loading a file made for the other venue offers to switch to it and opens it there.
  Files saved before the Town Hall was added are garden layouts.
- **Export PNG** renders a straight-down orthographic image of the whole venue.
- **Load example**, in the garden, recreates the sample layout drawn in the venue's PDF
  (8 rounds, three rows of 8' banquet tables, bar + back bar, cocktail tables, uplights,
  lanterns, the eight coloured Adirondack chairs and approximate tree positions). In the
  Town Hall, it loads the sample reception described above.

## Rebuilding the vendor bundle

```
npm i three@0.170.0 esbuild
printf "import * as THREE from 'three';\nimport { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';\nwindow.THREE = Object.assign({}, THREE, { OrbitControls });\n" > entry.js
npx esbuild entry.js --bundle --minify --format=iife --outfile=vendor/three.bundle.js
```
