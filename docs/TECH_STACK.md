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
- **Packaging:** electron-builder (Windows NSIS installer, macOS DMG)
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
- **PDF** - pdf-lib builds an A4 sheet with a 2400 px render of the design and a
  spec: part colors with HEX values and the layer list. Standard PDF fonts only
  support WinAnsi, so non-Latin text in the spec is transliterated.

The renderer never touches the file system; it sends the bytes to the main
process (`file:save` IPC), which shows the save dialog, validates the request
and writes the file.

## Project file format

A `.stitch` file is a zip archive:

```
project.json      document model (garments, layers, palette, operations log)
assets/           imported images and SVGs
versions/         named snapshots
thumbnail.png     preview for the file browser
```

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
      preview3d/    Three.js preview (planned)
docs/
```

## Garment template format

A template is an SVG file with:

- `data-template-id`, `data-name` and `data-category` (`tops`, `bottoms`,
  `dresses`, `bags`, `footwear`) on the root `<svg>`,
- one `<path id="zone-<name>" data-label="..." fill="...">` per colorable part;
  `fill` is the default color, document order is drawing order,
- an optional `<rect id="print-area" fill="none">` marking the printable area.

New templates are registered in `src/renderer/src/templates/index.ts`. The
template tests check every registered file: unique ids, labeled zones, hex
colors, drawable paths and a print area inside the viewBox. Footwear templates
use a side view.

PixiJS runs with `pixi.js/unsafe-eval` so the renderer keeps a strict
Content Security Policy without `'unsafe-eval'`.
