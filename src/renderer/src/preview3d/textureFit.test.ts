import { describe, expect, it } from 'vitest'
import { opaqueBoundsFromRgba } from './textureFit'

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

  it('ignores pixels below the alpha cutoff', () => {
    const data = rgba(10, 10, (set) => set(3, 3, 4))
    expect(opaqueBoundsFromRgba(data, 10, 10)).toBeNull()
  })
})
