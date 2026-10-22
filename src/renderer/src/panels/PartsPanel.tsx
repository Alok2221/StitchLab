import { useEditor } from '../document/store'
import { defaultTemplate } from '../templates'

export function PartsPanel() {
  const zoneColors = useEditor((s) => s.doc.zoneColors)
  const selectedZoneId = useEditor((s) => s.selectedZoneId)
  const selectZone = useEditor((s) => s.selectZone)

  return (
    <aside className="panel panel-left">
      <h2>Parts</h2>
      <ul className="parts-list">
        {[...defaultTemplate.zones].reverse().map((zone) => (
          <li key={zone.id}>
            <button
              className={zone.id === selectedZoneId ? 'part selected' : 'part'}
              onClick={() => selectZone(zone.id)}
            >
              <span className="swatch" style={{ background: zoneColors[zone.id] }} />
              {zone.label}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}
