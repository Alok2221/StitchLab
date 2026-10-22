import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { CLIP_GARMENT, CLIP_NONE, createDocument, zoneClip, type TextLayer } from '../document/model'
import type { GarmentTemplate } from '../templates/parseTemplate'
import { buildPdf, clipLabel, hexToRgb, toWinAnsi } from './pdf'

const ONE_PIXEL_PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='),
  (c) => c.charCodeAt(0)
)

const template: GarmentTemplate = {
  id: 'test-shirt',
  name: 'Test shirt',
  category: 'tops',
  viewBox: { x: 0, y: 0, width: 200, height: 300 },
  zones: [
    { id: 'body', label: 'Body', path: 'M0 0 L200 0 L200 300 L0 300 Z', defaultColor: '#ffffff' },
    { id: 'collar', label: 'Collar', path: 'M80 0 L120 0 L100 20 Z', defaultColor: '#cccccc' }
  ],
  printArea: null
}

const layer: TextLayer = {
  id: 't1',
  type: 'text',
  name: 'Napis łączony',
  x: 100,
  y: 100,
  rotation: 0,
  scale: 1,
  opacity: 1,
  visible: true,
  locked: false,
  clip: CLIP_GARMENT,
  text: 'Zażółć gęślą jaźń',
  fontFamily: 'Arial',
  fontSize: 32,
  fontWeight: 'bold',
  fill: '#000000'
}

describe('PDF export', () => {
  it('builds a valid A4 PDF with non-Latin text in layer names', async () => {
    const doc = { ...createDocument(template.id, template.zones), layers: [layer] }
    const bytes = await buildPdf({ doc, template, png: ONE_PIXEL_PNG, pngWidth: 200, pngHeight: 300 })
    const parsed = await PDFDocument.load(bytes)
    expect(parsed.getPageCount()).toBe(1)
    expect(parsed.getTitle()).toBe('Test shirt - StitchLab')
    const { width, height } = parsed.getPage(0).getSize()
    expect(Math.round(width)).toBe(595)
    expect(Math.round(height)).toBe(842)
  })

  it('adds pages when the layer list is long', async () => {
    const layers = Array.from({ length: 60 }, (_, i) => ({ ...layer, id: `t${i}`, name: `Text ${i}` }))
    const doc = { ...createDocument(template.id, template.zones), layers }
    const parsed = await PDFDocument.load(await buildPdf({ doc, template, png: ONE_PIXEL_PNG, pngWidth: 200, pngHeight: 300 }))
    expect(parsed.getPageCount()).toBeGreaterThan(1)
  })

  it('transliterates text for standard PDF fonts', () => {
    expect(toWinAnsi('Zażółć gęślą jaźń Łódź')).toBe('Zazolc gesla jazn Lodz')
    expect(toWinAnsi('logo 🚀')).toBe('logo ?')
  })

  it('converts hex colors', () => {
    expect(hexToRgb('#ff8000')).toMatchObject({ red: 1, green: 128 / 255, blue: 0 })
  })

  it('describes clip modes', () => {
    expect(clipLabel(CLIP_GARMENT, template)).toBe('whole garment')
    expect(clipLabel(CLIP_NONE, template)).toBe('no clipping')
    expect(clipLabel(zoneClip('collar'), template)).toBe('collar')
  })
})
