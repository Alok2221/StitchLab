import { useMemo, useState } from 'react'
import { useCurrentTemplate, useEditor } from '../document/store'
import { templateThumbnail } from '../templates'

export function ColorwaysPanel() {
  const template = useCurrentTemplate()
  const colorways = useEditor((s) => s.doc.colorways)
  const activeId = useEditor((s) => s.doc.activeColorwayId)
  const liveColors = useEditor((s) => s.doc.zoneColors)
  const { addColorway, switchColorway, renameColorway, removeColorway } = useEditor.getState()
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)

  const thumbnails = useMemo(
    () =>
      new Map(
        colorways.map((c) => [c.id, templateThumbnail(template, c.id === activeId ? liveColors : c.zoneColors)])
      ),
    [colorways, activeId, liveColors, template]
  )

  const finishRename = () => {
    if (renaming) renameColorway(renaming.id, renaming.name)
    setRenaming(null)
  }

  return (
    <section className="panel-section">
      <div className="section-header">
        <h2>Colorways</h2>
        <div className="section-actions">
          <button onClick={addColorway} title="Duplicate the active colorway">
            + Duplicate
          </button>
        </div>
      </div>

      <div className="colorway-grid">
        {colorways.map((c) => (
          <div key={c.id} className={c.id === activeId ? 'colorway-card selected' : 'colorway-card'}>
            <button
              className="colorway-swatch"
              onClick={() => switchColorway(c.id)}
              onDoubleClick={() => setRenaming({ id: c.id, name: c.name })}
              title={`${c.name} (double-click to rename)`}
            >
              <img src={thumbnails.get(c.id)} alt="" draggable={false} />
            </button>
            {renaming?.id === c.id ? (
              <input
                className="colorway-name-input"
                value={renaming.name}
                autoFocus
                maxLength={60}
                onChange={(e) => setRenaming({ id: c.id, name: e.target.value })}
                onBlur={finishRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') finishRename()
                  if (e.key === 'Escape') setRenaming(null)
                }}
              />
            ) : (
              <span className="colorway-name">{c.name}</span>
            )}
          </div>
        ))}
      </div>

      <div className="layer-actions">
        <button onClick={() => setRenaming({ id: activeId, name: colorways.find((c) => c.id === activeId)?.name ?? '' })}>
          Rename
        </button>
        <button className="danger" onClick={() => removeColorway(activeId)} disabled={colorways.length < 2}>
          Delete
        </button>
      </div>
    </section>
  )
}
