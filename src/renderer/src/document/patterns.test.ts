import { describe, expect, it } from 'vitest'
import type { ZonePattern } from './model'
import { clampPatternScale, contrastInk, describePattern, patternDef, patternTransform, tileSvg } from './patterns'

const stripes: ZonePattern = { kind: 'stripes', color: '#ffffff', scale: 1.5, angle: 45 }
const image: ZonePattern = { kind: 'image', src: 'data:image/png;base64,AAAA', width: 300, height: 600, scale: 1, angle: 0 }

describe('patterns', () => {
  it('builds a pattern definition tiled in template space', () => {
    expect(patternDef('p', stripes, '#1d4e89')).toBe(
      '<pattern id="p" patternUnits="userSpaceOnUse" width="24" height="24" patternTransform="rotate(45) scale(1.5)">' +
        '<rect width="24" height="24" fill="#1d4e89"/><rect width="12" height="24" fill="#ffffff"/></pattern>'
    )
  })

  it('omits an identity transform', () => {
    expect(patternTransform({ ...stripes, scale: 1, angle: 0 })).toBe('')
  })

  it('renders a standalone tile at the requested resolution', () => {
    const tile = tileSvg(image, '#ffffff', 4)
    expect(tile.width).toBe(240)
    expect(tile.height).toBe(480)
    expect(tile.svg).toContain('viewBox="0 0 60 120"')
  })

  it('escapes pattern values', () => {
    expect(patternDef('p', { ...image, src: 'a"b<c' }, '#ffffff')).toContain('href="a&quot;b&lt;c"')
  })

  it('describes patterns for the spec sheet', () => {
    expect(describePattern(stripes)).toBe('stripes #FFFFFF, 150%, 45 deg')
    expect(describePattern(image)).toBe('image 300x600, 100%')
  })

  it('picks a readable ink and clamps the size', () => {
    expect(contrastInk('#f4f4f2')).toBe('#1f1f22')
    expect(contrastInk('#1d4e89')).toBe('#f4f4f2')
    expect(clampPatternScale(100)).toBe(4)
    expect(clampPatternScale(0)).toBe(0.25)
  })
})
