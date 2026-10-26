// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { garments } from '../templates'
import { coverageFromAlpha, erodeAlpha, inflateOptions, silhouetteSvg } from './garmentModel'

describe('erodeAlpha', () => {
  it('shrinks a shape by the radius on every side', () => {
    // 7 x 5 image with an opaque 5 x 3 block in the middle.
    const alpha = new Uint8Array(35)
    for (let j = 1; j <= 3; j++) for (let i = 1; i <= 5; i++) alpha[j * 7 + i] = 255
    const eroded = erodeAlpha(alpha, 7, 5, 1)
    expect([...eroded].map((a, k) => (a ? k : -1)).filter((k) => k >= 0)).toEqual([16, 17, 18])
  })

  it('leaves the image alone for a radius under one pixel', () => {
    const alpha = new Uint8Array([255])
    expect(erodeAlpha(alpha, 1, 1, 0)).toBe(alpha)
  })
})

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
  })
})
