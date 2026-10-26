import { useEffect, useRef, useState } from 'react'
import 'pixi.js/unsafe-eval'
import { Application } from 'pixi.js'
import { buildScene, type Viewport } from './scene'
import { ViewTabs } from './ViewTabs'

export function EditorCanvas() {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<Viewport | null>(null)
  const [zoom, setZoom] = useState(1)

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
      })

    return () => {
      disposed = true
      destroyScene?.()
      viewportRef.current = null
      if (initialized) app.destroy(true, { children: true })
    }
  }, [])

  return (
    <div className="canvas-host" ref={hostRef}>
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
    </div>
  )
}
