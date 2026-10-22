import { create } from 'zustand'

export interface Notice {
  message: string
  kind: 'info' | 'error'
}

export const useNotice = create<{ notice: Notice | null; show: (notice: Notice | null) => void }>((set) => ({
  notice: null,
  show: (notice) => set({ notice })
}))

export const notify = (message: string, kind: Notice['kind'] = 'info') => useNotice.getState().show({ message, kind })
