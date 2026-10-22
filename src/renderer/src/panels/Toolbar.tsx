import { useCurrentTemplate, useEditor } from '../document/store'

export function Toolbar() {
  const template = useCurrentTemplate()
  const canUndo = useEditor((s) => s.history.past.length > 0)
  const canRedo = useEditor((s) => s.history.future.length > 0)
  const undo = useEditor((s) => s.undo)
  const redo = useEditor((s) => s.redo)

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
      <span className="toolbar-title">{template.name}</span>
    </header>
  )
}
