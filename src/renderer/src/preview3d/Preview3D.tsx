import { useEffect, useRef, useState } from 'react'
import { useEditor } from '../document/store'
import { notify } from '../project/notice'
import { getGarment } from '../templates'
import { garmentMesh, viewTexture, withMirroredUnderlay } from './garmentModel'
import type { InflatedMesh } from './inflate'
import { LIGHTING_LABELS, type LightingPreset } from './lighting'
import { DEFAULT_SNAPSHOT_SIDE, SNAPSHOT_SIDES, snapshotFileStem } from './snapshot'
import { createViewer, type CameraPreset, type Viewer } from './viewer'

/** Delay after the last edit before the textures are redrawn. */
const UPDATE_DELAY_MS = 120

const meshes = new Map<string, Promise<InflatedMesh>>()

function cachedMesh(garmentId: string): Promise<InflatedMesh> {
  let mesh = meshes.get(garmentId)
  if (!mesh) {
    mesh = garmentMesh(getGarment(garmentId))
    mesh.catch(() => meshes.delete(garmentId))
    meshes.set(garmentId, mesh)
  }
  return mesh
}

export function Preview3D() {
  const stageRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Viewer | null>(null)
  const garment = useEditor((s) => getGarment(s.doc.templateId))
  const [preset, setPreset] = useState<CameraPreset | null>('front')
  const [lighting, setLighting] = useState<LightingPreset>('studio')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [longSide, setLongSide] = useState(DEFAULT_SNAPSHOT_SIDE)
  const [transparent, setTransparent] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const viewer = createViewer(stage, { onOrbit: () => setPreset(null) })
    viewerRef.current = viewer

    let disposed = false
    let generation = 0
    let shownGarment: string | null = null
    let timer: ReturnType<typeof setTimeout> | undefined

    const update = async () => {
      const current = ++generation
      const { doc } = useEditor.getState()
      const views = getGarment(doc.templateId).views
      try {
        const [mesh, front, back] = await Promise.all([
          shownGarment === doc.templateId ? null : cachedMesh(doc.templateId),
          viewTexture(doc, views[0]),
          viewTexture(doc, views[1] ?? views[0])
        ])
        if (disposed || current !== generation) return
        if (mesh) {
          viewer.setMesh(mesh)
          shownGarment = doc.templateId
          setPreset('front')
        }
        viewer.setTextures(withMirroredUnderlay(front, back), withMirroredUnderlay(back, front))
        setLoading(false)
        setError(null)
      } catch (e) {
        if (!disposed && current === generation) setError(e instanceof Error ? e.message : String(e))
      }
    }

    void update()
    const unsubscribe = useEditor.subscribe((s, prev) => {
      if (s.doc === prev.doc) return
      clearTimeout(timer)
      timer = setTimeout(() => void update(), UPDATE_DELAY_MS)
    })

    return () => {
      disposed = true
      clearTimeout(timer)
      unsubscribe()
      viewer.dispose()
      viewerRef.current = null
    }
  }, [])

  const choose = (next: CameraPreset) => {
    setPreset(next)
    viewerRef.current?.setPreset(next)
  }

  const chooseLighting = (next: LightingPreset) => {
    setLighting(next)
    viewerRef.current?.setLighting(next)
  }

  const savePng = async () => {
    const viewer = viewerRef.current
    const api = window.stitchlab
    if (!viewer || !api || loading || saving) return
    setSaving(true)
    try {
      const data = viewer.capturePng({ longSide, transparent })
      const path = await api.saveFile({ format: 'png', defaultName: snapshotFileStem(garment.id, preset), data })
      if (path) notify(`Exported to ${path}`)
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  const presets: { id: CameraPreset; label: string }[] = [
    { id: 'front', label: garment.views[0].viewLabel },
    ...(garment.views[1] ? [{ id: 'back' as const, label: garment.views[1].viewLabel }] : []),
    { id: 'side', label: 'Side' },
    { id: 'three-quarter', label: '3/4' }
  ]

  return (
    <div className="preview3d">
      <div className="preview3d-stage" ref={stageRef} title="Drag to orbit, scroll to zoom" />
      {(loading || error) && <div className="preview3d-status">{error ? `3D preview failed: ${error}` : 'Building 3D preview…'}</div>}
      <div className="view-tabs preview3d-lighting" role="toolbar" aria-label="Lighting">
        {(Object.keys(LIGHTING_LABELS) as LightingPreset[]).map((id) => (
          <button key={id} className={id === lighting ? 'selected' : ''} onClick={() => chooseLighting(id)}>
            {LIGHTING_LABELS[id]}
          </button>
        ))}
      </div>
      <div className="view-tabs" role="toolbar" aria-label="Camera">
        {presets.map((p) => (
          <button key={p.id} className={p.id === preset ? 'selected' : ''} onClick={() => choose(p.id)}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="preview3d-export">
        <label className="field checkbox" title="Save without the studio backdrop">
          <input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} />
          <span>Transparent</span>
        </label>
        <select
          value={longSide}
          onChange={(e) => setLongSide(Number(e.target.value))}
          title="Longer edge of the PNG"
          aria-label="PNG size"
        >
          {SNAPSHOT_SIDES.map((side) => (
            <option key={side} value={side}>
              {side} px
            </option>
          ))}
        </select>
        <button className="primary" onClick={() => void savePng()} disabled={loading || saving} title="Save a PNG of this camera">
          {saving ? 'Saving…' : 'Save PNG'}
        </button>
      </div>
    </div>
  )
}
