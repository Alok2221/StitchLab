import { useEffect, useState } from 'react'
import { EXPORT_FORMATS, type ExportFormat } from '../../../shared/api'
import { useCurrentTemplate, useEditor } from '../document/store'
import { exportDesign, exportSize } from '../export'

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
  const [format, setFormat] = useState<ExportFormat>('png')
  const [pngScale, setPngScale] = useState(4)
  const [transparent, setTransparent] = useState(true)
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
      const path = await exportDesign(useEditor.getState().doc, template, {
        format,
        pngScale,
        background: transparent && format !== 'pdf' ? null : '#ffffff'
      })
      if (path) {
        onExported(`Exported to ${path}`)
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

        {error && <p className="error">{error}</p>}

        <div className="modal-actions">
          <button onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="primary" onClick={run} disabled={busy}>
            {busy ? 'Exporting...' : `Export ${format.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  )
}
