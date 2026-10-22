import { useEffect, useRef, useState, type RefObject } from 'react'
import 'pixi.js/unsafe-eval'
import { Application, Container, Graphics, GraphicsPath, type FederatedPointerEvent } from 'pixi.js'
import { useEditor } from '../document/store'
import { getTemplate } from '../templates'

const MIN_ZOOM = 0.1
const MAX_ZOOM = 8
const FIT_PADDING = 48
const OUTLINE_COLOR = 0x2b2b30
const SELECTED_COLOR = 0x4f8cff
const CLICK_TOLERANCE = 3

interface Viewport {
  zoomBy: (factor: number) => void
  fit: () => void
}

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
    const cleanups: (() => void)[] = []

    void app
      .init({ resizeTo: host, background: '#2a2b31', antialias: true, autoDensity: true, resolution: devicePixelRatio })
      .then(() => {
        initialized = true
        if (disposed) {
          app.destroy(true, { children: true })
          return
        }
        host.appendChild(app.canvas)
        cleanups.push(buildScene(app, setZoom, viewportRef))
      })

    return () => {
      disposed = true
      cleanups.forEach((fn) => fn())
      if (initialized) app.destroy(true, { children: true })
    }
  }, [])

  return (
    <div className="canvas-host" ref={hostRef}>
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

function buildScene(
  app: Application,
  onZoom: (zoom: number) => void,
  viewportRef: RefObject<Viewport | null>
): () => void {
  const world = new Container()
  app.stage.addChild(world)

  let template = getTemplate(useEditor.getState().doc.templateId)
  const zoneGraphics = new Map<string, Graphics>()
  const selection = new Graphics()
  selection.eventMode = 'none'

  const mountTemplate = () => {
    for (const child of world.removeChildren()) {
      if (child !== selection) child.destroy()
    }
    zoneGraphics.clear()

    for (const zone of template.zones) {
      const g = new Graphics()
      g.eventMode = 'static'
      g.cursor = 'pointer'
      g.on('pointertap', (e: FederatedPointerEvent) => {
        e.stopPropagation()
        useEditor.getState().selectZone(zone.id)
      })
      world.addChild(g)
      zoneGraphics.set(zone.id, g)
    }

    if (template.printArea) {
      const { x, y, width, height } = template.printArea
      const printArea = new Graphics()
        .rect(x, y, width, height)
        .stroke({ width: 1, color: SELECTED_COLOR, alpha: 0.45 })
      printArea.eventMode = 'none'
      world.addChild(printArea)
    }

    world.addChild(selection)
  }

  const draw = () => {
    const { doc, selectedZoneId } = useEditor.getState()
    for (const zone of template.zones) {
      zoneGraphics
        .get(zone.id)!
        .clear()
        .path(new GraphicsPath(zone.path))
        .fill(doc.zoneColors[zone.id] ?? zone.defaultColor)
        .stroke({ width: 1.5, color: OUTLINE_COLOR })
    }
    selection.clear()
    const selected = template.zones.find((z) => z.id === selectedZoneId)
    if (selected) selection.path(new GraphicsPath(selected.path)).stroke({ width: 3, color: SELECTED_COLOR })
  }

  const setScale = (scale: number, anchorX: number, anchorY: number) => {
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale))
    const localX = (anchorX - world.x) / world.scale.x
    const localY = (anchorY - world.y) / world.scale.y
    world.scale.set(next)
    world.position.set(anchorX - localX * next, anchorY - localY * next)
    onZoom(next)
  }

  const fit = () => {
    const { x, y, width, height } = template.viewBox
    const scale = Math.min(
      (app.screen.width - FIT_PADDING * 2) / width,
      (app.screen.height - FIT_PADDING * 2) / height
    )
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale))
    world.scale.set(next)
    world.position.set(
      (app.screen.width - width * next) / 2 - x * next,
      (app.screen.height - height * next) / 2 - y * next
    )
    onZoom(next)
  }

  viewportRef.current = {
    zoomBy: (factor) => setScale(world.scale.x * factor, app.screen.width / 2, app.screen.height / 2),
    fit
  }

  mountTemplate()
  draw()
  fit()

  const unsubscribe = useEditor.subscribe((s, prev) => {
    if (s.doc.templateId !== prev.doc.templateId) {
      template = getTemplate(s.doc.templateId)
      mountTemplate()
      draw()
      fit()
    } else if (s.doc.zoneColors !== prev.doc.zoneColors || s.selectedZoneId !== prev.selectedZoneId) {
      draw()
    }
  })

  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    const rect = app.canvas.getBoundingClientRect()
    setScale(world.scale.x * Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top)
  }
  app.canvas.addEventListener('wheel', onWheel, { passive: false })

  app.stage.eventMode = 'static'
  app.stage.hitArea = app.screen
  let drag: { startX: number; startY: number; worldX: number; worldY: number } | null = null

  app.stage.on('pointerdown', (e: FederatedPointerEvent) => {
    if (e.target !== app.stage && e.button !== 1) return
    drag = { startX: e.global.x, startY: e.global.y, worldX: world.x, worldY: world.y }
    app.canvas.style.cursor = 'grabbing'
  })
  app.stage.on('globalpointermove', (e: FederatedPointerEvent) => {
    if (!drag) return
    world.position.set(drag.worldX + e.global.x - drag.startX, drag.worldY + e.global.y - drag.startY)
  })
  const endDrag = (e: FederatedPointerEvent) => {
    if (!drag) return
    const moved = Math.hypot(e.global.x - drag.startX, e.global.y - drag.startY)
    if (moved < CLICK_TOLERANCE && e.button === 0) useEditor.getState().selectZone(null)
    drag = null
    app.canvas.style.cursor = ''
  }
  app.stage.on('pointerup', endDrag)
  app.stage.on('pointerupoutside', endDrag)

  return () => {
    unsubscribe()
    app.canvas.removeEventListener('wheel', onWheel)
    viewportRef.current = null
  }
}
