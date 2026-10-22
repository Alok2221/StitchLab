import { useCurrentTemplate, useEditor, useSelectedLayer } from '../document/store'

export function StatusBar() {
  const template = useCurrentTemplate()
  const selectedZoneId = useEditor((s) => s.selectedZoneId)
  const layer = useSelectedLayer()
  const label = layer?.name ?? template.zones.find((z) => z.id === selectedZoneId)?.label ?? 'Nothing selected'
  const versions = window.stitchlab?.versions

  return (
    <footer className="statusbar">
      <span>{label}</span>
      <span>
        {layer
          ? 'Drag to move, corners to scale, top knob to rotate (Shift snaps), arrows nudge, Delete removes'
          : 'Drag the background to pan, scroll to zoom'}
      </span>
      {versions && <span>Electron {versions.electron}</span>}
    </footer>
  )
}
