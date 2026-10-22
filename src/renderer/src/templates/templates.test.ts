// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { GraphicsPath } from 'pixi.js'
import { templateSources, templates, TEMPLATE_CATEGORIES } from './index'
import { parseTemplate } from './parseTemplate'

describe('garment templates', () => {
  it('have unique ids', () => {
    const ids = templates.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('cover every category', () => {
    for (const category of TEMPLATE_CATEGORIES) {
      expect(templates.some((t) => t.category === category)).toBe(true)
    }
  })

  for (const [file, source] of Object.entries(templateSources)) {
    describe(file, () => {
      const template = parseTemplate(source)

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

      it('has zone paths that parse into drawable shapes', () => {
        for (const zone of template.zones) {
          const bounds = new GraphicsPath(zone.path).bounds
          expect(bounds.width, zone.id).toBeGreaterThan(0)
          expect(bounds.height, zone.id).toBeGreaterThan(0)
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
})
