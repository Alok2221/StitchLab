import { create } from 'zustand'
import { defaultTemplate, getTemplate, type GarmentTemplate } from '../templates'
import {
  commit,
  createDocument,
  defaultZoneColors,
  redo,
  undo,
  type DesignDocument,
  type History,
  type Operation
} from './model'

interface EditorState {
  doc: DesignDocument
  history: History
  selectedZoneId: string | null
  dispatch: (op: Operation) => void
  undo: () => void
  redo: () => void
  selectZone: (zoneId: string | null) => void
  setZoneColor: (zoneId: string, color: string) => void
  addPaletteColor: (color: string) => void
  setTemplate: (templateId: string) => void
}

function keepValidSelection(doc: DesignDocument, selectedZoneId: string | null): string | null {
  return selectedZoneId && selectedZoneId in doc.zoneColors ? selectedZoneId : null
}

export const useEditor = create<EditorState>((set, get) => ({
  doc: createDocument(defaultTemplate.id, defaultTemplate.zones),
  history: { past: [], future: [] },
  selectedZoneId: null,

  dispatch: (op) =>
    set((s) => {
      const next = commit(s.doc, s.history, op)
      return { ...next, selectedZoneId: keepValidSelection(next.doc, s.selectedZoneId) }
    }),
  undo: () =>
    set((s) => {
      const next = undo(s.doc, s.history)
      return { ...next, selectedZoneId: keepValidSelection(next.doc, s.selectedZoneId) }
    }),
  redo: () =>
    set((s) => {
      const next = redo(s.doc, s.history)
      return { ...next, selectedZoneId: keepValidSelection(next.doc, s.selectedZoneId) }
    }),
  selectZone: (selectedZoneId) => set({ selectedZoneId }),

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
      from: { templateId: doc.templateId, zoneColors: doc.zoneColors },
      to: { templateId: template.id, zoneColors: defaultZoneColors(template.zones) }
    })
  }
}))

export function useCurrentTemplate(): GarmentTemplate {
  return useEditor((s) => getTemplate(s.doc.templateId))
}
