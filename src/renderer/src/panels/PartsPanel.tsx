import type { CSSProperties } from 'react'
import type { ZonePattern } from '../document/model'
import { tileSvg } from '../document/patterns'
import { useCurrentTemplate, useEditor } from '../document/store'

const SWATCH_TILE_PX = 8

function swatchStyle(color: string, pattern: ZonePattern | undefined): CSSProperties {
  if (!pattern) return { background: color }
  const { svg } = tileSvg(pattern, color, 1)
  return {
    backgroundColor: color,
    backgroundImage: `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`,
    backgroundSize: pattern.kind === 'image' ? 'cover' : `${SWATCH_TILE_PX}px ${SWATCH_TILE_PX}px`
  }
}

export function PartsPanel() {
  const template = useCurrentTemplate()
  const zoneColors = useEditor((s) => s.doc.zoneColors)
  const zonePatterns = useEditor((s) => s.doc.zonePatterns)
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
              <span className="swatch" style={swatchStyle(zoneColors[zone.id], zonePatterns[zone.id])} />
              {zone.label}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
