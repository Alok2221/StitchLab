import type { DesignDocument } from '../document/model'
import { svgToCanvas } from '../export/raster'
import { documentToSvg, escapeXml } from '../export/svg'
import type { Garment, GarmentTemplate, Rect } from '../templates'
import type { TemplateZone } from '../templates/parseTemplate'
import { combinedHeight, gridFor, inflate, maskFor, smoothHeight, type Coverage, type InflatedMesh, type InflateOptions } from './inflate'
import { loadGarmentMesh } from './loadMesh'
import { meshSpecFor } from './meshCatalog'

/** Grid samples along the long side of a template. */
const GRID_SAMPLES = 260
/** Silhouette pixels per grid step, so the outline is found to a fraction of a cell. */
const SILHOUETTE_OVERSAMPLE = 4
/** Long side of a view texture, in pixels. */
const TEXTURE_LONG_SIDE = 2048
const OUTLINE_WIDTH = 1.5

/**
 * How far each kind of garment puffs out. The cap uses the short side of the template,
 * so a long dress or a pair of trousers cannot become as deep as it is tall.
 */
export function inflateOptions(template: GarmentTemplate): InflateOptions {
  const span = Math.min(template.viewBox.width, template.viewBox.height)
  switch (template.category) {
    case 'footwear':
      return { roundness: 0.55, maxDepth: span * 0.12 }
    case 'bags':
      return { roundness: 0.18, maxDepth: span * 0.045 }
    case 'dresses':
      return { roundness: 0.28, maxDepth: span * 0.07 }
    case 'bottoms':
      return { roundness: 0.42, maxDepth: span * 0.085 }
    default:
      return { roundness: 0.36, maxDepth: span * 0.085 }
  }
}

/** The given parts of a view filled black, including the outline drawn around them. */
export function silhouetteSvg(template: GarmentTemplate, zones: TemplateZone[] = template.zones): string {
  const { x, y, width, height } = template.viewBox
  const paths = zones
    .map(
      (z) =>
        `<path d="${escapeXml(z.path)}" fill="#000" stroke="#000" stroke-width="${OUTLINE_WIDTH}" stroke-linejoin="round" />`
    )
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${width} ${height}" width="${width}" height="${height}">${paths}</svg>`
}

/** Bilinear coverage from an alpha image of the viewBox drawn at `scale` pixels per unit. */
export function coverageFromAlpha(alpha: Uint8Array, width: number, height: number, viewBox: Rect, scale: number): Coverage {
  const at = (i: number, j: number) => (i < 0 || j < 0 || i >= width || j >= height ? 0 : alpha[j * width + i] / 255)
  return (x, y) => {
    const fx = (x - viewBox.x) * scale - 0.5
    const fy = (y - viewBox.y) * scale - 0.5
    const i = Math.floor(fx)
    const j = Math.floor(fy)
    const tx = fx - i
    const ty = fy - j
    const top = at(i, j) * (1 - tx) + at(i + 1, j) * tx
    const bottom = at(i, j + 1) * (1 - tx) + at(i + 1, j + 1) * tx
    return top * (1 - ty) + bottom * ty
  }
}

async function zoneCoverage(template: GarmentTemplate, zones: TemplateZone[], scale: number): Promise<Coverage> {
  const { width, height } = template.viewBox
  const canvas = await svgToCanvas(silhouetteSvg(template, zones), { width, height, scale })
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context is not available')
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  const alpha = new Uint8Array(canvas.width * canvas.height)
  for (let k = 0; k < alpha.length; k++) alpha[k] = pixels[k * 4 + 3]
  return coverageFromAlpha(alpha, canvas.width, canvas.height, template.viewBox, canvas.width / width)
}

function maxCoverage(parts: Coverage[]): Coverage {
  return (x, y) => parts.reduce((m, c) => Math.max(m, c(x, y)), 0)
}

/**
 * Body of a garment for the 3D preview: a CC0 GLB shell when one is catalogued,
 * otherwise an inflated silhouette (each part puffs on its own so legs and sleeves stay separate).
 */
export async function garmentMesh(garment: Garment): Promise<InflatedMesh> {
  const spec = meshSpecFor(garment.id)
  if (spec) return loadGarmentMesh(spec)
  const [front] = garment.views
  const grid = gridFor(front.viewBox, GRID_SAMPLES)
  const scale = SILHOUETTE_OVERSAMPLE / grid.step
  const options = inflateOptions(front)
  const axis = 2 * grid.x + grid.width
  const ids = [...new Set(garment.views.flatMap((view) => view.zones.map((z) => z.id)))]

  const parts = await Promise.all(
    ids.map(async (id) => {
      const pieces = await Promise.all(
        garment.views.map(async (view, index) => {
          const zone = view.zones.find((z) => z.id === id)
          if (!zone) return null
          const coverage = await zoneCoverage(view, [zone], scale)
          return index === 0 ? coverage : ((x: number, y: number) => coverage(axis - x, y))
        })
      )
      return maxCoverage(pieces.filter((c): c is Coverage => c !== null))
    })
  )

  const outline = maxCoverage(parts)
  const height = smoothHeight(combinedHeight(parts.map((part) => maskFor(part, grid)), grid, options), maskFor(outline, grid), grid)
  return inflate(outline, grid, options, height)
}

/** One view as it looks in the editor, on a transparent background. */
export function viewTexture(doc: DesignDocument, template: GarmentTemplate): Promise<HTMLCanvasElement> {
  const { width, height } = template.viewBox
  return svgToCanvas(documentToSvg(doc, template), { width, height, scale: TEXTURE_LONG_SIDE / Math.max(width, height) })
}

/**
 * `view` drawn over a left-right mirror of `other`. Where the outlines of the two views differ,
 * such as a hood drawn only on the back, the surface shows the other side instead of a hole.
 */
export function withMirroredUnderlay(view: HTMLCanvasElement, other: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = view.width
  canvas.height = view.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context is not available')
  ctx.save()
  ctx.scale(-1, 1)
  ctx.drawImage(other, -canvas.width, 0, canvas.width, canvas.height)
  ctx.restore()
  ctx.drawImage(view, 0, 0)
  return canvas
}

/** Dominant part fill used to hide transparent holes when the design is mapped onto a GLB. */
export function fabricColorFor(doc: DesignDocument, garment: Garment): string {
  const zone = garment.zones[0]
  if (!zone) return '#d0d0d0'
  return doc.zoneColors[zone.id] ?? zone.defaultColor
}
