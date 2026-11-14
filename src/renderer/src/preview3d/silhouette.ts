import type { InflatedMesh } from './inflate'

/** Binary mask: 1 = inside the projected cloth, 0 = outside. */
export interface SilhouetteMask {
  width: number
  height: number
  /** Row-major, length `width * height`. */
  data: Uint8Array
}

/**
 * Rasterize one side of the mesh into UV space (u → x, v → y from the bottom).
 * The result matches planar UVs on the mesh, so a texture warped into this mask
 * lands on the cloth without empty margins or overhang.
 */
export function rasterizeMeshSilhouette(mesh: InflatedMesh, front: boolean, size: number): SilhouetteMask {
  const width = size
  const height = size
  const data = new Uint8Array(width * height)
  const { uvs, indices, frontIndexCount } = mesh
  const i0 = front ? 0 : frontIndexCount
  const i1 = front ? frontIndexCount : indices.length

  const cover = (x0: number, y0: number, x1: number, y1: number, x2: number, y2: number) => {
    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)))
    const maxX = Math.min(width - 1, Math.ceil(Math.max(x0, x1, x2)))
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)))
    const maxY = Math.min(height - 1, Math.ceil(Math.max(y0, y1, y2)))
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
    if (Math.abs(area) < 1e-8) return
    const sign = area > 0 ? 1 : -1
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5
        const py = y + 0.5
        const w0 = ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) * sign
        const w1 = ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)) * sign
        const w2 = ((x0 - px) * (y1 - py) - (x1 - px) * (y0 - py)) * sign
        if (w0 >= 0 && w1 >= 0 && w2 >= 0) data[y * width + x] = 1
      }
    }
  }

  for (let t = i0; t < i1; t += 3) {
    const a = indices[t]
    const b = indices[t + 1]
    const c = indices[t + 2]
    // Canvas / ImageData: y = 0 at the top; mesh v = 1 is the top of the texture (flipY).
    cover(
      uvs[a * 2] * width,
      (1 - uvs[a * 2 + 1]) * height,
      uvs[b * 2] * width,
      (1 - uvs[b * 2 + 1]) * height,
      uvs[c * 2] * width,
      (1 - uvs[c * 2 + 1]) * height
    )
  }

  return { width, height, data }
}

export function silhouetteToCanvas(mask: SilhouetteMask): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = mask.width
  canvas.height = mask.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context is not available')
  const image = ctx.createImageData(mask.width, mask.height)
  for (let i = 0; i < mask.data.length; i++) {
    const on = mask.data[i]
    const o = i * 4
    image.data[o] = image.data[o + 1] = image.data[o + 2] = on ? 255 : 0
    image.data[o + 3] = on ? 255 : 0
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}
