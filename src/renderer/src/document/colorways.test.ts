import { describe, expect, it } from 'vitest'
import { addColorway, nextColorwayName, remapColorways, removeColorway, renameColorway, switchColorway } from './colorways'
import { colorwayState, commit, createDocument, resolvedColorways, undo, withColorway, type DesignDocument, type History } from './model'

const zones = [
  { id: 'body', defaultColor: '#ffffff' },
  { id: 'collar', defaultColor: '#cccccc' }
]
const empty: History = { past: [], future: [] }

function apply(doc: DesignDocument, to: ReturnType<typeof addColorway> | null): DesignDocument {
  if (!to) throw new Error('expected a change')
  return { ...doc, ...to }
}

function twoColorways() {
  let doc = createDocument('tshirt-front', zones)
  doc = { ...doc, zoneColors: { ...doc.zoneColors, body: '#111111' } }
  doc = apply(doc, addColorway(doc, 'red'))
  return { ...doc, zoneColors: { ...doc.zoneColors, body: '#c8102e' } }
}

describe('colorways', () => {
  it('starts with one colorway holding the template colors', () => {
    const doc = createDocument('tshirt-front', zones)
    expect(doc.colorways).toEqual([{ id: 'colorway-1', name: 'Colorway 1', zoneColors: doc.zoneColors, zonePatterns: {} }])
    expect(doc.activeColorwayId).toBe('colorway-1')
  })

  it('duplicates the active colorway with its live colors and activates the copy', () => {
    const doc = twoColorways()
    expect(doc.activeColorwayId).toBe('red')
    expect(doc.colorways.map((c) => c.name)).toEqual(['Colorway 1', 'Colorway 2'])
    expect(doc.colorways[0].zoneColors.body).toBe('#111111')
  })

  it('keeps edits of the active colorway when switching away and back', () => {
    const doc = twoColorways()
    const first = apply(doc, switchColorway(doc, 'colorway-1'))
    expect(first.zoneColors.body).toBe('#111111')
    const back = apply(first, switchColorway(first, 'red'))
    expect(back.zoneColors.body).toBe('#c8102e')
  })

  it('resolves every colorway for export without changing the document', () => {
    const doc = twoColorways()
    expect(resolvedColorways(doc).map((c) => c.zoneColors.body)).toEqual(['#111111', '#c8102e'])
    expect(withColorway(doc, 'colorway-1').zoneColors.body).toBe('#111111')
    expect(doc.activeColorwayId).toBe('red')
  })

  it('renames and refuses empty names', () => {
    const doc = twoColorways()
    expect(apply(doc, renameColorway(doc, 'red', '  Red drop ')).colorways[1].name).toBe('Red drop')
    expect(renameColorway(doc, 'red', '   ')).toBeNull()
  })

  it('removes a colorway and activates a neighbor, but never the last one', () => {
    const doc = twoColorways()
    const removed = apply(doc, removeColorway(doc, 'red'))
    expect(removed.colorways).toHaveLength(1)
    expect(removed.activeColorwayId).toBe('colorway-1')
    expect(removed.zoneColors.body).toBe('#111111')
    expect(removeColorway(removed, 'colorway-1')).toBeNull()
  })

  it('keeps patterns per colorway', () => {
    const stripes = { kind: 'stripes' as const, color: '#000000', scale: 1, angle: 0 }
    let doc = twoColorways()
    doc = { ...doc, zonePatterns: { body: stripes } }
    const first = apply(doc, switchColorway(doc, 'colorway-1'))
    expect(first.zonePatterns).toEqual({})
    const back = apply(first, switchColorway(first, 'red'))
    expect(back.zonePatterns).toEqual({ body: stripes })
    expect(apply(back, addColorway(back, 'copy')).zonePatterns).toEqual({ body: stripes })
  })

  it('drops patterns of parts the new template does not have', () => {
    const dots = { kind: 'dots' as const, color: '#000000', scale: 1, angle: 0 }
    const doc = { ...twoColorways(), zonePatterns: { body: dots, collar: dots } }
    const remapped = remapColorways(doc, [{ id: 'body', defaultColor: '#333333' }])
    expect(remapped.zonePatterns).toEqual({ body: dots })
  })

  it('remaps colorways to a new template by part id', () => {
    const doc = twoColorways()
    const remapped = remapColorways(doc, [
      { id: 'body', defaultColor: '#333333' },
      { id: 'hood', defaultColor: '#444444' }
    ])
    expect(remapped.colorways.map((c) => c.zoneColors)).toEqual([
      { body: '#111111', hood: '#444444' },
      { body: '#c8102e', hood: '#444444' }
    ])
    expect(remapped.zoneColors).toEqual({ body: '#c8102e', hood: '#444444' })
  })

  it('undoes colorway changes as one step and merges renames', () => {
    const doc = twoColorways()
    const switched = commit(doc, empty, { type: 'setColorways', from: colorwayState(doc), to: switchColorway(doc, 'colorway-1')! })
    expect(undo(switched.doc, switched.history).doc.activeColorwayId).toBe('red')

    let s: { doc: DesignDocument; history: History } = { doc, history: empty }
    for (const name of ['R', 'Re', 'Red']) {
      s = commit(s.doc, s.history, { type: 'setColorways', from: colorwayState(s.doc), to: renameColorway(s.doc, 'red', name)!, mergeKey: 'rename:red' })
    }
    expect(s.history.past).toHaveLength(1)
    expect(undo(s.doc, s.history).doc.colorways[1].name).toBe('Colorway 2')
  })

  it('names new colorways without collisions', () => {
    expect(nextColorwayName([{ id: 'a', name: 'Colorway 2', zoneColors: {}, zonePatterns: {} }])).toBe('Colorway 3')
  })
})
