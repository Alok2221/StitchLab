# Tech stack

Decisions for the StitchLab desktop app. Product context is in
[PRODUCT_BRIEF.md](PRODUCT_BRIEF.md).

---

## Summary

- **Desktop shell:** Electron
- **Language:** TypeScript (strict) in every process
- **Build tooling:** electron-vite (Vite for main, preload and renderer)
- **UI:** React
- **2D canvas:** PixiJS v8 (WebGL, WebGPU when available)
- **3D preview:** Three.js
- **State:** Zustand, with an operation-based document model for undo / redo
- **Export:** PNG from the renderer, SVG from the document model, PDF via pdf-lib
- **Packaging:** electron-builder - Windows NSIS installer (`npm run dist:win`),
  macOS DMG planned. Only `out/` is packed into the asar; renderer
  dependencies are already bundled by Vite.
- **Tests:** Vitest (unit), Playwright for Electron (end-to-end)
- **Quality:** ESLint, Prettier

---

## Why

**Electron** - one language (TypeScript) across the whole app, mature tooling,
reliable Chromium rendering with WebGL on both Windows and macOS. The cost is a
larger install and higher memory use than Tauri; we accept it for faster
development and predictable rendering.

**React** - the panels around the canvas (layers, palette, libraries, properties)
are classic UI and benefit from a component model. The canvas itself is not
rendered by React.

**PixiJS** - GPU-accelerated 2D rendering, which matches the performance goals in
the brief (smooth pan / zoom, many layers, large images). SVG templates are parsed
into our document model and drawn as Pixi graphics; masks handle clip-to-garment.

**Three.js** - standard choice for the mannequin preview; the 2D design is
rendered to a texture and mapped through the template's UV map.

**Zustand + operations** - lightweight store; every edit is an operation
(apply / revert), which gives cheap undo / redo, small autosave deltas and version
history.

---

## Process layout

```
main process      window, menus, file system, autosave, export workers
preload           narrow, typed bridge (contextBridge), no Node in renderer
renderer          React UI + PixiJS canvas + Three.js preview
```

Security defaults: `contextIsolation: true`, `nodeIntegration: false`,
`sandbox: true`. All file access goes through typed IPC handlers in the main
process.

---

## Export pipeline

The SVG generated from the document model (`src/renderer/src/export/svg.ts`) is
the single source for every format:

- **SVG** - written as is; garment parts are `<path>` elements, layers keep their
  transforms and clip paths.
- **PNG** - the SVG is rasterized by Chromium onto a canvas at the chosen scale.
- **PDF** - pdf-lib builds an A4 sheet with a 2400 px render of each exported
  view and a spec: part colors with HEX values and the layer list. Standard PDF fonts only
  support WinAnsi, so non-Latin text in the spec is transliterated.

**Colorways** - the document keeps a list of colorways (name, part colors and
part patterns) and the id of the active one; `zoneColors` and `zonePatterns`
hold the live fills of the active colorway.

**Patterns** - a part can have a repeating pattern (stripes, checks, dots, grid
or an image) drawn over its base color. Each pattern is defined once as an SVG
tile in template units (`src/renderer/src/document/patterns.ts`). Export puts
the tile into an SVG `<pattern>` with `patternTransform` for size and angle; the
canvas rasterizes the same tile into a Pixi texture and applies the same
transform through the fill matrix, so the editor and the export match. Exporting all colorways renders the same SVG once per colorway: PNG
and SVG become one file each, the PDF gets an overview page with every
colorway followed by one spec sheet per colorway.

**Views** - a garment has several views (front and back; outer and inner side
for footwear). Part colors and patterns are shared by part id, so a sleeve keeps
its color on both sides; every layer belongs to one view (`layer.view`). The
active view is UI state, not part of the undo history, but undo and redo switch
to the view they change. Changing the garment moves layers onto the new
garment's views by position (second view to second view), and undo restores
them. Copying or moving a layer to another view (`document/placement.ts`)
keeps its spot relative to the print areas, or mirrors it onto a view derived
with `mirror`, and drops a clip to a part the target view does not have.
Each view exports as its own SVG / PNG (`<garment>-<view>-<colorway>`);
the PDF shows the views side by side and groups the layer list by view.

**Lookbook** - `export/lookbook.ts` composes one SVG sheet: the garment name,
then a row per colorway with every view side by side, each view nested as its
own `<svg>` with ids prefixed per cell so clip paths and patterns do not clash.
Preview shows this sheet as an image, and PNG / SVG export can save it instead
of separate files. PNG sheets are scaled down when they would exceed the
canvas size Chromium can encode.

**3D preview** - `src/renderer/src/preview3d/` loads a CC0 GLB shell per garment
(`meshes/`, see `meshes/LICENSE.md`) and maps the flat design onto it with
planar front/back UVs (`loadMesh.ts`). Hangers and hooks are stripped by
material name. If a garment has no mesh, the older inflate path still builds a
silhouette shell. Where front and back outlines differ, the other view is used
as an underlay. The preview sits in the same canvas as the 2D editor, with
orbit, zoom, studio lighting (studio, soft, outdoor) and cameras for the front,
the back, the side and a three-quarter view. Three.js is loaded only when the
3D mode is first opened. Save PNG renders the same camera off-screen at 1024,
2048 or 4096 px on the long side and writes it through the existing file
dialog; a transparent background hides the studio backdrop and the floor shadow.

The renderer never touches the file system; it sends the bytes to the main
process, which shows the dialog, validates the request and writes the files.
`file:save` writes a single file; `file:saveMany` asks for a folder, sanitizes
the names and never overwrites existing files (it adds ` (2)`, ` (3)`, ...).

## Project file format

A `.stitch` file is a zip archive (fflate):

```
project.json      { format: "stitchlab-project", version, savedAt, document }
assets/           imported images, named by content hash, stored once
thumbnail.png     256 px preview
versions/         named snapshots (planned)
```

`project.json` holds the template id, part colors and patterns, colorways,
palette and layers; image layers and image patterns reference
`assets/<hash>.<ext>` instead of embedding data. Loading validates every field,
rejects files from newer format versions and fills in parts added to a template
after the file was saved. Format version 2 added colorways, version 3 part
patterns and version 4 the view of each layer; older files open with a single
colorway, no patterns and all layers on the first view. Template ids from
before views (`tshirt-front`, `sneaker-side`, ...) map to the garment ids.

The main process only writes project files to paths the user picked in a
dialog during the session, and saves through a temporary file and a rename.

**Recovery** - 1.5 s after each change the renderer writes the document to
`<userData>/recovery/`. On startup a leftover recovery file is offered for
restore; saving, opening, starting a new project or closing without saving
clears it.

---

## Repository layout

```
src/
  main/             Electron main process
  preload/          IPC bridge
  shared/           types shared between processes
  renderer/
    index.html
    src/
      canvas/       PixiJS editor
      document/     document model, operations, store
      panels/       React UI around the canvas
      templates/    garment SVG templates and parser
      preview3d/    Three.js preview (CC0 GLB shells + planar UV)
docs/
```

## Garment template format

A template is an SVG file with:

- `data-template-id` (the garment id, shared by all its views), `data-view`,
  `data-view-label`, `data-name` and `data-category` (`tops`, `bottoms`,
  `dresses`, `bags`, `footwear`) on the root `<svg>`,
- one `<path id="zone-<name>" data-label="..." fill="...">` per colorable part;
  `fill` is the default color, document order is drawing order,
- an optional `<rect id="print-area" fill="none">` marking the printable area.

Views of one garment share the viewBox. In back views the left and right parts
keep their ids but sit on the opposite side of the image. New templates are
registered as garments in `src/renderer/src/templates/index.ts`; a view can
also be derived from another one (`deriveView`), optionally mirrored left to
right - the tote bag back repeats the front, and footwear inner sides mirror
the outer side. The template tests check every view: unique ids, labeled
zones, hex colors, drawable paths inside the viewBox, a print area inside the
viewBox, and left / right parts swapping sides between front and back.

PixiJS runs with `pixi.js/unsafe-eval` so the renderer keeps a strict
Content Security Policy without `'unsafe-eval'`.
