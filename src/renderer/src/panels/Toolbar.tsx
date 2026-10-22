import { useEffect, useState } from 'react'
import { useCurrentTemplate, useEditor } from '../document/store'
import { ExportDialog } from './ExportDialog'

const NOTICE_MS = 6000

export function Toolbar() {
  const template = useCurrentTemplate()
  const canUndo = useEditor((s) => s.history.past.length > 0)
  const canRedo = useEditor((s) => s.history.future.length > 0)
  const undo = useEditor((s) => s.undo)
  const redo = useEditor((s) => s.redo)
  const [exportOpen, setExportOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        setExportOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <header className="toolbar">
      <span className="brand">StitchLab</span>
      <div className="toolbar-group">
        <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
          Undo
        </button>
        <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
          Redo
        </button>
      </div>
      {notice && (
        <span className="notice" title={notice}>
          {notice}
        </span>
      )}
      <span className="toolbar-title">{template.name}</span>
      <button className="primary" onClick={() => setExportOpen(true)} title="Export (Ctrl+E)">
        Export
      </button>
      {exportOpen && <ExportDialog onClose={() => setExportOpen(false)} onExported={setNotice} />}
    </header>
  )
}
