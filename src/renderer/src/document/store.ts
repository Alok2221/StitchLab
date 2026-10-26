import { useMemo } from 'react'
import { create } from 'zustand'
import { defaultGarment, getGarment, getTemplate, type GarmentTemplate } from '../templates'
import { addColorway, remapColorways, removeColorway, renameColorway, switchColorway } from './colorways'
import { DEFAULT_TEXT, DUPLICATE_OFFSET, defaultFontSize, placeOnView } from './placement'
import {
  CLIP_GARMENT,
  colorwayState,
  commit,
  createDocument,
  layerViews,
  pickLayerValues,
  redo,
  remapLayerViews,
  undo,
  type DesignDocument,
  type History,
  type ImageLayer,
  type Layer,
  type LayerPatch,
  type Operation,
  type TextLayer,
  type ZonePattern
} from './model'

interface EditorState {
  doc: DesignDocument
  history: History
  selectedZoneId: string | null
  selectedLayerId: string | null
  /** View of the garment shown on the canvas; UI state, not part of the undo history. */
  activeViewId: string
  /** Path of the open project file, or null for an unsaved project. */
  filePath: string | null
  /** Increments on every document change; compared with `savedRevision` to detect unsaved work. */
  revision: number
  savedRevision: number
  loadDocument: (doc: DesignDocument, filePath: string | null, options?: { dirty?: boolean }) => void
  markSaved: (filePath: string, revision: number) => void
  dispatch: (op: Operation) => void
  undo: () => void
  redo: () => void
  selectZone: (zoneId: string | null) => void
  selectLayer: (layerId: string | null) => void
  setActiveView: (viewId: string) => void
  setZoneColor: (zoneId: string, color: string) => void
  addPaletteColor: (color: string) => void
  setTemplate: (templateId: string) => void
  addTextLayer: () => void
  addImageLayer: (image: { src: string; width: number; height: number; name: string }) => void
  updateLayer: (id: string, patch: LayerPatch, mergeKey?: string) => void
  removeLayer: (id: string) => void
  moveLayer: (id: string, direction: 'up' | 'down') => void
  /** Copies a layer onto a view (its own view by default) right above the original. */
  duplicateLayer: (id: string, viewId?: string) => void
  /** Moves a layer to another view and shows that view. */
  moveLayerToView: (id: string, viewId: string) => void
  /** Layer copied with Ctrl+C, with the garment it came from; UI state, not saved. */
  clipboard: { layer: Layer; templateId: string } | null
  copyLayer: (id: string) => void
  /** Pastes the copied layer onto the active view. */
  pasteLayer: () => void
  setZonePattern: (zoneId: string, pattern: ZonePattern | null, mergeKey?: string) => void
  addColorway: () => void
  switchColorway: (id: string) => void
  renameColorway: (id: string, name: string) => void
  removeColorway: (id: string) => void
}

type ViewState = Pick<EditorState, 'selectedZoneId' | 'selectedLayerId' | 'activeViewId'>

/** Falls back to the first view when the garment has no such view, and drops selection outside the view. */
function keepValidView(doc: DesignDocument, s: ViewState): ViewState {
  const view = getTemplate(doc.templateId, s.activeViewId)
  return {
    activeViewId: view.view,
    selectedZoneId: view.zones.some((z) => z.id === s.selectedZoneId) ? s.selectedZoneId : null,
    selectedLayerId: doc.layers.some((l) => l.id === s.selectedLayerId && l.view === view.view)
      ? s.selectedLayerId
      : null
  }
}

/** Switches to the view a layer operation changes, so undo and redo never act out of sight. */
function showChangedView<S extends ViewState & { doc: DesignDocument }>(
  s: S,
  op: Operation | undefined,
  direction: 'undo' | 'redo'
): S {
  let view: string | undefined
  if (op?.type === 'addLayer' || op?.type === 'removeLayer') view = op.layer.view
  else if (op?.type === 'updateLayer') {
    view = (direction === 'undo' ? op.from : op.to).view ?? s.doc.layers.find((l) => l.id === op.id)?.view
  }
  else if (op?.type === 'moveLayer') view = (s.doc.layers[op.from] ?? s.doc.layers[op.to])?.view
  return view && view !== s.activeViewId ? { ...s, activeViewId: view } : s
}

/** Center of the print area, or of the whole template when it has none. */
function placementArea(template: GarmentTemplate) {
  const area = template.printArea ?? template.viewBox
  return { cx: area.x + area.width / 2, cy: area.y + area.height / 2, width: area.width, height: area.height }
}

function nextName(layers: Layer[], prefix: string): string {
  const used = new Set(layers.map((l) => l.name))
  let n = 1
  while (used.has(`${prefix} ${n}`)) n++
  return `${prefix} ${n}`
}

function copyName(layers: Layer[], name: string): string {
  const used = new Set(layers.map((l) => l.name))
  if (!used.has(`${name} copy`)) return `${name} copy`
  let n = 2
  while (used.has(`${name} copy ${n}`)) n++
  return `${name} copy ${n}`
}

export const useEditor = create<EditorState>((set, get) => {
  const addLayer = (layer: Layer, index = get().doc.layers.length) => {
    get().dispatch({ type: 'addLayer', layer, index })
    set({ selectedLayerId: layer.id, selectedZoneId: null })
  }

  /** A copy of `layer` placed on `to`; on the layer's own view it is offset and renamed. */
  const placedCopy = (layer: Layer, from: GarmentTemplate, to: GarmentTemplate): Layer => {
    const same = from.id === to.id && from.view === to.view
    const placed = placeOnView(layer, from, to)
    return {
      ...layer,
      ...placed,
      ...(same ? { x: layer.x + DUPLICATE_OFFSET, y: layer.y + DUPLICATE_OFFSET } : {}),
      id: crypto.randomUUID(),
      name: same ? copyName(get().doc.layers, layer.name) : layer.name
    } as Layer
  }

  const applyHistoryStep = (s: EditorState, next: { doc: DesignDocument; history: History }) => ({
    ...next,
    ...keepValidView(next.doc, s),
    revision: next.doc === s.doc ? s.revision : s.revision + 1
  })

  const activeTemplate = () => getTemplate(get().doc.templateId, get().activeViewId)

  return {
    doc: createDocument(defaultGarment.id, defaultGarment.zones),
    history: { past: [], future: [] },
    selectedZoneId: null,
    selectedLayerId: null,
    activeViewId: defaultGarment.views[0].view,
    filePath: null,
    revision: 0,
    savedRevision: 0,

    loadDocument: (doc, filePath, options = {}) =>
      set((s) => {
        const revision = s.revision + 1
        return {
          doc,
          filePath,
          history: { past: [], future: [] },
          selectedZoneId: null,
          selectedLayerId: null,
          activeViewId: getTemplate(doc.templateId).view,
          revision,
          savedRevision: options.dirty ? -1 : revision
        }
      }),
    markSaved: (filePath, revision) => set({ filePath, savedRevision: revision }),

    dispatch: (op) => set((s) => applyHistoryStep(s, commit(s.doc, s.history, op))),
    undo: () =>
      set((s) => applyHistoryStep(showChangedView(s, s.history.past.at(-1), 'undo'), undo(s.doc, s.history))),
    redo: () =>
      set((s) => applyHistoryStep(showChangedView(s, s.history.future[0], 'redo'), redo(s.doc, s.history))),
    selectZone: (selectedZoneId) => set({ selectedZoneId, selectedLayerId: null }),
    selectLayer: (selectedLayerId) => set({ selectedLayerId, selectedZoneId: null }),
    setActiveView: (viewId) => set((s) => keepValidView(s.doc, { ...s, activeViewId: viewId })),

    setZoneColor: (zoneId, color) => {
      const from = get().doc.zoneColors[zoneId]
      if (from === undefined || from === color) return
      get().dispatch({ type: 'setZoneColor', zoneId, from, to: color })
    },

    addPaletteColor: (color) => {
      if (get().doc.palette.includes(color)) return
      get().dispatch({ type: 'addPaletteColor', color })
    },

    setTemplate: (templateId) => {
      const { doc } = get()
      if (doc.templateId === templateId) return
      const garment = getGarment(templateId)
      const fromViews = getGarment(doc.templateId).views.map((v) => v.view)
      const toViews = garment.views.map((v) => v.view)
      const activeView = toViews[fromViews.indexOf(get().activeViewId)] ?? toViews[0]
      get().dispatch({
        type: 'setTemplate',
        from: { templateId: doc.templateId, layerViews: layerViews(doc.layers), ...colorwayState(doc) },
        to: {
          templateId: garment.id,
          layerViews: remapLayerViews(doc.layers, fromViews, toViews),
          ...remapColorways(doc, garment.zones)
        }
      })
      set((s) => keepValidView(s.doc, { ...s, activeViewId: activeView }))
    },

    setZonePattern: (zoneId, pattern, mergeKey) => {
      const from = get().doc.zonePatterns[zoneId] ?? null
      if (from === pattern) return
      get().dispatch({ type: 'setZonePattern', zoneId, from, to: pattern, mergeKey })
    },

    addColorway: () => {
      const { doc } = get()
      get().dispatch({ type: 'setColorways', from: colorwayState(doc), to: addColorway(doc, crypto.randomUUID()) })
    },
    switchColorway: (id) => {
      const { doc } = get()
      const to = switchColorway(doc, id)
      if (to) get().dispatch({ type: 'setColorways', from: colorwayState(doc), to })
    },
    renameColorway: (id, name) => {
      const { doc } = get()
      const to = renameColorway(doc, id, name)
      if (to) get().dispatch({ type: 'setColorways', from: colorwayState(doc), to, mergeKey: `rename:${id}` })
    },
    removeColorway: (id) => {
      const { doc } = get()
      const to = removeColorway(doc, id)
      if (to) get().dispatch({ type: 'setColorways', from: colorwayState(doc), to })
    },

    addTextLayer: () => {
      const { doc } = get()
      const template = activeTemplate()
      const area = placementArea(template)
      const layer: TextLayer = {
        id: crypto.randomUUID(),
        type: 'text',
        name: nextName(doc.layers, 'Text'),
        view: template.view,
        x: area.cx,
        y: area.cy,
        rotation: 0,
        scale: 1,
        opacity: 1,
        visible: true,
        locked: false,
        clip: CLIP_GARMENT,
        text: DEFAULT_TEXT,
        fontFamily: 'Arial',
        fontSize: defaultFontSize(template),
        fontWeight: 'bold',
        fill: '#1f1f22'
      }
      addLayer(layer)
    },

    addImageLayer: ({ src, width, height, name }) => {
      const template = activeTemplate()
      const area = placementArea(template)
      const scale = Math.min(1, (area.width * 0.8) / width, (area.height * 0.8) / height)
      const layer: ImageLayer = {
        id: crypto.randomUUID(),
        type: 'image',
        name,
        view: template.view,
        x: area.cx,
        y: area.cy,
        rotation: 0,
        scale,
        opacity: 1,
        visible: true,
        locked: false,
        clip: CLIP_GARMENT,
        src,
        width,
        height
      }
      addLayer(layer)
    },

    updateLayer: (id, patch, mergeKey) => {
      const layer = get().doc.layers.find((l) => l.id === id)
      if (!layer) return
      const from = pickLayerValues(layer, patch)
      const changed = Object.entries(patch).some(([key, value]) => (from as Record<string, unknown>)[key] !== value)
      if (!changed) return
      get().dispatch({ type: 'updateLayer', id, from, to: patch, mergeKey })
    },

    removeLayer: (id) => {
      const index = get().doc.layers.findIndex((l) => l.id === id)
      if (index < 0) return
      get().dispatch({ type: 'removeLayer', layer: get().doc.layers[index], index })
    },

    moveLayer: (id, direction) => {
      const { layers } = get().doc
      const from = layers.findIndex((l) => l.id === id)
      if (from < 0) return
      const step = direction === 'up' ? 1 : -1
      let to = from + step
      while (to >= 0 && to < layers.length && layers[to].view !== layers[from].view) to += step
      if (to < 0 || to >= layers.length) return
      get().dispatch({ type: 'moveLayer', from, to })
    },

    duplicateLayer: (id, viewId) => {
      const { doc } = get()
      const index = doc.layers.findIndex((l) => l.id === id)
      if (index < 0) return
      const layer = doc.layers[index]
      const from = getTemplate(doc.templateId, layer.view)
      const to = getTemplate(doc.templateId, viewId ?? layer.view)
      addLayer(placedCopy(layer, from, to), index + 1)
      set((s) => keepValidView(s.doc, { ...s, activeViewId: to.view }))
    },

    moveLayerToView: (id, viewId) => {
      const { doc } = get()
      const layer = doc.layers.find((l) => l.id === id)
      const to = getTemplate(doc.templateId, viewId)
      if (!layer || layer.view === to.view) return
      get().updateLayer(id, placeOnView(layer, getTemplate(doc.templateId, layer.view), to))
      set((s) => keepValidView(s.doc, { ...s, activeViewId: to.view, selectedLayerId: id }))
    },

    clipboard: null,
    copyLayer: (id) => {
      const { doc } = get()
      const layer = doc.layers.find((l) => l.id === id)
      if (layer) set({ clipboard: { layer, templateId: doc.templateId } })
    },
    pasteLayer: () => {
      const { clipboard, doc } = get()
      if (!clipboard) return
      const from = getTemplate(clipboard.templateId, clipboard.layer.view)
      const copy = placedCopy(clipboard.layer, from, activeTemplate())
      addLayer(copy)
      // The next paste starts from this copy, so repeated pastes cascade instead of stacking exactly.
      set({ clipboard: { layer: copy, templateId: doc.templateId } })
    }
  }
})

/** The garment view shown on the canvas. */
export function useCurrentTemplate(): GarmentTemplate {
  return useEditor((s) => getTemplate(s.doc.templateId, s.activeViewId))
}

export function useViewLayers(): Layer[] {
  const layers = useEditor((s) => s.doc.layers)
  const view = useEditor((s) => s.activeViewId)
  return useMemo(() => layers.filter((l) => l.view === view), [layers, view])
}

export const isDirty = (s: Pick<EditorState, 'revision' | 'savedRevision'>) => s.revision !== s.savedRevision

export function useSelectedLayer(): Layer | undefined {
  return useEditor((s) => s.doc.layers.find((l) => l.id === s.selectedLayerId))
}
