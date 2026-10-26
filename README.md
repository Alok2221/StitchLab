# StitchLab

Desktop app for designing clothing: start from a garment template, color its
parts, add text, graphics and patterns, and export a production-ready design.
2D editor first, 3D mannequin preview later.

**Status:** early MVP - template library (T-shirt, hoodie, trousers, dress,
tote bag, sneaker, Chelsea boot, slide sandal) with front and back views (outer
and inner side for footwear), each with its own layers, per-part coloring, palette,
part patterns (stripes, checks, dots, grid or your own image, with size and
angle),
text and image layers with move / scale / rotate and clipping to the garment
or a single part, undo / redo, pan and zoom, and export to PNG (1x-8x,
transparent or white background), SVG (editable vector) and PDF (A4 sheet with
the design, part colors and a layer list). Colorways keep several color sets of
one design side by side. Export can include every view and every colorway at
once: one PNG or SVG per view and colorway, or a single PDF with an overview
page and a spec sheet per colorway showing all views. Projects are
saved as `.stitch` files,
and unsaved work is autosaved to a recovery file that is offered on the next
start after a crash.

![StitchLab editor with layers](docs/images/editor-layers.png)

![Template library](docs/images/editor-templates.png)

## Shortcuts

- `Ctrl+Z` / `Ctrl+Shift+Z` or `Ctrl+Y` - undo / redo
- `Ctrl+N` / `Ctrl+O` - new / open project
- `Ctrl+S` / `Ctrl+Shift+S` - save / save as
- `Ctrl+E` - export
- Arrows (`Shift` for 10 units) - nudge the selected layer
- `Delete` - remove the selected layer
- `Shift` while rotating - snap to 15 degrees
- `Esc` - clear selection

## Running locally

Requires Node.js 24+ and npm 11+.

```bash
npm install
npm run dev        # Electron app with hot reload
npm test           # unit tests (Vitest)
npm run typecheck
npm run build      # production bundle in out/
npm run dist:win   # Windows installer in release/StitchLab-Setup-<version>.exe
```

Electron downloads its binary in an install script; it is allowed in
`package.json` under `allowScripts`.

The installer is built with electron-builder (`electron-builder.yml`): a per-user
NSIS setup that lets you pick the install folder and adds desktop and Start menu
shortcuts. It is not code-signed yet, so Windows SmartScreen shows a warning on
first run. The app icon source is `build/icon.svg`, rendered to
`build/icon.png`.

## Documentation

- [Product brief](docs/PRODUCT_BRIEF.md)
- [Tech stack](docs/TECH_STACK.md)
- [Branches and releases](docs/BRANCHING.md)

## Stack

Electron, TypeScript, React, PixiJS (2D), Three.js (3D). Details in
[docs/TECH_STACK.md](docs/TECH_STACK.md).
