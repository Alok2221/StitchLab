import { describe, expect, it } from 'vitest'
import {
  CLIP_GARMENT,
  commit,
  createDocument,
  initialColorways,
  layerViews,
  pickLayerValues,
  redo,
  remapLayerViews,
  undo,
  type History,
  type TextLayer
} from './model'

const empty: History = { past: [], future: [] }

function textLayer(id: string): TextLayer {
  return {
    id,
    type: 'text',
    name: id,
    view: 'front',
    x: 100,
    y: 100,
    rotation: 0,
    scale: 1,
    opacity: 1,
    visible: true,
    locked: false,
    clip: CLIP_GARMENT,
    text: 'Hello',
    fontFamily: 'Arial',
    fontSize: 48,
    fontWeight: 'bold',
    fill: '#000000'
  }
}

function withLayers(...ids: string[]) {
  let state = { doc: createDocument('tshirt', [{ id: 'body', defaultColor: '#ffffff' }]), history: empty }
  ids.forEach((id, index) => {
    state = commit(state.doc, state.history, { type: 'addLayer', layer: textLayer(id), index })
  })
  return state
}

describe('layer operations', () => {
  it('adds and removes layers with undo', () => {
    const added = withLayers('a', 'b')
    expect(added.doc.layers.map((l) => l.id)).toEqual(['a', 'b'])

    const removed = commit(added.doc, added.history, { type: 'removeLayer', layer: added.doc.layers[0], index: 0 })
    expect(removed.doc.layers.map((l) => l.id)).toEqual(['b'])

    const restored = undo(removed.doc, removed.history)
    expect(restored.doc.layers.map((l) => l.id)).toEqual(['a', 'b'])
  })

  it('updates a layer and reverts to the previous values', () => {
    const state = withLayers('a')
    const layer = state.doc.layers[0]
    const to = { x: 250, text: 'StitchLab' }
    const updated = commit(state.doc, state.history, { type: 'updateLayer', id: 'a', from: pickLayerValues(layer, to), to })
    expect(updated.doc.layers[0]).toMatchObject({ x: 250, text: 'StitchLab', y: 100 })

    const undone = undo(updated.doc, updated.history)
    expect(undone.doc.layers[0]).toMatchObject({ x: 100, text: 'Hello' })
  })

  it('merges a gesture into one history entry', () => {
    const state = withLayers('a')
    const before = state.history.past.length
    let s = state
    for (const x of [110, 120, 130]) {
      const layer = s.doc.layers[0]
      s = commit(s.doc, s.history, {
        type: 'updateLayer',
        id: 'a',
        from: pickLayerValues(layer, { x }),
        to: { x },
        mergeKey: 'drag-1'
      })
    }
    expect(s.history.past).toHaveLength(before + 1)
    expect(s.doc.layers[0].x).toBe(130)
    expect(undo(s.doc, s.history).doc.layers[0].x).toBe(100)
  })

  it('does not merge different gestures', () => {
    const state = withLayers('a')
    const a = commit(state.doc, state.history, { type: 'updateLayer', id: 'a', from: { x: 100 }, to: { x: 110 }, mergeKey: 'drag-1' })
    const b = commit(a.doc, a.history, { type: 'updateLayer', id: 'a', from: { x: 110 }, to: { x: 120 }, mergeKey: 'drag-2' })
    expect(b.history.past).toHaveLength(state.history.past.length + 2)
  })

  it('reorders layers and restores the order on undo', () => {
    const state = withLayers('a', 'b', 'c')
    const moved = commit(state.doc, state.history, { type: 'moveLayer', from: 0, to: 2 })
    expect(moved.doc.layers.map((l) => l.id)).toEqual(['b', 'c', 'a'])

    const undone = undo(moved.doc, moved.history)
    expect(undone.doc.layers.map((l) => l.id)).toEqual(['a', 'b', 'c'])
    expect(redo(undone.doc, undone.history).doc.layers.map((l) => l.id)).toEqual(['b', 'c', 'a'])
  })

  it('keeps layers when the template changes', () => {
    const state = withLayers('a')
    const switched = commit(state.doc, state.history, {
      type: 'setTemplate',
      from: { templateId: 'tshirt', layerViews: { a: 'front' }, ...initialColorways(state.doc.zoneColors) },
      to: { templateId: 'hoodie', layerViews: { a: 'front' }, ...initialColorways({ body: '#333333' }) }
    })
    expect(switched.doc.layers.map((l) => l.id)).toEqual(['a'])
  })

  it('moves layers to the matching view of another garment and back on undo', () => {
    const state = withLayers('a', 'b', 'c')
    const layers = state.doc.layers.map((l, i) => ({ ...l, view: ['front', 'back', 'side'][i] }))
    const to = remapLayerViews(layers, ['front', 'back'], ['outer', 'inner'])
    expect(to).toEqual({ a: 'outer', b: 'inner', c: 'outer' })
    expect(remapLayerViews(layers, ['front', 'back'], ['front', 'back', 'top'])).toEqual({ a: 'front', b: 'back', c: 'front' })
    expect(remapLayerViews(layers, ['front', 'back', 'side'], ['front', 'back', 'side'])).toEqual(layerViews(layers))

    const doc = { ...state.doc, layers }
    const switched = commit(doc, empty, {
      type: 'setTemplate',
      from: { templateId: 'tshirt', layerViews: layerViews(layers), ...initialColorways(doc.zoneColors) },
      to: { templateId: 'sneaker', layerViews: to, ...initialColorways({ upper: '#ffffff' }) }
    })
    expect(switched.doc.layers.map((l) => l.view)).toEqual(['outer', 'inner', 'outer'])
    expect(undo(switched.doc, switched.history).doc.layers.map((l) => l.view)).toEqual(['front', 'back', 'side'])
  })
})
