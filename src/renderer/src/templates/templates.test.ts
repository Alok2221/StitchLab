// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { GraphicsPath } from 'pixi.js'
import {
  garments,
  getGarment,
  getTemplate,
  hasGarment,
  LEGACY_GARMENT_IDS,
  mirrorPath,
  templateSources,
  TEMPLATE_CATEGORIES
} from './index'
import { deriveView, parseTemplate } from './parseTemplate'

const bounds = (d: string) => new GraphicsPath(d).bounds

describe('garment templates', () => {
  it('have unique ids', () => {
    const ids = garments.map((g) => g.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('cover every category', () => {
    for (const category of TEMPLATE_CATEGORIES) {
      expect(garments.some((g) => g.category === category)).toBe(true)
    }
  })

  it('give every garment several views that share its id, category and frame', () => {
    for (const garment of garments) {
      expect(garment.views.length, garment.id).toBeGreaterThan(1)
      expect(new Set(garment.views.map((v) => v.view)).size).toBe(garment.views.length)
      for (const view of garment.views) {
        expect(view.id).toBe(garment.id)
        expect(view.category).toBe(garment.category)
        expect(view.viewBox).toEqual(garment.views[0].viewBox)
        expect(view.viewLabel).not.toBe('')
      }
    }
  })

  it('collects the parts of every view without duplicates', () => {
    const trousers = getGarment('trousers')
    const ids = trousers.zones.map((z) => z.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual(expect.arrayContaining(['button', 'back-pocket-left', 'leg-left']))
  })

  it('keeps left and right parts on the wearer side in back views', () => {
    for (const id of ['tshirt', 'hoodie', 'trousers', 'dress']) {
      const [front, back] = getGarment(id).views
      const left = (t: typeof front) => t.zones.find((z) => /-left$/.test(z.id))!
      const center = (t: typeof front) => t.viewBox.x + t.viewBox.width / 2
      const frontSide = Math.sign(bounds(left(front).path).x - center(front))
      const backZone = back.zones.find((z) => z.id === left(front).id)!
      const backBounds = bounds(backZone.path)
      expect(Math.sign(backBounds.x + backBounds.width / 2 - center(back)), id).toBe(-frontSide)
    }
  })

  it('maps template ids from older project files to garments', () => {
    for (const garmentId of Object.values(LEGACY_GARMENT_IDS)) expect(hasGarment(garmentId)).toBe(true)
  })

  it('falls back to the first view for an unknown view', () => {
    expect(getTemplate('sneaker', 'inner').view).toBe('inner')
    expect(getTemplate('sneaker', 'back').view).toBe('outer')
    expect(getTemplate('sneaker').view).toBe('outer')
  })

  for (const [file, source] of Object.entries(templateSources)) {
    it(`${file} declares its garment view`, () => {
      const template = parseTemplate(source)
      expect(hasGarment(template.id)).toBe(true)
      expect(getGarment(template.id).views.some((v) => v.view === template.view)).toBe(true)
    })
  }

  for (const garment of garments) {
    for (const template of garment.views) {
      describe(`${garment.id} ${template.view}`, () => {
        it('has a valid viewBox', () => {
          expect(template.viewBox.width).toBeGreaterThan(0)
          expect(template.viewBox.height).toBeGreaterThan(0)
        })

        it('has labeled zones with unique ids, paths and hex colors', () => {
          expect(template.zones.length).toBeGreaterThan(1)
          expect(new Set(template.zones.map((z) => z.id)).size).toBe(template.zones.length)
          for (const zone of template.zones) {
            expect(zone.label).not.toMatch(/^zone-/)
            expect(zone.path.length).toBeGreaterThan(0)
            expect(zone.defaultColor).toMatch(/^#[0-9a-f]{6}$/i)
          }
        })

        it('has zone paths that parse into drawable shapes inside the viewBox', () => {
          const { viewBox } = template
          for (const zone of template.zones) {
            const b = bounds(zone.path)
            expect(b.width, zone.id).toBeGreaterThan(0)
            expect(b.height, zone.id).toBeGreaterThan(0)
            expect(b.x, zone.id).toBeGreaterThanOrEqual(viewBox.x)
            expect(b.x + b.width, zone.id).toBeLessThanOrEqual(viewBox.x + viewBox.width)
          }
        })

        it('keeps the print area inside the viewBox', () => {
          const { printArea, viewBox } = template
          if (!printArea) return
          expect(printArea.x).toBeGreaterThanOrEqual(viewBox.x)
          expect(printArea.y).toBeGreaterThanOrEqual(viewBox.y)
          expect(printArea.x + printArea.width).toBeLessThanOrEqual(viewBox.x + viewBox.width)
          expect(printArea.y + printArea.height).toBeLessThanOrEqual(viewBox.y + viewBox.height)
        })
      })
    }
  }
})

describe('mirrorPath', () => {
  it('mirrors absolute commands around the axis', () => {
    expect(mirrorPath('M10 20 L30 40 Q50 60 70 80 C1 2 3 4 5 6 H90 V7 Z', 100)).toBe(
      'M190 20 L170 40 Q150 60 130 80 C199 2 197 4 195 6 H110 V7 Z'
    )
  })

  it('negates x in relative commands', () => {
    expect(mirrorPath('m10 20 l5 -5 h-3 v4 z', 0)).toBe('m-10 20 l-5 -5 h3 v4 z')
  })

  it('treats extra moveto pairs as lines', () => {
    expect(mirrorPath('M0 0 10 10 20 0', 50)).toBe('M100 0 L90 10 L80 0')
    expect(mirrorPath('m0 0 10 10', 50)).toBe('m100 0 l-10 10')
  })

  it('flips the sweep and rotation of arcs', () => {
    expect(mirrorPath('M0 0 A10 20 30 0 1 40 50', 0)).toBe('M0 0 A10 20 -30 0 0 -40 50')
  })

  it('returns the original shape when applied twice', () => {
    const d = getTemplate('sneaker').zones[0].path
    expect(bounds(mirrorPath(mirrorPath(d, 300), 300))).toEqual(bounds(d))
  })

  it('derives a mirrored view with a mirrored print area', () => {
    const outer = getTemplate('sneaker', 'outer')
    const inner = deriveView(outer, 'inner', 'Inner side', { mirror: true })
    const { x, width } = outer.viewBox
    const before = bounds(outer.zones[0].path)
    const after = bounds(inner.zones[0].path)
    expect(after.x).toBeCloseTo(2 * x + width - before.x - before.width)
    expect(after.y).toBeCloseTo(before.y)
    if (outer.printArea && inner.printArea) {
      expect(inner.printArea.x + inner.printArea.width).toBeCloseTo(2 * x + width - outer.printArea.x)
    }
  })
})
