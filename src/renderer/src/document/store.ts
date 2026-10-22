import { create } from 'zustand'
import { defaultTemplate } from '../templates'
import { commit, createDocument, redo, undo, type DesignDocument, type History, type Operation } from './model'

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
}

export const useEditor = create<EditorState>((set, get) => ({
  doc: createDocument(defaultTemplate.id, defaultTemplate.zones),
  history: { past: [], future: [] },
  selectedZoneId: null,

  dispatch: (op) => set((s) => commit(s.doc, s.history, op)),
  undo: () => set((s) => undo(s.doc, s.history)),
  redo: () => set((s) => redo(s.doc, s.history)),
  selectZone: (selectedZoneId) => set({ selectedZoneId }),

  setZoneColor: (zoneId, color) => {
    const from = get().doc.zoneColors[zoneId]
    if (from === undefined || from === color) return
    get().dispatch({ type: 'setZoneColor', zoneId, from, to: color })
  },

  addPaletteColor: (color) => {
    if (get().doc.palette.includes(color)) return
    get().dispatch({ type: 'addPaletteColor', color })
  }
}))
