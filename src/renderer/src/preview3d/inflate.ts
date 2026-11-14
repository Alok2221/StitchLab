import type { Rect } from '../templates/parseTemplate'

/** Sample grid laid over a template viewBox; vertex (i, j) sits at `x + i * step, y + j * step`. */
export interface Grid extends Rect {
  cols: number
  rows: number
  step: number
}

export function gridFor(viewBox: Rect, samples: number): Grid {
  const step = Math.max(viewBox.width, viewBox.height) / samples
  return {
    ...viewBox,
    cols: Math.max(1, Math.ceil(viewBox.width / step - 1e-9)),
    rows: Math.max(1, Math.ceil(viewBox.height / step - 1e-9)),
    step
  }
}

/** How much of the garment covers a point of the template, from 0 (outside) to 1 (inside). */
export type Coverage = (x: number, y: number) => number

/** Mask of `(cols + 1) * (rows + 1)` vertices, row by row; 1 marks a vertex inside the garment. */
export function maskFor(coverage: Coverage, grid: Grid): Uint8Array {
  const w = grid.cols + 1
  const mask = new Uint8Array(w * (grid.rows + 1))
  for (let k = 0; k < mask.length; k++) {
    const i = k % w
    mask[k] = coverage(grid.x + i * grid.step, grid.y + ((k - i) / w) * grid.step) >= 0.5 ? 1 : 0
  }
  return mask
}

/** Iteration stops when no value moves by more than this fraction of the peak. */
const SOR_TOLERANCE = 1e-4

/**
 * Pressure field of a membrane stretched over the garment outline: solves Δp = -1 inside, p = 0 outside,
 * in grid cells. Across a strip of width w the field peaks at w² / 8, so `sqrt(2p)` is half the local width.
 */
export function pressureField(mask: Uint8Array, grid: Grid, maxIterations = 4000): Float32Array {
  const w = grid.cols + 1
  const h = grid.rows + 1
  const p = new Float32Array(w * h)
  const inside: number[] = []
  for (let j = 1; j < h - 1; j++) {
    for (let i = 1; i < w - 1; i++) {
      const k = j * w + i
      if (mask[k]) {
        inside.push(k)
        p[k] = 1
      }
    }
  }
  const omega = 2 / (1 + Math.sin(Math.PI / Math.max(w, h)))
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    let change = 0
    let peak = 0
    for (const k of inside) {
      const target = (p[k - 1] + p[k + 1] + p[k - w] + p[k + w] + 1) / 4
      const delta = omega * (target - p[k])
      p[k] += delta
      change = Math.max(change, Math.abs(delta))
      peak = Math.max(peak, p[k])
    }
    if (change < SOR_TOLERANCE * Math.max(1, peak)) break
  }
  return p
}

export interface InflateOptions {
  /** Depth of a part relative to half its width: 1 gives a round cross-section. */
  roundness: number
  /** Depth that wide parts approach but never exceed, in template units. */
  maxDepth: number
}

/** Height of the surface above the seam plane at every vertex, in template units; zero outside. */
export function heightField(mask: Uint8Array, grid: Grid, { roundness, maxDepth }: InflateOptions): Float32Array {
  const pressure = pressureField(mask, grid)
  const height = new Float32Array(pressure.length)
  for (let k = 0; k < height.length; k++) {
    const depth = roundness * Math.sqrt(2 * Math.max(0, pressure[k])) * grid.step
    height[k] = maxDepth * Math.tanh(depth / maxDepth)
  }
  return height
}

/**
 * Height of a garment made of separate parts, such as two trouser legs: each part puffs to half
 * its own width, and overlapping parts take the thicker of the two. A gap between parts stays empty.
 */
export function combinedHeight(masks: Uint8Array[], grid: Grid, options: InflateOptions): Float32Array {
  const height = new Float32Array((grid.cols + 1) * (grid.rows + 1))
  for (const mask of masks) {
    if (!mask.includes(1)) continue
    const part = heightField(mask, grid, options)
    for (let k = 0; k < height.length; k++) if (part[k] > height[k]) height[k] = part[k]
  }
  return height
}

const NEIGHBORS = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1]
]

/**
 * Where an outside vertex next to the garment should sit: on the outline, found by bisection
 * towards its inside neighbours. Falls back to the nearest inside neighbour.
 */
function snapToOutline(i: number, j: number, mask: Uint8Array, grid: Grid, coverage: Coverage): [number, number] {
  const w = grid.cols + 1
  let dx = 0
  let dy = 0
  let nearest: [number, number] | null = null
  for (const [di, dj] of NEIGHBORS) {
    const ii = i + di
    const jj = j + dj
    if (ii < 0 || jj < 0 || ii > grid.cols || jj > grid.rows || !mask[jj * w + ii]) continue
    dx += di
    dy += dj
    if (!nearest || Math.abs(di) + Math.abs(dj) === 1) nearest = [ii, jj]
  }
  const x = grid.x + i * grid.step
  const y = grid.y + j * grid.step
  const fallback: [number, number] = nearest
    ? [grid.x + nearest[0] * grid.step, grid.y + nearest[1] * grid.step]
    : [x, y]
  const length = Math.hypot(dx, dy)
  if (length < 0.5) return fallback
  const ux = (dx / length) * grid.step * 1.5
  const uy = (dy / length) * grid.step * 1.5
  if (coverage(x + ux, y + uy) < 0.5) return fallback
  let lo = 0
  let hi = 1
  for (let n = 0; n < 12; n++) {
    const mid = (lo + hi) / 2
    if (coverage(x + ux * mid, y + uy * mid) < 0.5) lo = mid
    else hi = mid
  }
  return [x + ux * hi, y + uy * hi]
}

export interface InflatedMesh {
  /** x, y, z per vertex: template units, y pointing up, the seam on z = 0. Front vertices first. */
  positions: Float32Array
  /** u, v per vertex into the view texture (v = 1 at the top of the image). */
  uvs: Float32Array
  indices: Uint32Array
  /** Indices `[0, frontIndexCount)` draw the front, the rest the back. */
  frontIndexCount: number
  /** Vertices `[0, vertexCount)` are the front, `[vertexCount, 2 * vertexCount)` the back. */
  vertexCount: number
  /** Projected cloth mask in UV space, used to warp the 2D design onto a GLB shell. */
  frontSilhouette?: { width: number; height: number; data: Uint8Array }
  backSilhouette?: { width: number; height: number; data: Uint8Array }
}

const NEIGHBOR8 = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1]
]

/** Soften steps between parts. Outside the mask stays empty, so a gap between two legs is kept. */
export function smoothHeight(height: Float32Array, mask: Uint8Array, grid: Grid, passes = 2): Float32Array {
  const w = grid.cols + 1
  const h = grid.rows + 1
  let current = height
  for (let pass = 0; pass < passes; pass++) {
    const next = current.slice()
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const k = j * w + i
        if (!mask[k]) continue
        let sum = current[k]
        let n = 1
        for (const [di, dj] of NEIGHBOR8) {
          const ii = i + di
          const jj = j + dj
          if (ii < 0 || jj < 0 || ii >= w || jj >= h || !mask[jj * w + ii]) continue
          sum += current[jj * w + ii]
          n++
        }
        next[k] = sum / n
      }
    }
    current = next
  }
  return current
}

/**
 * The rim sits just outside the mask. Give it the thickness of the cloth it touches and
 * at least a fraction of a cell, so the side wall has area instead of a razor edge you can see through.
 */
function extendToRim(height: Float32Array, mask: Uint8Array, grid: Grid, floor: number): Float32Array {
  const w = grid.cols + 1
  const h = grid.rows + 1
  let out = height.slice()
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i
      if (mask[k]) continue
      let best = 0
      for (const [di, dj] of NEIGHBOR8) {
        const ii = i + di
        const jj = j + dj
        if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue
        const nk = jj * w + ii
        if (mask[nk] && height[nk] > best) best = height[nk]
      }
      out[k] = best > 0 ? Math.max(best, floor) : 0
    }
  }
  // Even the rim out, so the side is one band instead of a rib per grid row.
  for (let pass = 0; pass < 10; pass++) {
    const next = out.slice()
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const k = j * w + i
        if (mask[k] || out[k] === 0) continue
        let sum = out[k]
        let n = 1
        for (const [di, dj] of NEIGHBOR8) {
          const ii = i + di
          const jj = j + dj
          if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue
          const nk = jj * w + ii
          if (!mask[nk] && out[nk] > 0) {
            sum += out[nk]
            n++
          }
        }
        next[k] = Math.max(sum / n, floor)
      }
    }
    out = next
  }
  return out
}

/**
 * Wall along the open rim: front vertices stay, and copies of the back positions keep the front UV
 * so the edge shows the outline instead of a smear of the mirrored back.
 * Returns indices with the wall included in the front range.
 */
function closeRim(indices: Uint32Array, frontIndexCount: number, positions: Float32Array, uvs: Float32Array, vertexCount: number): InflatedMesh {
  const uses = new Map<string, number>()
  const mark = (a: number, b: number) => uses.set(`${a},${b}`, (uses.get(`${a},${b}`) ?? 0) + 1)
  for (let t = 0; t < frontIndexCount; t += 3) {
    mark(indices[t], indices[t + 1])
    mark(indices[t + 1], indices[t + 2])
    mark(indices[t + 2], indices[t])
  }

  const extraPos: number[] = []
  const extraUv: number[] = []
  const frontOf = new Map<number, number>()
  const backOf = new Map<number, number>()
  // Just inside the outline, so the side samples the cloth and not the dark stroke.
  const fabric = (n: number): [number, number] => {
    const u = uvs[n * 2]
    const v = uvs[n * 2 + 1]
    const du = 0.5 - u
    const dv = 0.5 - v
    const len = Math.hypot(du, dv) || 1
    const shift = 0.008
    return [u + (du / len) * shift, v + (dv / len) * shift]
  }
  const addCopy = (n: number, source: number, into: Map<number, number>) => {
    const existing = into.get(n)
    if (existing !== undefined) return existing
    const created = vertexCount * 2 + frontOf.size + backOf.size
    into.set(n, created)
    extraPos.push(positions[source], positions[source + 1], positions[source + 2])
    extraUv.push(...fabric(n))
    return created
  }

  const walls: number[] = []
  for (const key of uses.keys()) {
    const comma = key.indexOf(',')
    const a = Number(key.slice(0, comma))
    const b = Number(key.slice(comma + 1))
    if (uses.has(`${b},${a}`)) continue
    if (Math.abs(positions[a * 3 + 2]) < 1e-4 && Math.abs(positions[b * 3 + 2]) < 1e-4) continue
    const fa = addCopy(a, a * 3, frontOf)
    const fb = addCopy(b, b * 3, frontOf)
    const ba = addCopy(a, (a + vertexCount) * 3, backOf)
    const bb = addCopy(b, (b + vertexCount) * 3, backOf)
    walls.push(fa, bb, fb, fa, ba, bb)
  }
  if (walls.length === 0) return { positions, uvs, indices, frontIndexCount, vertexCount }

  const positionsOut = new Float32Array(positions.length + extraPos.length)
  positionsOut.set(positions)
  positionsOut.set(extraPos, positions.length)
  const uvsOut = new Float32Array(uvs.length + extraUv.length)
  uvsOut.set(uvs)
  uvsOut.set(extraUv, uvs.length)
  const indicesOut = new Uint32Array(indices.length + walls.length)
  indicesOut.set(indices.subarray(0, frontIndexCount))
  indicesOut.set(walls, frontIndexCount)
  indicesOut.set(indices.subarray(frontIndexCount), frontIndexCount + walls.length)
  return { positions: positionsOut, uvs: uvsOut, indices: indicesOut, frontIndexCount: frontIndexCount + walls.length, vertexCount }
}

/**
 * Closed, inflated surface of a garment: the front view faces +z, the back view faces -z,
 * and a wall joins them along the outline so the side is not a hole.
 * The back texture is mirrored left to right because the back view is drawn as seen from behind.
 * Grid cells touching the garment are kept, and their outside corners are pulled onto the outline.
 */
export function inflate(coverage: Coverage, grid: Grid, options: InflateOptions, height?: Float32Array): InflatedMesh {
  const w = grid.cols + 1
  const h = grid.rows + 1
  const mask = maskFor(coverage, grid)
  const floor = Math.max(grid.step * 1.1, options.maxDepth * 0.28)
  height = extendToRim(height ? height.slice() : heightField(mask, grid, options), mask, grid, floor)

  const cells: number[] = []
  const used = new Uint8Array(w * h)
  for (let j = 0; j < grid.rows; j++) {
    for (let i = 0; i < grid.cols; i++) {
      const a = j * w + i
      if (mask[a] || mask[a + 1] || mask[a + w] || mask[a + w + 1]) {
        cells.push(a)
        used[a] = used[a + 1] = used[a + w] = used[a + w + 1] = 1
      }
    }
  }

  const index = new Int32Array(w * h).fill(-1)
  let count = 0
  for (let k = 0; k < used.length; k++) if (used[k]) index[k] = count++

  const positions = new Float32Array(count * 2 * 3)
  const uvs = new Float32Array(count * 2 * 2)
  for (let k = 0; k < used.length; k++) {
    const n = index[k]
    if (n < 0) continue
    const i = k % w
    const j = (k - i) / w
    const [x, y] = mask[k]
      ? [grid.x + i * grid.step, grid.y + j * grid.step]
      : snapToOutline(i, j, mask, grid, coverage)
    const front = n * 3
    const back = (n + count) * 3
    positions[front] = positions[back] = x
    positions[front + 1] = positions[back + 1] = -y
    positions[front + 2] = height[k]
    positions[back + 2] = -height[k]
    const u = (x - grid.x) / grid.width
    const v = 1 - (y - grid.y) / grid.height
    uvs[n * 2] = u
    uvs[n * 2 + 1] = v
    uvs[(n + count) * 2] = 1 - u
    uvs[(n + count) * 2 + 1] = v
  }

  const indices = new Uint32Array(cells.length * 12)
  let t = 0
  for (const a of cells) {
    const [p, q, r, s] = [index[a], index[a + 1], index[a + w], index[a + w + 1]]
    // Counter-clockwise seen from +z (y is flipped, so image rows go down).
    indices.set([p, r, q, q, r, s], t)
    t += 6
  }
  const frontIndexCount = t
  for (const a of cells) {
    const [p, q, r, s] = [index[a], index[a + 1], index[a + w], index[a + w + 1]].map((n) => n + count)
    indices.set([p, q, r, q, s, r], t)
    t += 6
  }
  return closeRim(indices, frontIndexCount, positions, uvs, count)
}
