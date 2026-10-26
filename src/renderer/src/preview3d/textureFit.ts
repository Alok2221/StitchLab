export interface PixelBounds {
  x: number
  y: number
  width: number
  height: number
}

const ALPHA_CUTOFF = 8

/** Axis-aligned box of RGBA pixels with alpha above a small cutoff, or null if empty. */
export function opaqueBoundsFromRgba(
  data: ArrayLike<number>,
  width: number,
  height: number,
  cutoff = ALPHA_CUTOFF
): PixelBounds | null {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] <= cutoff) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  if (maxX < minX) return null
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

/** Axis-aligned box of pixels with alpha above a small cutoff, or null if the canvas is empty. */
export function opaqueBounds(canvas: HTMLCanvasElement, cutoff = ALPHA_CUTOFF): PixelBounds | null {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context is not available')
  const { width, height } = canvas
  return opaqueBoundsFromRgba(ctx.getImageData(0, 0, width, height).data, width, height, cutoff)
}

/**
 * Stretch the opaque region of `source` over the whole canvas so a planar 0–1 UV
 * on the 3D mesh samples the design instead of the empty viewBox margins.
 */
export function stretchOpaqueToFill(source: HTMLCanvasElement): HTMLCanvasElement {
  const bounds = opaqueBounds(source)
  if (!bounds) return source
  if (bounds.x === 0 && bounds.y === 0 && bounds.width === source.width && bounds.height === source.height) {
    return source
  }
  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context is not available')
  ctx.drawImage(
    source,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    0,
    0,
    canvas.width,
    canvas.height
  )
  return canvas
}

/** Paint `color` behind `source` so leftover transparent holes (neck, gaps) are not black on the mesh. */
export function fillBehind(source: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context is not available')
  ctx.fillStyle = color
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(source, 0, 0)
  return canvas
}

/**
 * Prepare a view for planar mapping onto a GLB: underlay the other side, stretch the
 * cloth silhouette to the full texture, then fill any remaining holes with fabric color.
 */
export function fitTextureForMesh(
  view: HTMLCanvasElement,
  other: HTMLCanvasElement,
  fabricColor: string,
  underlay: (view: HTMLCanvasElement, other: HTMLCanvasElement) => HTMLCanvasElement
): HTMLCanvasElement {
  return fillBehind(stretchOpaqueToFill(underlay(view, other)), fabricColor)
}
