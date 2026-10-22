import { useEffect } from 'react'
import { EditorCanvas } from './canvas/EditorCanvas'
import { useEditor } from './document/store'
import { PalettePanel } from './panels/PalettePanel'
import { PartsPanel } from './panels/PartsPanel'
import { Toolbar } from './panels/Toolbar'
import { StatusBar } from './panels/StatusBar'
import { TemplatesPanel } from './panels/TemplatesPanel'

export function App() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (!(e.ctrlKey || e.metaKey)) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        useEditor.getState().undo()
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault()
        useEditor.getState().redo()
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
      <PalettePanel />
      <StatusBar />
    </div>
  )
}
