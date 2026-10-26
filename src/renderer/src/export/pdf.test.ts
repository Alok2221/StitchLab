import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { CLIP_GARMENT, CLIP_NONE, createDocument, zoneClip, type TextLayer } from '../document/model'
import type { GarmentTemplate } from '../templates/parseTemplate'
import { colorwayFileStem } from '.'
import { buildPdf, clipLabel, hexToRgb, toWinAnsi, type PdfSheet } from './pdf'

const ONE_PIXEL_PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='),
  (c) => c.charCodeAt(0)
)

const template: GarmentTemplate = {
  id: 'test-shirt',
  name: 'Test shirt',
  category: 'tops',
  view: 'front',
  viewLabel: 'Front',
  viewBox: { x: 0, y: 0, width: 200, height: 300 },
  zones: [
    { id: 'body', label: 'Body', path: 'M0 0 L200 0 L200 300 L0 300 Z', defaultColor: '#ffffff' },
    { id: 'collar', label: 'Collar', path: 'M80 0 L120 0 L100 20 Z', defaultColor: '#cccccc' }
  ],
  printArea: null
}

const back: GarmentTemplate = {
  ...template,
  view: 'back',
  viewLabel: 'Back',
  zones: [template.zones[0], { id: 'yoke', label: 'Yoke', path: 'M0 0 L200 0 L200 40 L0 40 Z', defaultColor: '#eeeeee' }]
}

const layer: TextLayer = {
  id: 't1',
  type: 'text',
  name: 'Napis łączony',
  view: 'front',
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

const render = { png: ONE_PIXEL_PNG, pngWidth: 200, pngHeight: 300 }

const sheet = (name: string | null, body = '#ffffff', views = 1): PdfSheet => ({
  name,
  zoneColors: { body, collar: '#cccccc' },
  zonePatterns: { body: { kind: 'dots', color: '#000000', scale: 1, angle: 0 } },
  renders: Array.from({ length: views }, () => render)
})

describe('PDF export', () => {
  it('builds a valid A4 PDF with non-Latin text in layer names', async () => {
    const doc = { ...createDocument(template.id, template.zones), layers: [layer] }
    const bytes = await buildPdf({ doc, views: [template], sheets: [sheet(null)] })
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
    const parsed = await PDFDocument.load(await buildPdf({ doc, views: [template], sheets: [sheet(null)] }))
    expect(parsed.getPageCount()).toBeGreaterThan(1)
  })

  it('lists only the layers of the exported views', async () => {
    const layers = Array.from({ length: 60 }, (_, i) => ({ ...layer, id: `t${i}`, view: 'back' }))
    const doc = { ...createDocument(template.id, template.zones), layers }
    const parsed = await PDFDocument.load(await buildPdf({ doc, views: [template], sheets: [sheet(null)] }))
    expect(parsed.getPageCount()).toBe(1)
  })

  it('puts several views on one spec page', async () => {
    const doc = { ...createDocument(template.id, template.zones), layers: [layer, { ...layer, id: 't2', view: 'back' }] }
    const parsed = await PDFDocument.load(await buildPdf({ doc, views: [template, back], sheets: [sheet(null, '#ffffff', 2)] }))
    expect(parsed.getPageCount()).toBe(1)
  })

  it('needs a render for every view', async () => {
    const doc = createDocument(template.id, template.zones)
    await expect(buildPdf({ doc, views: [template, back], sheets: [sheet(null)] })).rejects.toThrow('render per view')
  })

  it('adds an overview page and one spec page per colorway', async () => {
    const doc = createDocument(template.id, template.zones)
    const sheets = [sheet('Black', '#111111'), sheet('Navy drop', '#1f2a44'), sheet('Żółty', '#f2c94c')]
    const parsed = await PDFDocument.load(await buildPdf({ doc, views: [template], sheets }))
    expect(parsed.getPageCount()).toBe(4)
  })

  it('needs at least one sheet', async () => {
    const doc = createDocument(template.id, template.zones)
    await expect(buildPdf({ doc, views: [template], sheets: [] })).rejects.toThrow('Nothing to export')
  })

  it('names view files safely', () => {
    expect(colorwayFileStem(template, { id: 'c1', name: 'Navy / Żółty v1.2', zoneColors: {}, zonePatterns: {} })).toBe(
      'test-shirt-front-navy-zolty-v1-2'
    )
    expect(colorwayFileStem(back, { id: 'c1', name: '🚀', zoneColors: {}, zonePatterns: {} })).toBe('test-shirt-back-c1')
    expect(colorwayFileStem(back, null)).toBe('test-shirt-back-design')
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
