import { useEditor } from '../document/store'
import { getGarment } from '../templates'

export function ViewTabs() {
  const garment = useEditor((s) => getGarment(s.doc.templateId))
  const activeViewId = useEditor((s) => s.activeViewId)
  const layers = useEditor((s) => s.doc.layers)
  const setActiveView = useEditor((s) => s.setActiveView)

  if (garment.views.length < 2) return null
  return (
    <div className="view-tabs" role="tablist" aria-label="Garment view">
      {garment.views.map((v) => {
        const count = layers.filter((l) => l.view === v.view).length
        return (
          <button
            key={v.view}
            role="tab"
            aria-selected={v.view === activeViewId}
            className={v.view === activeViewId ? 'selected' : ''}
            onClick={() => setActiveView(v.view)}
            title={count ? `${v.viewLabel}: ${count} layer${count === 1 ? '' : 's'}` : v.viewLabel}
          >
            {v.viewLabel}
            {count > 0 && <span className="view-count">{count}</span>}
          </button>
        )
      })}
    </div>
  )
}
