import { useEffect, useState } from 'react'
import { EXPORT_FORMATS, type ExportFormat } from '../../../shared/api'
import { useCurrentTemplate, useEditor } from '../document/store'
import { exportDesign, exportSize } from '../export'
import { getGarment } from '../templates'

const PNG_SCALES = [1, 2, 4, 8]

const FORMAT_HINTS: Record<ExportFormat, string> = {
  png: 'Raster image for shops, social media and mockups.',
  svg: 'Editable vector file for Illustrator, Inkscape or Figma.',
  pdf: 'A4 sheet with the design, part colors and a layer list for the manufacturer.'
}

interface Props {
  onClose: () => void
  onExported: (message: string) => void
}

export function ExportDialog({ onClose, onExported }: Props) {
  const template = useCurrentTemplate()
  const views = useEditor((s) => getGarment(s.doc.templateId).views)
  const [format, setFormat] = useState<ExportFormat>('png')
  const [pngScale, setPngScale] = useState(4)
  const [transparent, setTransparent] = useState(true)
  const colorwayCount = useEditor((s) => s.doc.colorways.length)
  const activeName = useEditor((s) => s.doc.colorways.find((c) => c.id === s.doc.activeColorwayId)?.name)
  const [allColorways, setAllColorways] = useState(colorwayCount > 1)
  const exportAll = allColorways && colorwayCount > 1
  const [allViews, setAllViews] = useState(views.length > 1)
  const exportViews = allViews && views.length > 1
  const fileCount = (exportAll ? colorwayCount : 1) * (exportViews ? views.length : 1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      const message = await exportDesign(useEditor.getState().doc, views, template, {
        format,
        pngScale,
        background: transparent && format !== 'pdf' ? null : '#ffffff',
        allColorways: exportAll,
        allViews: exportViews
      })
      if (message) {
        onExported(message)
        onClose()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={() => !busy && onClose()}>
      <div className="modal" role="dialog" aria-label="Export design" onMouseDown={(e) => e.stopPropagation()}>
        <h2>Export {template.name}</h2>

        <div className="format-tabs">
          {(Object.keys(EXPORT_FORMATS) as ExportFormat[]).map((f) => (
            <button key={f} className={f === format ? 'selected' : ''} onClick={() => setFormat(f)}>
              {f.toUpperCase()}
            </button>
          ))}
        </div>
        <p className="hint">{FORMAT_HINTS[format]}</p>

        {format === 'png' && (
          <label className="field">
            <span>Resolution</span>
            <select value={pngScale} onChange={(e) => setPngScale(Number(e.target.value))}>
              {PNG_SCALES.map((scale) => {
                const { width, height } = exportSize(template, scale)
                return (
                  <option key={scale} value={scale}>
                    {scale}x - {width} x {height} px
                  </option>
                )
              })}
            </select>
          </label>
        )}

        {format !== 'pdf' && (
          <label className="field checkbox">
            <input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} />
            <span>Transparent background</span>
          </label>
        )}

        {views.length > 1 && (
          <label className="field checkbox">
            <input type="checkbox" checked={allViews} onChange={(e) => setAllViews(e.target.checked)} />
            <span>All views ({views.map((v) => v.viewLabel).join(', ')})</span>
          </label>
        )}

        {colorwayCount > 1 && (
          <label className="field checkbox">
            <input type="checkbox" checked={allColorways} onChange={(e) => setAllColorways(e.target.checked)} />
            <span>All colorways ({colorwayCount})</span>
          </label>
        )}

        {(views.length > 1 || colorwayCount > 1) && (
          <p className="hint">
            {exportViews ? 'Every view' : `Only the ${template.viewLabel.toLowerCase()}`}
            {colorwayCount > 1 && (exportAll ? ', every colorway' : `, colorway ${activeName}`)}.{' '}
            {format === 'pdf'
              ? exportAll
                ? 'One PDF with an overview page and a spec sheet per colorway.'
                : 'One PDF spec sheet.'
              : fileCount > 1
                ? `${fileCount} ${format.toUpperCase()} files, saved into a folder you choose.`
                : `One ${format.toUpperCase()} file.`}
          </p>
        )}

        {error && <p className="error">{error}</p>}

        <div className="modal-actions">
          <button onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="primary" onClick={run} disabled={busy}>
            {busy
              ? 'Exporting...'
              : format !== 'pdf' && fileCount > 1
                ? `Export ${fileCount} files`
                : `Export ${format.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  )
}
