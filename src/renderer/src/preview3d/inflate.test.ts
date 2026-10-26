import { describe, expect, it } from 'vitest'
import { combinedHeight, gridFor, heightField, inflate, maskFor, pressureField, type Coverage, type Grid } from './inflate'

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** Rectangle with a one-unit soft edge, like an anti-aliased raster. */
const rect =
  (x0: number, y0: number, x1: number, y1: number): Coverage =>
  (x, y) =>
    clamp01(0.5 + Math.min(x - x0, x1 - x, y - y0, y1 - y))

const circle =
  (cx: number, cy: number, r: number): Coverage =>
  (x, y) =>
    clamp01(0.5 + r - Math.hypot(x - cx, y - cy))

const grid: Grid = { x: 0, y: 0, width: 60, height: 20, cols: 60, rows: 20, step: 1 }
/** A strip long enough that its ends do not reach the middle; outside rows are j = 1 and j = 19, so it is 18 cells wide. */
const stripGrid: Grid = { x: 0, y: 0, width: 200, height: 20, cols: 200, rows: 20, step: 1 }
const sw = stripGrid.cols + 1
const strip = rect(1.6, 1.6, 198.4, 18.4)

describe('gridFor', () => {
  it('covers the viewBox with square cells along the long side', () => {
    expect(gridFor({ x: 10, y: 20, width: 600, height: 300 }, 100)).toEqual({
      x: 10,
      y: 20,
      width: 600,
      height: 300,
      cols: 100,
      rows: 50,
      step: 6
    })
  })

  it('rounds a partial cell up', () => {
    expect(gridFor({ x: 0, y: 0, width: 760, height: 400 }, 100)).toMatchObject({ cols: 100, rows: 53 })
  })
})

describe('maskFor', () => {
  it('marks vertices that are at least half covered', () => {
    const mask = maskFor(strip, stripGrid)
    expect(mask[1 * sw + 100]).toBe(0)
    expect(mask[2 * sw + 100]).toBe(1)
    expect(mask[18 * sw + 100]).toBe(1)
    expect(mask[19 * sw + 100]).toBe(0)
  })
})

describe('pressureField', () => {
  it('peaks at width² / 8 across a long strip', () => {
    const p = pressureField(maskFor(strip, stripGrid), stripGrid)
    expect(p[10 * sw + 100]).toBeCloseTo(18 ** 2 / 8, 0)
    expect(p[1 * sw + 100]).toBe(0)
  })
})

describe('heightField', () => {
  const mask = maskFor(strip, stripGrid)

  it('gives a round cross-section as deep as half the width', () => {
    const height = heightField(mask, stripGrid, { roundness: 1, maxDepth: 1000 })
    expect(height[10 * sw + 100]).toBeCloseTo(9, 0)
    for (let j = 2; j < 10; j++) expect(height[j * sw + 100]).toBeLessThan(height[(j + 1) * sw + 100])
  })

  it('is smooth along the strip, without ridges or bands', () => {
    const height = heightField(mask, stripGrid, { roundness: 1, maxDepth: 1000 })
    const row = [80, 90, 100, 110, 120].map((i) => height[10 * sw + i])
    expect(Math.max(...row) - Math.min(...row)).toBeLessThan(0.05)
  })

  it('never goes past the maximum depth', () => {
    const height = heightField(mask, stripGrid, { roundness: 1, maxDepth: 3 })
    expect(Math.max(...height)).toBeLessThan(3)
    expect(Math.max(...height)).toBeGreaterThan(2.9)
  })
})

describe('combinedHeight', () => {
  const options = { roundness: 1, maxDepth: 1000 }
  const left = maskFor(rect(2.6, 2.6, 28.4, 17.4), grid)
  const right = maskFor(rect(32.6, 2.6, 58.4, 17.4), grid)

  it('keeps a gap between two parts empty', () => {
    const height = combinedHeight([left, right], grid, options)
    expect(height[10 * (grid.cols + 1) + 30]).toBe(0)
    expect(height[10 * (grid.cols + 1) + 15]).toBeGreaterThan(5)
    expect(height[10 * (grid.cols + 1) + 45]).toBeGreaterThan(5)
  })

  it('puts a crease where two parts share an edge, instead of one wide lobe', () => {
    const touching = combinedHeight(
      [maskFor(rect(2.6, 2.6, 30.4, 17.4), grid), maskFor(rect(29.6, 2.6, 58.4, 17.4), grid)],
      grid,
      options
    )
    const w = grid.cols + 1
    expect(touching[10 * w + 15]).toBeGreaterThan(5)
    expect(touching[10 * w + 30]).toBeLessThan(touching[10 * w + 15] * 0.5)
    expect(touching[10 * w + 45]).toBeGreaterThan(touching[10 * w + 30])
  })
})

describe('inflate', () => {
  const options = { roundness: 0.5, maxDepth: 100 }
  const mesh = inflate(rect(10.6, 5.6, 50.4, 15.4), grid, options)
  const count = mesh.vertexCount

  it('builds a front and a mirrored back surface', () => {
    expect(mesh.uvs.length / 2).toBeGreaterThanOrEqual(count * 2)
    for (let n = 0; n < count; n++) {
      expect(mesh.positions[n * 3 + 2]).toBeGreaterThanOrEqual(0)
      expect(mesh.positions[(n + count) * 3 + 2]).toBe(-mesh.positions[n * 3 + 2])
      expect(mesh.uvs[(n + count) * 2]).toBeCloseTo(1 - mesh.uvs[n * 2])
    }
  })

  it('maps the template into the texture with y up', () => {
    for (let n = 0; n < count; n++) {
      expect(mesh.uvs[n * 2]).toBeCloseTo(mesh.positions[n * 3] / 60)
      expect(mesh.uvs[n * 2 + 1]).toBeCloseTo(1 + mesh.positions[n * 3 + 1] / 20)
    }
  })

  it('keeps only cells touching the garment, with valid indices', () => {
    expect(mesh.indices.length - mesh.frontIndexCount).toBe(41 * 11 * 6)
    expect(mesh.frontIndexCount).toBeGreaterThan(41 * 11 * 6)
    expect(Math.max(...mesh.indices)).toBe(mesh.positions.length / 3 - 1)
  })

  it('faces the front towards +z and the back towards -z', () => {
    const normalZ = (t: number) => {
      const [a, b, c] = [mesh.indices[t], mesh.indices[t + 1], mesh.indices[t + 2]].map((i) => [
        mesh.positions[i * 3],
        mesh.positions[i * 3 + 1]
      ])
      return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    }
    expect(normalZ(0)).toBeGreaterThan(0)
    expect(normalZ(mesh.frontIndexCount)).toBeLessThan(0)
  })

  it('caps the rim with a wall that faces outward', () => {
    let crosses = 0
    let outward = 0
    const cx = 30.5
    const cy = -10.5
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const ids = [mesh.indices[t], mesh.indices[t + 1], mesh.indices[t + 2]]
      const p = ids.map((i) => [mesh.positions[i * 3], mesh.positions[i * 3 + 1], mesh.positions[i * 3 + 2]])
      const z0 = Math.min(p[0][2], p[1][2], p[2][2])
      const z1 = Math.max(p[0][2], p[1][2], p[2][2])
      if (z1 <= 0.05 || z0 >= -0.05) continue
      crosses++
      const e1 = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]]
      const e2 = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]]
      const normal = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2]]
      const mid = [(p[0][0] + p[1][0] + p[2][0]) / 3, (p[0][1] + p[1][1] + p[2][1]) / 3]
      if (normal[0] * (mid[0] - cx) + normal[1] * (mid[1] - cy) > 0) outward++
    }
    expect(crosses).toBeGreaterThan(0)
    expect(outward).toBe(crosses)
  })

  it('pulls the seam onto the outline', () => {
    const round = inflate(circle(30, 10, 7.3), grid, options)
    const dist: number[] = []
    for (let k = 0; k < round.vertexCount; k++) {
      dist.push(Math.hypot(round.positions[k * 3] - 30, -round.positions[k * 3 + 1] - 10))
    }
    expect(Math.max(...dist)).toBeLessThan(7.3 + 0.2)
    expect(dist.filter((d) => Math.abs(d - 7.3) < 0.2).length).toBeGreaterThan(20)
  })
})
