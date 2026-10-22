import { useCurrentTemplate, useEditor } from '../document/store'

export function StatusBar() {
  const template = useCurrentTemplate()
  const selectedZoneId = useEditor((s) => s.selectedZoneId)
  const label = template.zones.find((z) => z.id === selectedZoneId)?.label ?? 'Nothing selected'
  const versions = window.stitchlab?.versions

  return (
    <footer className="statusbar">
      <span>{label}</span>
      <span>Drag the background to pan, scroll to zoom</span>
      {versions && <span>Electron {versions.electron}</span>}
    </footer>
  )
}
