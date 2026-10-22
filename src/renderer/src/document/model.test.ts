import { describe, expect, it } from 'vitest'
import { commit, createDocument, HISTORY_LIMIT, redo, undo, type History } from './model'

const zones = [
  { id: 'body', defaultColor: '#ffffff' },
  { id: 'collar', defaultColor: '#cccccc' }
]
const empty: History = { past: [], future: [] }

describe('document model', () => {
  it('creates a document with template default colors', () => {
    const doc = createDocument('tshirt-front', zones)
    expect(doc.zoneColors).toEqual({ body: '#ffffff', collar: '#cccccc' })
    expect(doc.palette.length).toBeGreaterThan(0)
  })

  it('undoes and redoes a zone color change', () => {
    const start = createDocument('tshirt-front', zones)
    const changed = commit(start, empty, { type: 'setZoneColor', zoneId: 'body', from: '#ffffff', to: '#c8102e' })
    expect(changed.doc.zoneColors.body).toBe('#c8102e')

    const undone = undo(changed.doc, changed.history)
    expect(undone.doc.zoneColors.body).toBe('#ffffff')
    expect(undone.history.future).toHaveLength(1)

    const redone = redo(undone.doc, undone.history)
    expect(redone.doc.zoneColors.body).toBe('#c8102e')
    expect(redone.history.future).toHaveLength(0)
  })

  it('clears the redo stack on a new operation', () => {
    const start = createDocument('tshirt-front', zones)
    const a = commit(start, empty, { type: 'setZoneColor', zoneId: 'body', from: '#ffffff', to: '#000000' })
    const u = undo(a.doc, a.history)
    const b = commit(u.doc, u.history, { type: 'addPaletteColor', color: '#123456' })
    expect(b.history.future).toHaveLength(0)
    expect(b.doc.palette.at(-1)).toBe('#123456')
  })

  it('caps the history length', () => {
    let state = { doc: createDocument('tshirt-front', zones), history: empty }
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) {
      state = commit(state.doc, state.history, { type: 'addPaletteColor', color: '#000000' })
    }
    expect(state.history.past).toHaveLength(HISTORY_LIMIT)
  })

  it('does nothing when there is nothing to undo or redo', () => {
    const doc = createDocument('tshirt-front', zones)
    expect(undo(doc, empty).doc).toBe(doc)
    expect(redo(doc, empty).doc).toBe(doc)
  })
})
