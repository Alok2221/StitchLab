// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { garments } from '../templates'
import type { GarmentTemplate } from '../templates/parseTemplate'
import { deriveView } from '../templates/parseTemplate'
import { CLIP_GARMENT, CLIP_NONE, zoneClip, type TextLayer } from './model'
import { DEFAULT_TEXT, defaultFontSize, placeOnView } from './placement'

const front: GarmentTemplate = {
  id: 'shirt',
  name: 'Shirt',
  category: 'tops',
  view: 'front',
  viewLabel: 'Front',
  viewBox: { x: 0, y: 0, width: 400, height: 500 },
  zones: [
    { id: 'body', label: 'Body', path: 'M0 0 L400 0 L400 500 L0 500 Z', defaultColor: '#ffffff' },
    { id: 'pocket', label: 'Pocket', path: 'M10 10 L50 10 L50 50 L10 50 Z', defaultColor: '#cccccc' }
  ],
  printArea: { x: 100, y: 100, width: 200, height: 200 }
}
const back: GarmentTemplate = {
  ...front,
  view: 'back',
  viewLabel: 'Back',
  zones: [front.zones[0]],
  printArea: { x: 50, y: 60, width: 300, height: 400 }
}

const layer: TextLayer = {
  id: 'logo',
  type: 'text',
  name: 'Logo',
  view: 'front',
  x: 150,
  y: 200,
  rotation: 0.3,
  scale: 1,
  opacity: 1,
  visible: true,
  locked: false,
  clip: CLIP_GARMENT,
  text: 'LOGO',
  fontFamily: 'Arial',
  fontSize: 30,
  fontWeight: 'bold',
  fill: '#000000'
}

describe('placeOnView', () => {
  it('keeps the spot relative to the print area', () => {
    expect(placeOnView(layer, front, back)).toMatchObject({ view: 'back', x: 125, y: 260, rotation: 0.3 })
  })

  it('mirrors onto a mirrored view and back', () => {
    const inner = deriveView(front, 'inner', 'Inner side', { mirror: true })
    const placed = placeOnView(layer, front, inner)
    expect(placed).toMatchObject({ view: 'inner', x: 250, y: 200, rotation: -0.3 })
    expect(placeOnView({ ...layer, ...placed } as TextLayer, inner, front)).toMatchObject({ x: 150, rotation: 0.3 })
  })

  it('keeps coordinates when a view has no print area', () => {
    expect(placeOnView(layer, front, { ...back, printArea: null })).toMatchObject({ x: 150, y: 200 })
  })

  it('falls back to the whole garment when the clip part is missing on the target view', () => {
    expect(placeOnView({ ...layer, clip: zoneClip('pocket') }, front, back).clip).toBe(CLIP_GARMENT)
    expect(placeOnView({ ...layer, clip: zoneClip('body') }, front, back).clip).toBe(zoneClip('body'))
    expect(placeOnView({ ...layer, clip: CLIP_NONE }, front, back).clip).toBe(CLIP_NONE)
  })
})

describe('defaultFontSize', () => {
  it('fits the default text in the print area', () => {
    const size = defaultFontSize(front)
    expect(DEFAULT_TEXT.length * 0.55 * size).toBeLessThanOrEqual(200 * 0.8)
    expect(size).toBeGreaterThan(20)
  })

  it('is limited by a short print area', () => {
    expect(defaultFontSize({ ...front, printArea: { x: 0, y: 0, width: 400, height: 60 } })).toBe(20)
  })

  it('never goes below the minimum', () => {
    expect(defaultFontSize({ ...front, printArea: { x: 0, y: 0, width: 20, height: 20 } })).toBe(12)
  })

  it('stays well within every template', () => {
    for (const garment of garments) {
      for (const view of garment.views) {
        const textWidth = DEFAULT_TEXT.length * 0.55 * defaultFontSize(view)
        expect(textWidth, `${garment.id}/${view.view}`).toBeLessThanOrEqual(view.viewBox.width * 0.4)
      }
    }
  })
})
