import type { DesignDocument } from '../document/model'
import { svgToCanvas } from '../export/raster'
import { documentToSvg, escapeXml } from '../export/svg'
import type { Garment, GarmentTemplate, Rect } from '../templates'
import { gridFor, inflate, type Coverage, type InflatedMesh, type InflateOptions } from './inflate'

/** Grid samples along the long side of a template. */
const GRID_SAMPLES = 200
/** Silhouette pixels per grid step, so the outline is found to a fraction of a cell. */
const SILHOUETTE_OVERSAMPLE = 4
/** Long side of a view texture, in pixels. */
const TEXTURE_LONG_SIDE = 2048
const OUTLINE_WIDTH = 1.5
/**
 * How far the seam sits inside the drawn outline, in template units. The surface is steep at the seam,
 * so the texture there is stretched; keeping the dark outline off it avoids a smeared black edge.
 */
const SEAM_INSET = 1.5

/** How far each kind of garment puffs out, relative to the long side of its template. */
export function inflateOptions(template: GarmentTemplate): InflateOptions {
  const size = Math.max(template.viewBox.width, template.viewBox.height)
  switch (template.category) {
    case 'footwear':
      return { roundness: 1, maxDepth: size * 0.16 }
    case 'bags':
      return { roundness: 0.25, maxDepth: size * 0.04 }
    default:
      return { roundness: 0.7, maxDepth: size * 0.16 }
  }
}

/** The garment parts of one view filled black, including the outline drawn around them. */
export function silhouetteSvg(template: GarmentTemplate): string {
  const { x, y, width, height } = template.viewBox
  const paths = template.zones
    .map(
      (z) =>
        `<path d="${escapeXml(z.path)}" fill="#000" stroke="#000" stroke-width="${OUTLINE_WIDTH}" stroke-linejoin="round" />`
    )
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${width} ${height}" width="${width}" height="${height}">${paths}</svg>`
}

/** Alpha shrunk by `radius` pixels: a square minimum filter, run along rows and then columns. */
export function erodeAlpha(alpha: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius < 1) return alpha
  const pass = (src: Uint8Array, along: number, across: number, stride: number, step: number) => {
    const out = new Uint8Array(src.length)
    for (let a = 0; a < across; a++) {
      for (let b = 0; b < along; b++) {
        let min = 255
        for (let d = -radius; d <= radius && min > 0; d++) {
          const c = b + d
          min = c < 0 || c >= along ? 0 : Math.min(min, src[a * stride + c * step])
        }
        out[a * stride + b * step] = min
      }
    }
    return out
  }
  return pass(pass(alpha, width, height, width, 1), height, width, 1, width)
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

async function silhouetteCoverage(template: GarmentTemplate, scale: number): Promise<Coverage> {
  const { width, height } = template.viewBox
  const canvas = await svgToCanvas(silhouetteSvg(template), { width, height, scale })
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context is not available')
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  const alpha = new Uint8Array(canvas.width * canvas.height)
  for (let k = 0; k < alpha.length; k++) alpha[k] = pixels[k * 4 + 3]
  const pxPerUnit = canvas.width / width
  const eroded = erodeAlpha(alpha, canvas.width, canvas.height, Math.round(SEAM_INSET * pxPerUnit))
  return coverageFromAlpha(eroded, canvas.width, canvas.height, template.viewBox, pxPerUnit)
}

/** Inflated body of a garment: the first view is the front, the second (if any) the back, seen from behind. */
export async function garmentMesh(garment: Garment): Promise<InflatedMesh> {
  const [front, back] = garment.views
  const grid = gridFor(front.viewBox, GRID_SAMPLES)
  const scale = SILHOUETTE_OVERSAMPLE / grid.step
  const frontCoverage = await silhouetteCoverage(front, scale)
  if (!back) return inflate(frontCoverage, grid, inflateOptions(front))
  const backCoverage = await silhouetteCoverage(back, scale)
  const mirror = 2 * grid.x + grid.width
  return inflate((x, y) => Math.max(frontCoverage(x, y), backCoverage(mirror - x, y)), grid, inflateOptions(front))
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
