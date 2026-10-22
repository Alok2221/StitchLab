import { useState } from 'react'
import { useCurrentTemplate, useEditor, useSelectedLayer } from '../document/store'

export function PalettePanel() {
  const template = useCurrentTemplate()
  const palette = useEditor((s) => s.doc.palette)
  const zoneColors = useEditor((s) => s.doc.zoneColors)
  const selectedZoneId = useEditor((s) => s.selectedZoneId)
  const { setZoneColor, addPaletteColor, updateLayer } = useEditor.getState()
  const layer = useSelectedLayer()
  const [newColor, setNewColor] = useState('#4f8cff')

  const textLayer = layer?.type === 'text' ? layer : undefined
  const zone = template.zones.find((z) => z.id === selectedZoneId)
  const target = textLayer ? textLayer.name : zone?.label
  const currentColor = textLayer ? textLayer.fill : selectedZoneId ? zoneColors[selectedZoneId] : undefined

  const apply = (color: string) => {
    if (textLayer) updateLayer(textLayer.id, { fill: color })
    else if (selectedZoneId) setZoneColor(selectedZoneId, color)
  }

  return (
    <section className="panel-section">
      <h2>Palette</h2>
      <p className="hint">{target ? `Click a color to apply it to: ${target}` : 'Select a part or a text layer to color it'}</p>
      <div className="palette">
        {palette.map((color) => (
          <button
            key={color}
            className={color === currentColor ? 'palette-swatch active' : 'palette-swatch'}
            style={{ background: color }}
            title={color}
            disabled={!target}
            onClick={() => apply(color)}
          />
        ))}
      </div>
      <div className="palette-add">
        <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} />
        <button onClick={() => addPaletteColor(newColor)}>Add color</button>
      </div>
    </section>
  )
}
