import { useEditor } from '../document/store'
import { defaultTemplate } from '../templates'

export function StatusBar() {
  const selectedZoneId = useEditor((s) => s.selectedZoneId)
  const label = defaultTemplate.zones.find((z) => z.id === selectedZoneId)?.label ?? 'Nothing selected'
  const versions = window.stitchlab?.versions

  return (
    <footer className="statusbar">
      <span>{label}</span>
      <span>Drag the background to pan, scroll to zoom</span>
      {versions && <span>Electron {versions.electron}</span>}
    </footer>
  )
}
