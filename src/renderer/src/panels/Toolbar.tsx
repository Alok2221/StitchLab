import { useEffect, useState } from 'react'
import { isDirty, useCurrentTemplate, useEditor } from '../document/store'
import { fileStem, newProject, openProject, saveProject } from '../project/actions'
import { notify, useNotice } from '../project/notice'
import { ExportDialog } from './ExportDialog'

const NOTICE_MS = 6000

export function Toolbar() {
  const template = useCurrentTemplate()
  const canUndo = useEditor((s) => s.history.past.length > 0)
  const canRedo = useEditor((s) => s.history.future.length > 0)
  const undo = useEditor((s) => s.undo)
  const redo = useEditor((s) => s.redo)
  const filePath = useEditor((s) => s.filePath)
  const dirty = useEditor(isDirty)
  const notice = useNotice((s) => s.notice)
  const [exportOpen, setExportOpen] = useState(false)

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => useNotice.getState().show(null), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const key = e.key.toLowerCase()
      const actions: Record<string, () => void> = {
        e: () => setExportOpen(true),
        s: () => void saveProject(e.shiftKey),
        o: () => void openProject(),
        n: () => void newProject()
      }
      const action = actions[key]
      if (!action) return
      e.preventDefault()
      action()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <header className="toolbar">
      <span className="brand">StitchLab</span>
      <div className="toolbar-group">
        <button onClick={() => void newProject()} title="New project (Ctrl+N)">
          New
        </button>
        <button onClick={() => void openProject()} title="Open project (Ctrl+O)">
          Open
        </button>
        <button onClick={() => void saveProject()} title="Save (Ctrl+S)">
          Save
        </button>
        <button onClick={() => void saveProject(true)} title="Save as (Ctrl+Shift+S)">
          Save as
        </button>
      </div>
      <div className="toolbar-group">
        <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
          Undo
        </button>
        <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
          Redo
        </button>
      </div>
      {notice && (
        <span className={notice.kind === 'error' ? 'notice error' : 'notice'} title={notice.message}>
          {notice.message}
        </span>
      )}
      <span className="toolbar-title">
        {dirty ? '* ' : ''}
        {fileStem(filePath) ?? 'Untitled'} - {template.name}
      </span>
      <button className="primary" onClick={() => setExportOpen(true)} title="Export (Ctrl+E)">
        Export
      </button>
      {exportOpen && <ExportDialog onClose={() => setExportOpen(false)} onExported={(message) => notify(message)} />}
    </header>
  )
}
