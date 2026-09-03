# Garden Reception Layout Planner

A single-page, browser-based 3D layout planner for the Basin Harbor "Surprise Garden"
reception space. No backend, no build step.

## Run it

Option A: double-click `index.html`. Everything is local, so it works offline.

Option B: any static server, e.g.

```
python3 -m http.server 8000
# then open http://localhost:8000/
```

## What's in the box

- `index.html` – the whole app (all CSS and JS inline).
- `vendor/three.bundle.js` – Three.js 0.170 plus OrbitControls, bundled into one classic
  script so the page runs from `file://` without a server or a CDN (MIT, see `vendor/THREE-LICENSE`).
- `plan-image.js` – the venue floor plan from the PDF, embedded as a base64 WebP and
  scaled from the plan's 20 ft bar (6 px per foot). Shown under the grid; toggle with
  the "Floor plan" checkbox.

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

Depths and heights are estimates from the photos; the PDF gives the positions. Mature
trees are regular palette objects (footprint = trunk only) so you can move them to where
the trees really are; the example layout drops seven at approximate spots.

## Controls

| Action | How |
| --- | --- |
| Add object | click it in the left palette (lands at the centre of the current view) |
| Select | click it |
| Move | drag on the ground, or arrow keys (Shift = 4× step) |
| Rotate | drag the orange knob, `R` / `Shift+R` (15° steps), or type degrees in the panel |
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

- Autosave to `localStorage` on every change; reopening the page restores the last layout.
- **Save JSON / Load JSON** download or upload the layout as a file.
- **Export PNG** renders a straight-down orthographic image of the whole venue.
- **Load example** recreates the sample layout drawn in the venue's PDF (8 rounds, three
  rows of 8' banquet tables, bar + back bar, cocktail tables, uplights, lanterns, the eight
  coloured Adirondack chairs and approximate tree positions).

## Rebuilding the vendor bundle

```
npm i three@0.170.0 esbuild
printf "import * as THREE from 'three';\nimport { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';\nwindow.THREE = Object.assign({}, THREE, { OrbitControls });\n" > entry.js
npx esbuild entry.js --bundle --minify --format=iife --outfile=vendor/three.bundle.js
```
