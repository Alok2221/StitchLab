// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { garments } from '../templates'
import { coverageFromAlpha, inflateOptions, silhouetteSvg } from './garmentModel'

describe('coverageFromAlpha', () => {
  // 2 x 1 image of a 2 x 1 viewBox: left pixel opaque, right transparent.
  const alpha = new Uint8Array([255, 0])
  const coverage = coverageFromAlpha(alpha, 2, 1, { x: 10, y: 0, width: 2, height: 1 }, 1)

  it('reads pixel centers exactly and blends between them', () => {
    expect(coverage(10.5, 0.5)).toBe(1)
    expect(coverage(11.5, 0.5)).toBe(0)
    expect(coverage(11, 0.5)).toBeCloseTo(0.5)
  })

  it('is zero outside the image', () => {
    expect(coverage(20, 0.5)).toBe(0)
  })
})

describe('silhouetteSvg', () => {
  it('fills every part of the view', () => {
    const view = garments[0].views[0]
    const svg = silhouetteSvg(view)
    expect(svg.match(/<path /g)).toHaveLength(view.zones.length)
    expect(svg).toContain(`viewBox="${view.viewBox.x} ${view.viewBox.y} ${view.viewBox.width} ${view.viewBox.height}"`)
  })
})

describe('inflateOptions', () => {
  it('makes footwear rounder than tops and bags flatter', () => {
    const byCategory = (c: string) => inflateOptions(garments.find((g) => g.category === c)!.views[0])
    expect(byCategory('footwear').roundness).toBeGreaterThan(byCategory('tops').roundness)
    expect(byCategory('bags').roundness).toBeLessThan(byCategory('tops').roundness)
    expect(byCategory('dresses').roundness).toBeLessThan(byCategory('bottoms').roundness)
  })

  it('caps depth by the short side, so a tall garment stays slim', () => {
    const trousers = garments.find((g) => g.id === 'trousers')!.views[0]
    const span = Math.min(trousers.viewBox.width, trousers.viewBox.height)
    expect(inflateOptions(trousers).maxDepth).toBeLessThanOrEqual(span * 0.085)
    expect(inflateOptions(trousers).maxDepth).toBeLessThan(trousers.viewBox.height * 0.07)
  })
})
