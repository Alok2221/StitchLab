import { create } from 'zustand'
import { defaultTemplate, getTemplate, type GarmentTemplate } from '../templates'
import { addColorway, remapColorways, removeColorway, renameColorway, switchColorway } from './colorways'
import {
  CLIP_GARMENT,
  colorwayState,
  commit,
  createDocument,
  pickLayerValues,
  redo,
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
  setZoneColor: (zoneId: string, color: string) => void
  addPaletteColor: (color: string) => void
  setTemplate: (templateId: string) => void
  addTextLayer: () => void
  addImageLayer: (image: { src: string; width: number; height: number; name: string }) => void
  updateLayer: (id: string, patch: LayerPatch, mergeKey?: string) => void
  removeLayer: (id: string) => void
  moveLayer: (id: string, direction: 'up' | 'down') => void
  setZonePattern: (zoneId: string, pattern: ZonePattern | null, mergeKey?: string) => void
  addColorway: () => void
  switchColorway: (id: string) => void
  renameColorway: (id: string, name: string) => void
  removeColorway: (id: string) => void
}

type Selection = Pick<EditorState, 'selectedZoneId' | 'selectedLayerId'>

function keepValidSelection(doc: DesignDocument, s: Selection): Selection {
  return {
    selectedZoneId: s.selectedZoneId && s.selectedZoneId in doc.zoneColors ? s.selectedZoneId : null,
    selectedLayerId: doc.layers.some((l) => l.id === s.selectedLayerId) ? s.selectedLayerId : null
  }
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

export const useEditor = create<EditorState>((set, get) => {
  const addLayer = (layer: Layer) => {
    get().dispatch({ type: 'addLayer', layer, index: get().doc.layers.length })
    set({ selectedLayerId: layer.id, selectedZoneId: null })
  }

  const applyHistoryStep = (s: EditorState, next: { doc: DesignDocument; history: History }) => ({
    ...next,
    ...keepValidSelection(next.doc, s),
    revision: next.doc === s.doc ? s.revision : s.revision + 1
  })

  return {
    doc: createDocument(defaultTemplate.id, defaultTemplate.zones),
    history: { past: [], future: [] },
    selectedZoneId: null,
    selectedLayerId: null,
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
          revision,
          savedRevision: options.dirty ? -1 : revision
        }
      }),
    markSaved: (filePath, revision) => set({ filePath, savedRevision: revision }),

    dispatch: (op) => set((s) => applyHistoryStep(s, commit(s.doc, s.history, op))),
    undo: () => set((s) => applyHistoryStep(s, undo(s.doc, s.history))),
    redo: () => set((s) => applyHistoryStep(s, redo(s.doc, s.history))),
    selectZone: (selectedZoneId) => set({ selectedZoneId, selectedLayerId: null }),
    selectLayer: (selectedLayerId) => set({ selectedLayerId, selectedZoneId: null }),

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
      const template = getTemplate(templateId)
      get().dispatch({
        type: 'setTemplate',
        from: { templateId: doc.templateId, ...colorwayState(doc) },
        to: { templateId: template.id, ...remapColorways(doc, template.zones) }
      })
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
      const area = placementArea(getTemplate(doc.templateId))
      const layer: TextLayer = {
        id: crypto.randomUUID(),
        type: 'text',
        name: nextName(doc.layers, 'Text'),
        x: area.cx,
        y: area.cy,
        rotation: 0,
        scale: 1,
        opacity: 1,
        visible: true,
        locked: false,
        clip: CLIP_GARMENT,
        text: 'Your text',
        fontFamily: 'Arial',
        fontSize: Math.round(Math.max(16, area.width / 4)),
        fontWeight: 'bold',
        fill: '#1f1f22'
      }
      addLayer(layer)
    },

    addImageLayer: ({ src, width, height, name }) => {
      const { doc } = get()
      const area = placementArea(getTemplate(doc.templateId))
      const scale = Math.min(1, (area.width * 0.8) / width, (area.height * 0.8) / height)
      const layer: ImageLayer = {
        id: crypto.randomUUID(),
        type: 'image',
        name,
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
      const to = direction === 'up' ? from + 1 : from - 1
      if (from < 0 || to < 0 || to >= layers.length) return
      get().dispatch({ type: 'moveLayer', from, to })
    }
  }
})

export function useCurrentTemplate(): GarmentTemplate {
  return useEditor((s) => getTemplate(s.doc.templateId))
}

export const isDirty = (s: Pick<EditorState, 'revision' | 'savedRevision'>) => s.revision !== s.savedRevision

export function useSelectedLayer(): Layer | undefined {
  return useEditor((s) => s.doc.layers.find((l) => l.id === s.selectedLayerId))
}
