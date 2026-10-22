import { useCurrentTemplate, useEditor } from '../document/store'

export function PartsPanel() {
  const template = useCurrentTemplate()
  const zoneColors = useEditor((s) => s.doc.zoneColors)
  const selectedZoneId = useEditor((s) => s.selectedZoneId)
  const selectZone = useEditor((s) => s.selectZone)

  return (
    <section className="panel-section">
      <h2>Parts</h2>
      <ul className="parts-list">
        {[...template.zones].reverse().map((zone) => (
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
    </section>
  )
}
