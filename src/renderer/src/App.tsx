import { useEffect } from 'react'
import { EditorCanvas } from './canvas/EditorCanvas'
import { useEditor } from './document/store'
import { LayersPanel } from './panels/LayersPanel'
import { PalettePanel } from './panels/PalettePanel'
import { PartsPanel } from './panels/PartsPanel'
import { PropertiesPanel } from './panels/PropertiesPanel'
import { StatusBar } from './panels/StatusBar'
import { TemplatesPanel } from './panels/TemplatesPanel'
import { Toolbar } from './panels/Toolbar'

const NUDGE = 1
const NUDGE_LARGE = 10
const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1]
}

function isEditingText(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
  )
}

export function App() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditingText(e.target)) return
      const editor = useEditor.getState()
      const key = e.key.toLowerCase()

      if (e.ctrlKey || e.metaKey) {
        if (key === 'z' && !e.shiftKey) {
          e.preventDefault()
          editor.undo()
        } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
          e.preventDefault()
          editor.redo()
        }
        return
      }

      if (e.key === 'Escape') {
        editor.selectZone(null)
        return
      }

      const layer = editor.doc.layers.find((l) => l.id === editor.selectedLayerId)
      if (!layer) return

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        editor.removeLayer(layer.id)
      } else if (e.key in ARROWS && !layer.locked) {
        e.preventDefault()
        const [dx, dy] = ARROWS[e.key]
        const step = e.shiftKey ? NUDGE_LARGE : NUDGE
        editor.updateLayer(layer.id, { x: layer.x + dx * step, y: layer.y + dy * step }, `nudge:${layer.id}`)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="app">
      <Toolbar />
      <aside className="panel panel-left">
        <TemplatesPanel />
        <PartsPanel />
      </aside>
      <main className="workspace">
        <EditorCanvas />
      </main>
      <aside className="panel panel-right">
        <LayersPanel />
        <PropertiesPanel />
        <PalettePanel />
      </aside>
      <StatusBar />
    </div>
  )
}
