import { CLIP_GARMENT, CLIP_NONE, zoneClip } from '../document/model'
import { useCurrentTemplate, useEditor, useSelectedLayer } from '../document/store'

const FONTS = [
  'Arial',
  'Arial Black',
  'Verdana',
  'Trebuchet MS',
  'Segoe UI',
  'Georgia',
  'Times New Roman',
  'Courier New',
  'Impact'
]

const toDegrees = (rad: number) => Math.round((rad * 180) / Math.PI)
const toRadians = (deg: number) => (deg * Math.PI) / 180

export function PropertiesPanel() {
  const layer = useSelectedLayer()
  const template = useCurrentTemplate()
  const updateLayer = useEditor((s) => s.updateLayer)

  if (!layer) return null
  const update = (patch: Parameters<typeof updateLayer>[1], field: string) =>
    updateLayer(layer.id, patch, `edit:${layer.id}:${field}`)

  return (
    <section className="panel-section properties">
      <h2>{layer.type === 'text' ? 'Text' : 'Image'}</h2>

      {layer.type === 'text' && (
        <>
          <label className="field">
            <span>Content</span>
            <textarea rows={2} value={layer.text} onChange={(e) => update({ text: e.target.value }, 'text')} />
          </label>
          <label className="field">
            <span>Font</span>
            <select value={layer.fontFamily} onChange={(e) => update({ fontFamily: e.target.value }, 'font')}>
              {FONTS.map((font) => (
                <option key={font} value={font} style={{ fontFamily: font }}>
                  {font}
                </option>
              ))}
            </select>
          </label>
          <div className="field-row">
            <label className="field">
              <span>Size</span>
              <input
                type="number"
                min={4}
                max={400}
                value={layer.fontSize}
                onChange={(e) => {
                  const fontSize = Number(e.target.value)
                  if (fontSize >= 4) update({ fontSize }, 'fontSize')
                }}
              />
            </label>
            <label className="field">
              <span>Color</span>
              <input type="color" value={layer.fill} onChange={(e) => update({ fill: e.target.value }, 'fill')} />
            </label>
            <label className="field checkbox">
              <input
                type="checkbox"
                checked={layer.fontWeight === 'bold'}
                onChange={(e) => update({ fontWeight: e.target.checked ? 'bold' : 'normal' }, 'fontWeight')}
              />
              <span>Bold</span>
            </label>
          </div>
        </>
      )}

      <div className="field-row">
        <label className="field">
          <span>Scale %</span>
          <input
            type="number"
            min={2}
            max={5000}
            value={Math.round(layer.scale * 100)}
            onChange={(e) => {
              const percent = Number(e.target.value)
              if (percent >= 2) update({ scale: percent / 100 }, 'scale')
            }}
          />
        </label>
        <label className="field">
          <span>Rotation °</span>
          <input
            type="number"
            min={-360}
            max={360}
            value={toDegrees(layer.rotation)}
            onChange={(e) => update({ rotation: toRadians(Number(e.target.value)) }, 'rotation')}
          />
        </label>
      </div>

      <label className="field">
        <span>Opacity {Math.round(layer.opacity * 100)}%</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(layer.opacity * 100)}
          onChange={(e) => update({ opacity: Number(e.target.value) / 100 }, 'opacity')}
        />
      </label>

      <label className="field">
        <span>Clip to</span>
        <select value={layer.clip} onChange={(e) => update({ clip: e.target.value }, 'clip')}>
          <option value={CLIP_GARMENT}>Whole garment</option>
          {template.zones.map((zone) => (
            <option key={zone.id} value={zoneClip(zone.id)}>
              {zone.label}
            </option>
          ))}
          <option value={CLIP_NONE}>No clipping</option>
        </select>
      </label>
    </section>
  )
}
