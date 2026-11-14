import type { SilhouetteMask } from './silhouette'

export interface PixelBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface RowSpan {
  left: number
  right: number
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
  ctx.drawImage(source, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, canvas.width, canvas.height)
  return canvas
}

/** Paint `color` behind `source` so leftover transparent holes are not black on the mesh. */
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

/** Per-row inclusive span of the first–last opaque pixel; `-1` means the row is empty. */
export function rowSpans(
  width: number,
  height: number,
  opaque: (index: number) => boolean
): { left: Int16Array; right: Int16Array } {
  const left = new Int16Array(height).fill(-1)
  const right = new Int16Array(height).fill(-1)
  for (let y = 0; y < height; y++) {
    const row = y * width
    let l = -1
    let r = -1
    for (let x = 0; x < width; x++) {
      if (!opaque(row + x)) continue
      if (l < 0) l = x
      r = x
    }
    left[y] = l
    right[y] = r
  }
  return { left, right }
}

/**
 * Separate opaque runs in each row (e.g. two tote straps, two trouser legs),
 * so the 2D layout can map handle→straps and body→body instead of smearing.
 */
export function rowSegments(
  width: number,
  height: number,
  opaque: (index: number) => boolean
): RowSpan[][] {
  const rows: RowSpan[][] = []
  for (let y = 0; y < height; y++) {
    const row = y * width
    const spans: RowSpan[] = []
    let x = 0
    while (x < width) {
      while (x < width && !opaque(row + x)) x++
      if (x >= width) break
      const left = x
      while (x < width && opaque(row + x)) x++
      spans.push({ left, right: x - 1 })
    }
    rows.push(spans)
  }
  return rows
}

function sampleRgba(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  out: Uint8ClampedArray,
  offset: number
) {
  const x0 = Math.max(0, Math.min(width - 1, Math.floor(x)))
  const y0 = Math.max(0, Math.min(height - 1, Math.floor(y)))
  const x1 = Math.min(width - 1, x0 + 1)
  const y1 = Math.min(height - 1, y0 + 1)
  const tx = x - x0
  const ty = y - y0
  const i00 = (y0 * width + x0) * 4
  const i10 = (y0 * width + x1) * 4
  const i01 = (y1 * width + x0) * 4
  const i11 = (y1 * width + x1) * 4
  for (let c = 0; c < 4; c++) {
    const top = data[i00 + c] * (1 - tx) + data[i10 + c] * tx
    const bottom = data[i01 + c] * (1 - tx) + data[i11 + c] * tx
    out[offset + c] = Math.round(top * (1 - ty) + bottom * ty)
  }
}

function firstLastOccupied(rows: RowSpan[][]): { y0: number; y1: number } | null {
  let y0 = -1
  let y1 = -1
  for (let y = 0; y < rows.length; y++) {
    if (rows[y].length === 0) continue
    if (y0 < 0) y0 = y
    y1 = y
  }
  return y0 < 0 ? null : { y0, y1 }
}

function parseHexColor(color: string): [number, number, number] {
  const hex = color.trim()
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return [208, 208, 208]
  const n = Number.parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function nearestSourceRow(rows: RowSpan[][], y: number, y0: number, y1: number): number {
  const clamped = Math.max(y0, Math.min(y1, Math.round(y)))
  if (rows[clamped].length > 0) return clamped
  for (let d = 1; d <= 12; d++) {
    const a = clamped - d
    const b = clamped + d
    if (a >= y0 && rows[a].length > 0) return a
    if (b <= y1 && rows[b].length > 0) return b
  }
  return clamped
}

/**
 * Warp the flat 2D design into the 3D mesh silhouette row-by-row and segment-by-segment
 * so a tote handle stays on the straps and the body print stays on the body.
 */
export function warpDesignToSilhouette(
  design: HTMLCanvasElement,
  mask: SilhouetteMask,
  fabricColor: string
): HTMLCanvasElement {
  const dctx = design.getContext('2d')
  if (!dctx) throw new Error('Canvas 2D context is not available')
  const src = dctx.getImageData(0, 0, design.width, design.height)
  const srcRows = rowSegments(design.width, design.height, (i) => src.data[i * 4 + 3] > ALPHA_CUTOFF)
  const dstRows = rowSegments(mask.width, mask.height, (i) => mask.data[i] > 0)
  const srcRange = firstLastOccupied(srcRows)
  const dstRange = firstLastOccupied(dstRows)

  const canvas = document.createElement('canvas')
  canvas.width = mask.width
  canvas.height = mask.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context is not available')

  const [fr, fg, fb] = parseHexColor(fabricColor)
  const out = ctx.createImageData(canvas.width, canvas.height)
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = fr
    out.data[i + 1] = fg
    out.data[i + 2] = fb
    out.data[i + 3] = 255
  }
  if (!srcRange || !dstRange) {
    ctx.putImageData(out, 0, 0)
    return canvas
  }

  const srcYSpan = Math.max(1, srcRange.y1 - srcRange.y0)
  const dstYSpan = Math.max(1, dstRange.y1 - dstRange.y0)
  const sample = new Uint8ClampedArray(4)

  for (let y = dstRange.y0; y <= dstRange.y1; y++) {
    const dstSegs = dstRows[y]
    if (dstSegs.length === 0) continue
    const ty = (y - dstRange.y0) / dstYSpan
    const srcY = srcRange.y0 + ty * srcYSpan
    const srcRow = nearestSourceRow(srcRows, srcY, srcRange.y0, srcRange.y1)
    const srcSegs = srcRows[srcRow]
    if (srcSegs.length === 0) continue

    const srcL = srcSegs[0].left
    const srcR = srcSegs[srcSegs.length - 1].right
    const dstL = dstSegs[0].left
    const dstR = dstSegs[dstSegs.length - 1].right
    const srcWidth = Math.max(1e-6, srcR - srcL)
    const dstWidth = Math.max(1e-6, dstR - dstL)

    for (let s = 0; s < dstSegs.length; s++) {
      const dst = dstSegs[s]
      let sl: number
      let sr: number
      if (dstSegs.length === srcSegs.length) {
        sl = srcSegs[s].left
        sr = srcSegs[s].right
      } else {
        // Different topology (one 2D handle arch vs two 3D straps): take the matching slice
        // of the combined source span so left strap ↔ left handle, body ↔ body.
        const u0 = (dst.left - dstL) / dstWidth
        const u1 = (dst.right - dstL) / dstWidth
        sl = srcL + u0 * srcWidth
        sr = srcL + u1 * srcWidth
      }
      const segSpan = Math.max(1, dst.right - dst.left)
      const srcSpan = Math.max(1e-6, sr - sl)
      for (let x = dst.left; x <= dst.right; x++) {
        const tx = (x - dst.left) / segSpan
        const srcX = sl + tx * srcSpan
        sampleRgba(src.data, design.width, design.height, srcX, srcY, sample, 0)
        if (sample[3] <= ALPHA_CUTOFF) continue
        const o = (y * canvas.width + x) * 4
        out.data[o] = sample[0]
        out.data[o + 1] = sample[1]
        out.data[o + 2] = sample[2]
        out.data[o + 3] = 255
      }
    }
  }
  ctx.putImageData(out, 0, 0)
  return canvas
}

/** @deprecated Alias kept for older call sites / tests. */
export function fitDesignToSilhouette(
  design: HTMLCanvasElement,
  mask: SilhouetteMask,
  fabricColor: string
): HTMLCanvasElement {
  return warpDesignToSilhouette(design, mask, fabricColor)
}

/**
 * Prepare a view for planar mapping onto a GLB: underlay the other side, then
 * warp the 2D layout into the mesh silhouette so zones keep their place.
 */
export function fitTextureForMesh(
  view: HTMLCanvasElement,
  other: HTMLCanvasElement,
  fabricColor: string,
  underlay: (view: HTMLCanvasElement, other: HTMLCanvasElement) => HTMLCanvasElement,
  silhouette?: SilhouetteMask | null
): HTMLCanvasElement {
  const prepared = underlay(view, other)
  if (!silhouette) return fillBehind(stretchOpaqueToFill(prepared), fabricColor)
  return warpDesignToSilhouette(prepared, silhouette, fabricColor)
}
