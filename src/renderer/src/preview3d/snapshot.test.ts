import { describe, expect, it } from 'vitest'
import { pngFromDataUrl, snapshotFileStem, snapshotSize } from './snapshot'

describe('snapshotSize', () => {
  it('puts the long side on the longer edge', () => {
    expect(snapshotSize(2, 2048)).toEqual({ width: 2048, height: 1024 })
    expect(snapshotSize(0.5, 2048)).toEqual({ width: 1024, height: 2048 })
  })

  it('does not exceed the GPU texture size', () => {
    expect(snapshotSize(2, 4096, 2048)).toEqual({ width: 2048, height: 1024 })
  })
})

describe('snapshotFileStem', () => {
  it('names the camera, and uses view after a free orbit', () => {
    expect(snapshotFileStem('tshirt', 'front')).toBe('tshirt-3d-front')
    expect(snapshotFileStem('tshirt', 'three-quarter')).toBe('tshirt-3d-34')
    expect(snapshotFileStem('sneaker', null)).toBe('sneaker-3d-view')
  })
})

describe('pngFromDataUrl', () => {
  it('decodes a 1x1 PNG', () => {
    const bytes = pngFromDataUrl(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    )
    expect(String.fromCharCode(...bytes.slice(0, 8))).toBe('\x89PNG\r\n\x1a\n')
    expect(bytes.length).toBeGreaterThan(8)
  })

  it('rejects a non-PNG URL', () => {
    expect(() => pngFromDataUrl('data:image/jpeg;base64,xx')).toThrow('PNG encoding failed')
  })
})
