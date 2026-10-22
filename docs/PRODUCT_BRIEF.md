# StitchLab - Product Brief

**Status:** Draft v0.1
**Product type:** Desktop application (Windows / macOS)
**Category:** 2D apparel design tool with 3D preview

> Sections 1-7 describe the original product spec, expanded with detail. Items
> marked **[Recommended]** are new proposals added on top of it.

---

## 1. Overview

StitchLab is a desktop design tool that lets people create clothing designs quickly,
starting from ready-made garment templates. Users pick a T-shirt, hoodie, pair of
trousers, dress or bag, color its individual parts, add text, graphics and patterns,
and export a production-ready file - all inside a familiar, layer-based 2D editor.
A 3D mode extends the workflow with a preview of the design on a simple mannequin.

**Tagline:** *From idea to sellable design in minutes.*

StitchLab sits between general-purpose graphics editors, which know nothing about
garments, and professional 3D fashion software, which is powerful but slow to learn.
It gives designers garment-aware tools with the simplicity of a 2D editor.

---

## 2. Problem and opportunity

**The problem**

- Professional 3D fashion tools (Clo3D, Marvelous Designer) and general 3D software
  (Blender) have a steep learning curve, demanding hardware and a pricing model built
  for studios. For a merch drop or a concept board they are overkill.
- Vector editors (Illustrator, Inkscape) are flexible, but every garment has to be
  drawn or sourced manually, colorable zones have to be built by hand, and there is
  no way to see the result on a body.
- Web-based design tools (Canva and similar) are fast, but they are not
  garment-aware: no clipping to garment shape, no per-part coloring, no print-area
  logic and limited export quality.

**The opportunity**

A growing number of small brands, print-on-demand sellers and independent designers
need to produce many clothing concepts quickly, show them to clients or customers,
and hand them off to production. They need a tool built specifically for that job:
garment templates out of the box, fast iteration, and professional output - without
a 3D learning curve.

---

## 3. Target users and personas

**Fashion designer / concept designer**
- *Goal:* explore many variations of a collection quickly before committing to
  detailed technical work.
- *Pain point:* sketching every variation from scratch or modelling it in 3D takes
  too long.
- *What StitchLab gives them:* templates, fast recoloring and pattern swaps, a quick
  3D check, and clean exports for mood boards and presentations.

**Small clothing brand owner**
- *Goal:* design and release new products without hiring a full design team.
- *Pain point:* professional tools are expensive and complex; generic tools produce
  amateur-looking results.
- *What StitchLab gives them:* a short path from idea to a professional-looking
  design, plus files ready for the manufacturer or printer.

**Merch and print-on-demand creator**
- *Goal:* launch many designs on several products (T-shirts, hoodies, bags) quickly.
- *Pain point:* adapting one graphic to many garments and print areas by hand is
  repetitive and error-prone.
- *What StitchLab gives them:* reusable designs across templates, correct print
  areas, and batch-friendly export.

**Freelance apparel designer**
- *Goal:* deliver polished designs and revisions to clients efficiently.
- *Pain point:* clients want to see the design "on the garment", and revisions pile
  up across files.
- *What StitchLab gives them:* realistic previews, project version history, and
  consistent export formats.

**Hobbyist and concept creator without 3D skills**
- *Goal:* turn clothing ideas into something visual and shareable.
- *Pain point:* Clo3D and Blender are intimidating; drawing garments is hard.
- *What StitchLab gives them:* a low-friction editor where a good result does not
  require technical knowledge.

---

## 4. Value proposition

**Fast and convenient creation of professional clothing designs without complex 3D
tools.** StitchLab combines the simplicity of a 2D editor with the confidence of a
3D preview.

Core pillars:

- **Speed** - start from a template, not a blank canvas. A first design can be
  exported within minutes.
- **Simplicity** - layers, colors, text and graphics work the way users already
  know from popular 2D editors.
- **Garment awareness** - every template knows its parts, its shape and its print
  areas, so artwork is clipped and placed correctly.
- **Confidence** - the 3D preview shows how the design looks on a body before it
  goes to production.

How StitchLab compares:

- **vs Clo3D / Marvelous Designer** - no pattern-making or cloth simulation to learn;
  focused on surface design and visualisation; far lower barrier to entry and price.
- **vs Blender** - no modelling, UV unwrapping or rendering setup; the 3D preview
  works automatically from the 2D design.
- **vs Illustrator / Inkscape** - ready garment templates with colorable zones,
  clip-to-garment and print areas instead of drawing everything by hand.
- **vs Canva and web editors** - garment-specific tools, offline desktop
  performance, and production-grade export (vector SVG/PDF, high-DPI PNG).

---

## 5. Core features - 2D mode (main mode, MVP)

**Canvas with layers**
- Infinite-feel canvas with zoom and pan.
- Layer panel with visibility, lock, opacity, blending modes, grouping and
  reordering.

**Garment templates**
- Ready-made SVG templates: T-shirts, hoodies, trousers, dresses, bags and more.
- Each template is split into named parts (body, sleeves, collar, cuffs, hood,
  pockets, straps) that can be colored independently.

**Project color palette**
- A per-project palette of named colors, applied to garment parts, text and
  graphics.
- Changing a palette color updates every element that uses it.

**Text, graphics and patterns**
- Text with font, size, spacing, alignment, outline and fill.
- Import and placement of graphics (PNG, JPG, SVG).
- Pattern fills for garment parts and shapes.

**Editing tools**
- Move, scale, rotate, flip.
- Clip to garment shape: artwork is masked to the garment or to a single part.
- Alignment and distribution tools.

**Workflow tools**
- Layers, undo / redo.
- Grid, rulers and guides with snapping.

**Export**
- PNG (with transparent background and selectable resolution).
- SVG (vector, editable in other tools).
- PDF (print-ready, vector where possible).

---

## 6. 3D mode (extension)

- **Mannequin preview** - the current design shown on a simple 3D mannequin.
- **2D-to-3D texture mapping** - the 2D design is applied to the 3D garment as a
  texture. Each template ships with a matching 3D mesh and UV map, so mapping works
  without any setup from the user.
- **Camera** - orbit, zoom and preset views (front, back, side, three-quarter).
- **Lighting** - basic lighting setup with a small set of presets (studio, soft,
  outdoor).

The 3D mode is a preview and presentation tool, not a cloth simulator. That keeps it
fast and approachable.

---

## 7. Libraries and projects

**Garment template library**
- Browsable, searchable library grouped by category (tops, bottoms, dresses,
  outerwear, accessories).
- Templates are versioned so new releases do not break existing projects.

**Pattern and graphics library**
- Built-in patterns (stripes, checks, florals, geometric) and graphics (icons,
  shapes, badges).
- User collections for frequently used assets.

**Project system with version history**
- Projects saved locally as a single file.
- Named versions and snapshots; restore or compare earlier versions.

**Custom asset import**
- Import of own graphics, logos and patterns (PNG, JPG, SVG).
- Imported assets are stored with the project so it stays portable.

---

## 8. Proposed additions [Recommended]

### 8.1 Functionality

- **Multi-view garments** - front, back and sleeve views of the same garment kept in
  one project, with shared palette and synced garment colors.
- **Seamless pattern tools** - tile any graphic into a seamless pattern; control
  pattern scale, rotation and offset per garment part.
- **Colorways** - one design, many color variants. Define colorways from the project
  palette and export all variants in one batch.
- **Print areas and production checks** - per-template safe zones for common print
  methods (DTG, screen printing, sublimation, embroidery), with warnings for
  low-DPI images, artwork outside the print area and too many colors for screen
  printing.
- **Mockup export** - flat-lay mockups and rendered 3D views exported as images
  ready for a shop or social media.
- **Spec sheet / tech pack (light)** - a PDF summary of the design: views, colors
  (HEX / RGB, optional named references), artwork placement and dimensions, notes for
  the manufacturer.
- **Print-on-demand presets** - export presets matching print file requirements of
  popular POD platforms (size, DPI, format).
- **Keyboard shortcuts and command palette** - fast access to every action for
  power users.
- **Autosave and crash recovery** - frequent background saves and recovery of
  unsaved work after a crash.
- **Smart snapping** - snapping to garment seams, center lines and part edges, not
  only to the grid.

### 8.2 Performance

- **GPU-accelerated canvas** - rendering through WebGL / GPU so pan, zoom and
  transforms stay smooth on complex designs.
- **Viewport-based rendering and image proxies** - render only what is visible;
  large imported images use downscaled proxies while editing and full resolution
  only on export.
- **Non-destructive, operation-based editing** - edits stored as operations rather
  than pixel copies, which keeps undo cheap and project files small.
- **Incremental autosave and delta-based versions** - only changes are written to
  disk, so saving and versioning stay fast as projects grow.
- **Lazy-loaded libraries with thumbnail cache** - templates and assets load on
  demand; thumbnails are cached locally for instant browsing.
- **Background workers** - export, thumbnail generation and 3D texture baking run
  off the UI thread, so the editor never freezes.
- **Partial 3D updates** - when a design changes, only the affected garment parts
  are re-baked onto the 3D model.

**Target performance budgets**
- Cold start under 3 seconds on a mid-range laptop.
- 60 fps pan and zoom on designs with hundreds of layers.
- Projects with 1,000+ layers remain editable.
- A3 at 300 DPI PNG export in under 10 seconds.
- 3D preview update under 500 ms after a 2D change.

---

## 9. Technical direction [Recommended, non-binding]

- **Desktop shell** - Tauri (small install size, low memory use) or Electron
  (larger ecosystem, more mature tooling).
- **2D rendering** - Canvas / WebGL, for example PixiJS or a Skia-based renderer.
- **3D rendering** - Three.js for the mannequin, camera, lighting and texture
  mapping.
- **Project format** - a single archive file containing a JSON document model plus
  embedded assets; easy to version, back up and share.
- **Template specification** - SVG templates with:
  - named zone IDs for each colorable part,
  - a clip path for the garment outline,
  - print-area definitions,
  - a reference to the matching 3D mesh and UV map.

A documented template specification also opens the door to user-made and
third-party templates later.

---

## 10. Roadmap

**MVP**
- 2D editor: canvas, layers, undo / redo, grid and guides.
- Starter template set (T-shirt, hoodie, tote bag, trousers, dress).
- Per-part coloring, project palette, text, graphics, basic patterns.
- Export to PNG, SVG, PDF.
- Local projects with autosave.

**v1.0**
- Full template, pattern and graphics libraries.
- Project version history.
- Colorways and batch export.
- Print areas and production checks.
- Multi-view garments.

**v1.x**
- 3D mode: mannequin preview, texture mapping, camera, lighting.
- Mockup export from 3D.

**Later**
- Spec sheet / tech pack export.
- Print-on-demand presets and integrations.
- Optional cloud sync and sharing.
- Collaboration and client review links.
- Marketplace for templates and pattern packs.

---

## 11. Business model

**At launch:** desktop application for Windows and macOS. A free public beta is
recommended to collect feedback and build an early user base.

**Options after launch:**

- **Freemium**
  - Free: core editor, limited template set, watermarked or lower-resolution export.
  - Pro (subscription): full libraries, high-resolution and vector export, colorways,
    3D mode, version history.
  - *Pros:* low entry barrier, recurring revenue. *Cons:* needs a steady flow of new
    content to justify the subscription.

- **One-time purchase plus add-ons**
  - One payment for the full application, with paid template and pattern packs,
    and optionally paid major upgrades.
  - *Pros:* attractive to freelancers and small brands who dislike subscriptions.
    *Cons:* less predictable revenue.

- **Hybrid** [Recommended] - one-time license for the application, plus an optional
  low-cost subscription for continuously updated libraries and future cloud features.

---

## 12. Success metrics

- **Time to first export** - minutes from first launch to the first exported design.
- **Activation rate** - share of new users who export at least one design.
- **Weekly active projects** - projects edited per week.
- **Exports per user** - number of exports per active user per month.
- **3D mode adoption** - share of projects that open the 3D preview.
- **Free-to-paid conversion** - if freemium is chosen.
- **Add-on attach rate** - share of users buying template or pattern packs.
- **Retention** - 30-day and 90-day returning users.

---

## 13. Risks and open questions

- **Template quality and coverage** - the product's value depends on a broad,
  high-quality template library. Who produces it, and at what pace?
- **2D-to-3D mapping accuracy** - artwork may distort on the 3D model; each template
  needs carefully prepared meshes and UV maps.
- **Performance on low-end hardware** - large images and the 3D view must stay
  usable on typical laptops.
- **Competition from web tools** - browser-based editors are improving quickly; the
  desktop advantage (performance, offline work, file ownership) must be clear.
- **Licensing** - bundled fonts, graphics and patterns must be cleared for
  commercial use by customers.
- **Pricing model** - to be validated with beta users before launch.
- **Open question:** should the first release target Windows and macOS at the same
  time, or one platform first?
