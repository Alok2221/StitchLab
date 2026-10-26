import { useEffect, useRef, useState } from 'react'
import { useEditor } from '../document/store'
import { getGarment } from '../templates'
import { garmentMesh, viewTexture, withMirroredUnderlay } from './garmentModel'
import type { InflatedMesh } from './inflate'
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  const presets: { id: CameraPreset; label: string }[] = [
    { id: 'front', label: garment.views[0].viewLabel },
    ...(garment.views[1] ? [{ id: 'back' as const, label: garment.views[1].viewLabel }] : []),
    { id: 'side', label: 'Side' },
    { id: 'three-quarter', label: '3/4' }
  ]

  return (
    <div className="preview3d">
      <div className="preview3d-stage" ref={stageRef} />
      {(loading || error) && <div className="preview3d-status">{error ? `3D preview failed: ${error}` : 'Building 3D preview…'}</div>}
      <div className="view-tabs" role="toolbar" aria-label="Camera">
        {presets.map((p) => (
          <button key={p.id} className={p.id === preset ? 'selected' : ''} onClick={() => choose(p.id)}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="preview3d-hint">Drag to orbit, scroll to zoom</div>
    </div>
  )
}
