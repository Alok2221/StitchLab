import { describe, expect, it } from 'vitest'
import { commit, createDocument, HISTORY_LIMIT, initialColorways, redo, undo, type History, type ZonePattern } from './model'

const zones = [
  { id: 'body', defaultColor: '#ffffff' },
  { id: 'collar', defaultColor: '#cccccc' }
]
const empty: History = { past: [], future: [] }

describe('document model', () => {
  it('creates a document with template default colors', () => {
    const doc = createDocument('tshirt', zones)
    expect(doc.zoneColors).toEqual({ body: '#ffffff', collar: '#cccccc' })
    expect(doc.palette.length).toBeGreaterThan(0)
  })

  it('undoes and redoes a zone color change', () => {
    const start = createDocument('tshirt', zones)
    const changed = commit(start, empty, { type: 'setZoneColor', zoneId: 'body', from: '#ffffff', to: '#c8102e' })
    expect(changed.doc.zoneColors.body).toBe('#c8102e')

    const undone = undo(changed.doc, changed.history)
    expect(undone.doc.zoneColors.body).toBe('#ffffff')
    expect(undone.history.future).toHaveLength(1)

    const redone = redo(undone.doc, undone.history)
    expect(redone.doc.zoneColors.body).toBe('#c8102e')
    expect(redone.history.future).toHaveLength(0)
  })

  it('sets, adjusts and removes a part pattern with merged slider edits', () => {
    const stripes: ZonePattern = { kind: 'stripes', color: '#000000', scale: 1, angle: 0 }
    let s = commit(createDocument('tshirt', zones), empty, { type: 'setZonePattern', zoneId: 'body', from: null, to: stripes })
    for (const scale of [1.2, 1.5, 2]) {
      const from = s.doc.zonePatterns.body
      s = commit(s.doc, s.history, { type: 'setZonePattern', zoneId: 'body', from, to: { ...stripes, scale }, mergeKey: 'pattern:body:scale' })
    }
    expect(s.history.past).toHaveLength(2)
    expect(s.doc.zonePatterns.body.scale).toBe(2)
    expect(undo(s.doc, s.history).doc.zonePatterns.body.scale).toBe(1)

    const removed = commit(s.doc, s.history, { type: 'setZonePattern', zoneId: 'body', from: s.doc.zonePatterns.body, to: null })
    expect(removed.doc.zonePatterns).toEqual({})
    expect(undo(removed.doc, removed.history).doc.zonePatterns.body.scale).toBe(2)
  })

  it('clears the redo stack on a new operation', () => {
    const start = createDocument('tshirt', zones)
    const a = commit(start, empty, { type: 'setZoneColor', zoneId: 'body', from: '#ffffff', to: '#000000' })
    const u = undo(a.doc, a.history)
    const b = commit(u.doc, u.history, { type: 'addPaletteColor', color: '#123456' })
    expect(b.history.future).toHaveLength(0)
    expect(b.doc.palette.at(-1)).toBe('#123456')
  })

  it('caps the history length', () => {
    let state = { doc: createDocument('tshirt', zones), history: empty }
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) {
      state = commit(state.doc, state.history, { type: 'addPaletteColor', color: '#000000' })
    }
    expect(state.history.past).toHaveLength(HISTORY_LIMIT)
  })

  it('switches template and restores the previous garment on undo', () => {
    const start = createDocument('tshirt', zones)
    const recolored = commit(start, empty, { type: 'setZoneColor', zoneId: 'body', from: '#ffffff', to: '#c8102e' })
    const switched = commit(recolored.doc, recolored.history, {
      type: 'setTemplate',
      from: { templateId: 'tshirt', layerViews: {}, ...initialColorways(recolored.doc.zoneColors) },
      to: { templateId: 'sneaker', layerViews: {}, ...initialColorways({ upper: '#f4f4f2', sole: '#3b3f4a' }) }
    })
    expect(switched.doc.templateId).toBe('sneaker')
    expect(switched.doc.zoneColors).toEqual({ upper: '#f4f4f2', sole: '#3b3f4a' })
    expect(switched.doc.palette).toEqual(start.palette)

    const undone = undo(switched.doc, switched.history)
    expect(undone.doc.templateId).toBe('tshirt')
    expect(undone.doc.zoneColors.body).toBe('#c8102e')
  })

  it('does nothing when there is nothing to undo or redo', () => {
    const doc = createDocument('tshirt', zones)
    expect(undo(doc, empty).doc).toBe(doc)
    expect(redo(doc, empty).doc).toBe(doc)
  })
})
