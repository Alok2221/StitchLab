import { describe, expect, it } from 'vitest'
import { CLIP_GARMENT, createDocument, type TextLayer } from '../document/model'
import type { GarmentTemplate } from '../templates/parseTemplate'
import { lookbookScale, lookbookSize, lookbookSvg } from './lookbook'

const front: GarmentTemplate = {
  id: 'test-shirt',
  name: 'Test shirt',
  category: 'tops',
  view: 'front',
  viewLabel: 'Front',
  viewBox: { x: 0, y: 0, width: 200, height: 300 },
  zones: [{ id: 'body', label: 'Body', path: 'M0 0 L200 0 L200 300 L0 300 Z', defaultColor: '#ffffff' }],
  printArea: null
}
const back: GarmentTemplate = { ...front, view: 'back', viewLabel: 'Back' }

const text = (id: string, view: string, value: string): TextLayer => ({
  id,
  type: 'text',
  name: id,
  view,
  x: 100,
  y: 100,
  rotation: 0,
  scale: 1,
  opacity: 1,
  visible: true,
  locked: false,
  clip: CLIP_GARMENT,
  text: value,
  fontFamily: 'Arial',
  fontSize: 20,
  fontWeight: 'bold',
  fill: '#000000'
})

const doc = (body: string) => ({
  ...createDocument(front.id, front.zones),
  zoneColors: { body },
  zonePatterns: { body: { kind: 'dots' as const, color: '#000000', scale: 1, angle: 0 } },
  layers: [text('a', 'front', 'ON FRONT'), text('b', 'back', 'ON BACK')]
})

describe('lookbook sheet', () => {
  it('places every view of every colorway with its own ids', () => {
    const sheet = lookbookSvg(
      [front, back],
      [
        { name: 'Black', doc: doc('#111111') },
        { name: 'Navy & white', doc: doc('#1f2a44') }
      ],
      { background: '#ffffff' }
    )
    expect(sheet.svg.match(/<svg x=/g)).toHaveLength(4)
    for (const id of ['r0v0-fill-0', 'r0v1-fill-0', 'r1v0-fill-0', 'r1v1-fill-0', 'r1v1-clip-garment']) {
      expect(sheet.svg).toContain(`id="${id}"`)
    }
    expect(sheet.svg).toContain('url(#r1v1-clip-garment)')
    expect(sheet.svg.match(/ON FRONT/g)).toHaveLength(2)
    expect(sheet.svg.match(/ON BACK/g)).toHaveLength(2)
    expect(sheet.svg).toContain('#1f2a44')
    expect(sheet.svg).toContain('>Navy &amp; white</text>')
    expect(sheet.svg).toContain('>Back</text>')
    expect(sheet.svg).toContain(`<rect width="${sheet.width}" height="${sheet.height}" fill="#ffffff" />`)
  })

  it('reports the same size it renders', () => {
    const rows = [{ name: null, doc: doc('#111111') }]
    const sheet = lookbookSvg([front, back], rows, { background: null })
    expect(lookbookSize([front, back], [null])).toEqual({ width: sheet.width, height: sheet.height })
    expect(sheet.width).toBeGreaterThan(2 * front.viewBox.width)
    expect(sheet.svg).not.toContain('>null</text>')
  })

  it('skips view labels for a single view and colorway names when there are none', () => {
    const { svg, width, height } = lookbookSvg([front], [{ name: null, doc: doc('#111111') }], { background: null })
    expect(svg).not.toContain('>Front</text>')
    expect(svg).not.toContain(`<rect width="${width}" height="${height}"`)
    expect(svg).toContain('>Test shirt</text>')
  })

  it('needs something to show', () => {
    expect(() => lookbookSvg([], [{ name: null, doc: doc('#111111') }], { background: null })).toThrow('Nothing to export')
  })

  it('keeps PNG sheets within canvas limits', () => {
    expect(lookbookScale(1000, 1000, 4)).toBe(4)
    expect(lookbookScale(1500, 12000, 8) * 12000).toBeLessThanOrEqual(16000)
    const scale = lookbookScale(5000, 5000, 8)
    expect(5000 * scale * 5000 * scale).toBeLessThanOrEqual(120_000_000)
  })
})
