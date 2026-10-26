import { useEffect, useMemo, useState } from 'react'
import { resolvedColorways } from '../document/model'
import { useCurrentTemplate, useEditor } from '../document/store'
import { exportDesign, renderLookbook } from '../export'
import { getGarment } from '../templates'

const EXPORT_SCALE = 2

interface Props {
  onClose: () => void
  onExported: (message: string) => void
}

export function LookbookPreview({ onClose, onExported }: Props) {
  const doc = useEditor((s) => s.doc)
  const template = useCurrentTemplate()
  const views = getGarment(doc.templateId).views
  const colorwayCount = doc.colorways.length
  const [allViews, setAllViews] = useState(true)
  const [allColorways, setAllColorways] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const shownViews = useMemo(() => (allViews ? views : [template]), [allViews, views, template])
  const shownColorways = useMemo(() => {
    const colorways = resolvedColorways(doc)
    return allColorways ? colorways : colorways.filter((c) => c.id === doc.activeColorwayId)
  }, [doc, allColorways])

  const src = useMemo(() => {
    const { svg } = renderLookbook(doc, shownViews, shownColorways, '#ffffff')
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  }, [doc, shownViews, shownColorways])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const message = await exportDesign(doc, views, template, {
        format: 'png',
        pngScale: EXPORT_SCALE,
        background: '#ffffff',
        allViews,
        allColorways,
        combine: true
      })
      if (message) onExported(message)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={() => !busy && onClose()}>
      <div className="modal preview-modal" role="dialog" aria-label="Preview" onMouseDown={(e) => e.stopPropagation()}>
        <div className="preview-header">
          <h2>Preview {template.name}</h2>
          {views.length > 1 && (
            <label className="field checkbox">
              <input type="checkbox" checked={allViews} onChange={(e) => setAllViews(e.target.checked)} />
              <span>All views</span>
            </label>
          )}
          {colorwayCount > 1 && (
            <label className="field checkbox">
              <input type="checkbox" checked={allColorways} onChange={(e) => setAllColorways(e.target.checked)} />
              <span>All colorways ({colorwayCount})</span>
            </label>
          )}
        </div>

        <div className="preview-sheet">
          <img src={src} alt={`${template.name} lookbook`} draggable={false} />
        </div>

        {error && <p className="error">{error}</p>}

        <div className="modal-actions">
          <button onClick={onClose} disabled={busy}>
            Close
          </button>
          <button className="primary" onClick={save} disabled={busy}>
            {busy ? 'Saving...' : 'Save as PNG'}
          </button>
        </div>
      </div>
    </div>
  )
}
