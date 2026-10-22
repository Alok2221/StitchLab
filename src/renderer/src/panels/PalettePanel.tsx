import { useState } from 'react'
import { useEditor } from '../document/store'
import { defaultTemplate } from '../templates'

export function PalettePanel() {
  const palette = useEditor((s) => s.doc.palette)
  const selectedZoneId = useEditor((s) => s.selectedZoneId)
  const currentColor = useEditor((s) => (s.selectedZoneId ? s.doc.zoneColors[s.selectedZoneId] : undefined))
  const setZoneColor = useEditor((s) => s.setZoneColor)
  const addPaletteColor = useEditor((s) => s.addPaletteColor)
  const [newColor, setNewColor] = useState('#4f8cff')

  const selectedLabel = defaultTemplate.zones.find((z) => z.id === selectedZoneId)?.label

  return (
    <aside className="panel panel-right">
      <h2>Palette</h2>
      <p className="hint">{selectedLabel ? `Click a color to apply it to: ${selectedLabel}` : 'Select a part to color it'}</p>
      <div className="palette">
        {palette.map((color) => (
          <button
            key={color}
            className={color === currentColor ? 'palette-swatch active' : 'palette-swatch'}
            style={{ background: color }}
            title={color}
            disabled={!selectedZoneId}
            onClick={() => selectedZoneId && setZoneColor(selectedZoneId, color)}
          />
        ))}
      </div>
      <div className="palette-add">
        <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} />
        <button onClick={() => addPaletteColor(newColor)}>Add color</button>
      </div>
    </aside>
  )
}
