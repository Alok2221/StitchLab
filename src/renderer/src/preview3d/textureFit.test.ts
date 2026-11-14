// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { opaqueBoundsFromRgba, rowSegments, rowSpans, warpDesignToSilhouette } from './textureFit'
import type { SilhouetteMask } from './silhouette'

function rgba(width: number, height: number, paint: (set: (x: number, y: number, a?: number) => void) => void): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4)
  paint((x, y, a = 255) => {
    const i = (y * width + x) * 4
    data[i] = 255
    data[i + 1] = 0
    data[i + 2] = 0
    data[i + 3] = a
  })
  return data
}

describe('opaqueBoundsFromRgba', () => {
  it('finds the opaque island and ignores empty margins', () => {
    const data = rgba(100, 80, (set) => {
      for (let y = 10; y < 40; y++) for (let x = 20; x < 60; x++) set(x, y)
    })
    expect(opaqueBoundsFromRgba(data, 100, 80)).toEqual({ x: 20, y: 10, width: 40, height: 30 })
  })

  it('returns null for an empty buffer', () => {
    expect(opaqueBoundsFromRgba(new Uint8ClampedArray(8 * 8 * 4), 8, 8)).toBeNull()
  })
})

describe('rowSpans', () => {
  it('records the left and right opaque columns per row', () => {
    const data = new Uint8Array([0, 1, 1, 0, 0, 0, 1, 0])
    const { left, right } = rowSpans(4, 2, (i) => data[i] > 0)
    expect([...left]).toEqual([1, 2])
    expect([...right]).toEqual([2, 2])
  })
})

describe('rowSegments', () => {
  it('keeps two separate runs on one row (straps / legs)', () => {
    // Row0: ##..##..  Row1: empty
    const data = new Uint8Array([1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    const rows = rowSegments(8, 2, (i) => data[i] > 0)
    expect(rows[0]).toEqual([
      { left: 0, right: 1 },
      { left: 4, right: 5 }
    ])
    expect(rows[1]).toEqual([])
  })
})

describe('warpDesignToSilhouette', () => {
  it('maps separate destination straps from slices of the source row', () => {
    const design = document.createElement('canvas')
    design.width = 8
    design.height = 4
    const dctx = design.getContext('2d')
    if (!dctx) return
    // Top rows = "handle" (blue), bottom = "body" (red).
    dctx.fillStyle = '#0000ff'
    dctx.fillRect(1, 0, 6, 2)
    dctx.fillStyle = '#ff0000'
    dctx.fillRect(1, 2, 6, 2)

    const mask: SilhouetteMask = { width: 8, height: 4, data: new Uint8Array(32) }
    // Top: two straps. Bottom: full body.
    for (const x of [1, 2, 5, 6]) mask.data[0 * 8 + x] = mask.data[1 * 8 + x] = 1
    for (let x = 1; x <= 6; x++) mask.data[2 * 8 + x] = mask.data[3 * 8 + x] = 1

    const fitted = warpDesignToSilhouette(design, mask, '#00ff00')
    const fctx = fitted.getContext('2d')
    if (!fctx) return
    const strap = fctx.getImageData(1, 0, 1, 1).data
    const body = fctx.getImageData(4, 3, 1, 1).data
    const gap = fctx.getImageData(3, 0, 1, 1).data
    expect(strap[2]).toBeGreaterThan(200)
    expect(body[0]).toBeGreaterThan(200)
    expect(gap[1]).toBeGreaterThan(200)
  })
})
