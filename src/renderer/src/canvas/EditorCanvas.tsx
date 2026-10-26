import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import 'pixi.js/unsafe-eval'
import { Application } from 'pixi.js'
import { buildScene, type Viewport } from './scene'
import { ViewTabs } from './ViewTabs'

const Preview3D = lazy(() => import('../preview3d/Preview3D').then((m) => ({ default: m.Preview3D })))

type CanvasMode = '2d' | '3d'

export function EditorCanvas() {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<Viewport | null>(null)
  const appRef = useRef<Application | null>(null)
  const [zoom, setZoom] = useState(1)
  const [mode, setMode] = useState<CanvasMode>('2d')

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const app = new Application()
    let initialized = false
    let disposed = false
    let destroyScene: (() => void) | null = null

    void app
      .init({ resizeTo: host, background: '#2a2b31', antialias: true, autoDensity: true, resolution: devicePixelRatio })
      .then(() => {
        initialized = true
        if (disposed) {
          app.destroy(true, { children: true })
          return
        }
        host.appendChild(app.canvas)
        const scene = buildScene(app, setZoom)
        viewportRef.current = scene.viewport
        destroyScene = scene.destroy
        appRef.current = app
      })

    return () => {
      disposed = true
      destroyScene?.()
      viewportRef.current = null
      appRef.current = null
      if (initialized) app.destroy(true, { children: true })
    }
  }, [])

  useEffect(() => {
    const ticker = appRef.current?.ticker
    if (mode === '3d') ticker?.stop()
    else ticker?.start()
  }, [mode])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '3') {
        e.preventDefault()
        setMode((m) => (m === '3d' ? '2d' : '3d'))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="canvas-host" ref={hostRef}>
      <div className="mode-toggle" role="tablist" aria-label="Canvas mode">
        {(['2d', '3d'] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={m === mode}
            className={m === mode ? 'selected' : ''}
            onClick={() => setMode(m)}
            title={m === '2d' ? 'Edit the design (Ctrl+3 toggles)' : 'Preview the design in 3D (Ctrl+3 toggles)'}
          >
            {m.toUpperCase()}
          </button>
        ))}
      </div>
      {mode === '3d' ? (
        <Suspense fallback={<div className="preview3d preview3d-status">Loading 3D preview…</div>}>
          <Preview3D />
        </Suspense>
      ) : (
        <>
          <ViewTabs />
          <div className="zoom-controls">
            <button onClick={() => viewportRef.current?.zoomBy(1 / 1.2)} title="Zoom out">
              −
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button onClick={() => viewportRef.current?.zoomBy(1.2)} title="Zoom in">
              +
            </button>
            <button onClick={() => viewportRef.current?.fit()} title="Fit to view">
              Fit
            </button>
          </div>
        </>
      )}
    </div>
  )
}
