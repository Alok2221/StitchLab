import {
  Application,
  Container,
  Graphics,
  GraphicsPath,
  Matrix,
  Point,
  Sprite,
  Text,
  Texture,
  type FederatedPointerEvent
} from 'pixi.js'
import { useEditor } from '../document/store'
import { CLIP_GARMENT, CLIP_NONE, zoneClip, type Layer, type ZonePattern } from '../document/model'
import { tileSvg } from '../document/patterns'
import { getTemplate, type GarmentTemplate } from '../templates'

const MIN_ZOOM = 0.1
const MAX_ZOOM = 8
const FIT_PADDING = 48
const OUTLINE_COLOR = 0x2b2b30
const SELECTED_COLOR = 0x4f8cff
const CLICK_TOLERANCE = 3
const HANDLE_SIZE = 10
const ROTATE_HANDLE_OFFSET = 28
const ROTATION_SNAP = Math.PI / 12
const MIN_LAYER_SCALE = 0.02
const MAX_LAYER_SCALE = 50
const TEXT_RESOLUTION = 3

export interface Viewport {
  zoomBy: (factor: number) => void
  fit: () => void
}

interface LayerView {
  container: Container
  display: Text | Sprite
  mask: Graphics
  maskKey: string
  contentKey: string
}

type Gesture =
  | { kind: 'pan'; start: Point; worldX: number; worldY: number }
  | { kind: 'move'; layerId: string; mergeKey: string; start: Point; x: number; y: number }
  | { kind: 'scale'; layerId: string; mergeKey: string; center: Point; startDistance: number; scale: number }
  | { kind: 'rotate'; layerId: string; mergeKey: string; center: Point; startAngle: number; rotation: number }

/** Pixels per template unit in pattern tile textures. */
const PATTERN_RESOLUTION = 4

const textures = new Map<string, Promise<Texture>>()
const patternTextures = new Map<string, Texture>()
const pendingPatterns = new Set<string>()

/** Scale and angle are applied through the fill matrix, so they are not part of the texture key. */
function patternKey(pattern: ZonePattern, base: string): string {
  if (pattern.kind !== 'image') return `${pattern.kind}|${pattern.color}|${base}`
  return `image|${base}|${pattern.width}x${pattern.height}|${pattern.src.length}|${pattern.src.slice(-64)}`
}

function loadPatternTexture(key: string, pattern: ZonePattern, base: string): Promise<void> {
  pendingPatterns.add(key)
  const { svg } = tileSvg(pattern, base, PATTERN_RESOLUTION)
  const img = new Image()
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  return img
    .decode()
    .then(() => {
      patternTextures.set(key, Texture.from(img))
    })
    .finally(() => pendingPatterns.delete(key))
}

function patternMatrix(pattern: ZonePattern): Matrix {
  const scale = pattern.scale / PATTERN_RESOLUTION
  return new Matrix().scale(scale, scale).rotate((pattern.angle * Math.PI) / 180)
}

function loadTexture(src: string): Promise<Texture> {
  let texture = textures.get(src)
  if (!texture) {
    const img = new Image()
    img.src = src
    texture = img.decode().then(() => Texture.from(img))
    textures.set(src, texture)
  }
  return texture
}

function clipZones(template: GarmentTemplate, clip: string) {
  if (clip === CLIP_GARMENT) return template.zones
  const zones = template.zones.filter((z) => zoneClip(z.id) === clip)
  return zones.length > 0 ? zones : template.zones
}

export function buildScene(app: Application, onZoom: (zoom: number) => void): { viewport: Viewport; destroy: () => void } {
  const world = new Container()
  const zonesRoot = new Container()
  const layersRoot = new Container()
  const masksRoot = new Container()
  const printArea = new Graphics()
  const zoneSelection = new Graphics()
  printArea.eventMode = 'none'
  zoneSelection.eventMode = 'none'
  masksRoot.eventMode = 'none'
  world.addChild(zonesRoot, layersRoot, masksRoot, printArea, zoneSelection)

  const overlay = new Container()
  const frame = new Graphics()
  frame.eventMode = 'none'
  const rotateLine = new Graphics()
  rotateLine.eventMode = 'none'
  overlay.addChild(frame, rotateLine)
  app.stage.addChild(world, overlay)

  let template = getTemplate(useEditor.getState().doc.templateId, useEditor.getState().activeViewId)
  const zoneGraphics = new Map<string, Graphics>()
  const views = new Map<string, LayerView>()
  let gesture: Gesture | null = null
  let gestureCount = 0
  let destroyed = false

  // --- garment --------------------------------------------------------------

  const mountTemplate = () => {
    for (const child of zonesRoot.removeChildren()) child.destroy()
    zoneGraphics.clear()

    for (const zone of template.zones) {
      const g = new Graphics()
      g.eventMode = 'static'
      g.cursor = 'pointer'
      g.on('pointertap', (e: FederatedPointerEvent) => {
        e.stopPropagation()
        useEditor.getState().selectZone(zone.id)
      })
      zonesRoot.addChild(g)
      zoneGraphics.set(zone.id, g)
    }

    printArea.clear()
    if (template.printArea) {
      const { x, y, width, height } = template.printArea
      printArea.rect(x, y, width, height).stroke({ width: 1, color: SELECTED_COLOR, alpha: 0.45 })
    }
  }

  const drawZones = () => {
    const { doc, selectedZoneId } = useEditor.getState()
    for (const zone of template.zones) {
      const color = doc.zoneColors[zone.id] ?? zone.defaultColor
      const pattern = doc.zonePatterns[zone.id]
      const g = zoneGraphics.get(zone.id)!.clear().path(new GraphicsPath(zone.path))
      const key = pattern && patternKey(pattern, color)
      const texture = key && patternTextures.get(key)
      if (pattern && texture) {
        g.fill({ texture, matrix: patternMatrix(pattern), textureSpace: 'global' })
      } else {
        g.fill(color)
        if (pattern && key && !pendingPatterns.has(key)) {
          loadPatternTexture(key, pattern, color)
            .then(() => {
              if (!destroyed) drawZones()
            })
            .catch((error: unknown) => console.error('Could not render pattern', error))
        }
      }
      g.stroke({ width: 1.5, color: OUTLINE_COLOR })
    }
    zoneSelection.clear()
    const selected = template.zones.find((z) => z.id === selectedZoneId)
    if (selected) zoneSelection.path(new GraphicsPath(selected.path)).stroke({ width: 3, color: SELECTED_COLOR })
  }

  // --- layers ---------------------------------------------------------------

  const createView = (layer: Layer): LayerView => {
    const display =
      layer.type === 'text'
        ? new Text({ text: '', style: { align: 'center' }, resolution: TEXT_RESOLUTION })
        : new Sprite(Texture.EMPTY)
    display.anchor.set(0.5)
    display.eventMode = 'static'
    display.cursor = 'move'
    display.on('pointerdown', (e: FederatedPointerEvent) => onLayerPointerDown(e, layer.id))

    const container = new Container()
    container.addChild(display)
    const mask = new Graphics()
    masksRoot.addChild(mask)

    const view: LayerView = { container, display, mask, maskKey: '', contentKey: '' }
    views.set(layer.id, view)
    return view
  }

  const updateView = (view: LayerView, layer: Layer) => {
    const { container, display } = view
    container.position.set(layer.x, layer.y)
    container.rotation = layer.rotation
    container.scale.set(layer.scale)
    container.alpha = layer.opacity
    container.visible = layer.visible
    display.eventMode = layer.locked ? 'none' : 'static'

    if (layer.type === 'text' && display instanceof Text) {
      const key = [layer.text, layer.fontFamily, layer.fontSize, layer.fontWeight, layer.fill].join('|')
      if (key !== view.contentKey) {
        view.contentKey = key
        display.text = layer.text
        display.style.fontFamily = layer.fontFamily
        display.style.fontSize = layer.fontSize
        display.style.fontWeight = layer.fontWeight
        display.style.fill = layer.fill
      }
    } else if (layer.type === 'image' && display instanceof Sprite) {
      if (layer.src !== view.contentKey) {
        view.contentKey = layer.src
        void loadTexture(layer.src).then((texture) => {
          if (display.destroyed || view.contentKey !== layer.src) return
          display.texture = texture
          display.setSize(layer.width, layer.height)
        })
      }
      if (display.texture !== Texture.EMPTY) display.setSize(layer.width, layer.height)
    }

    const maskKey = `${template.id}|${template.view}|${layer.clip}`
    if (maskKey !== view.maskKey) {
      view.maskKey = maskKey
      view.mask.clear()
      if (layer.clip === CLIP_NONE) {
        container.mask = null
      } else {
        for (const zone of clipZones(template, layer.clip)) {
          view.mask.path(new GraphicsPath(zone.path)).fill(0xffffff)
        }
        container.mask = view.mask
      }
    }
  }

  const syncLayers = () => {
    const { layers } = useEditor.getState().doc
    const alive = new Set<string>()
    layersRoot.removeChildren()
    for (const layer of layers) {
      if (layer.view !== template.view) continue
      alive.add(layer.id)
      const view = views.get(layer.id) ?? createView(layer)
      updateView(view, layer)
      layersRoot.addChild(view.container)
    }
    for (const [id, view] of views) {
      if (alive.has(id)) continue
      view.container.destroy({ children: true })
      view.mask.destroy()
      views.delete(id)
    }
  }

  // --- selection overlay (screen space) -------------------------------------

  const makeHandle = (cursor: string, onDown: (e: FederatedPointerEvent) => void) => {
    const g = new Graphics()
      .rect(-HANDLE_SIZE / 2, -HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE)
      .fill(0xffffff)
      .stroke({ width: 1.5, color: SELECTED_COLOR })
    g.eventMode = 'static'
    g.cursor = cursor
    g.on('pointerdown', (e: FederatedPointerEvent) => {
      e.stopPropagation()
      onDown(e)
    })
    overlay.addChild(g)
    return g
  }

  const selectedView = () => {
    const { doc, selectedLayerId } = useEditor.getState()
    const layer = doc.layers.find((l) => l.id === selectedLayerId)
    const view = layer && views.get(layer.id)
    return layer && view ? { layer, view } : null
  }

  const startScale = (e: FederatedPointerEvent) => {
    const sel = selectedView()
    if (!sel) return
    const center = sel.view.container.toGlobal(new Point(0, 0))
    gesture = {
      kind: 'scale',
      layerId: sel.layer.id,
      mergeKey: `gesture-${++gestureCount}`,
      center,
      startDistance: Math.max(1, Math.hypot(e.global.x - center.x, e.global.y - center.y)),
      scale: sel.layer.scale
    }
  }

  const cornerHandles = ['nwse-resize', 'nesw-resize', 'nwse-resize', 'nesw-resize'].map((cursor) =>
    makeHandle(cursor, startScale)
  )
  const rotateHandle = makeHandle('grab', (e) => {
    const sel = selectedView()
    if (!sel) return
    const center = sel.view.container.toGlobal(new Point(0, 0))
    gesture = {
      kind: 'rotate',
      layerId: sel.layer.id,
      mergeKey: `gesture-${++gestureCount}`,
      center,
      startAngle: Math.atan2(e.global.y - center.y, e.global.x - center.x),
      rotation: sel.layer.rotation
    }
  })

  const localSize = (layer: Layer, view: LayerView) =>
    layer.type === 'image'
      ? { w: layer.width, h: layer.height }
      : { w: view.display.width, h: view.display.height }

  const updateOverlay = () => {
    const sel = selectedView()
    if (!sel || !sel.layer.visible) {
      overlay.visible = false
      return
    }
    overlay.visible = true
    const { w, h } = localSize(sel.layer, sel.view)
    const corners = [
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
      [w / 2, h / 2],
      [-w / 2, h / 2]
    ].map(([x, y]) => sel.view.container.toGlobal(new Point(x, y)))

    frame
      .clear()
      .poly(corners.flatMap((p) => [p.x, p.y]))
      .stroke({ width: 1.5, color: SELECTED_COLOR })

    const editable = !sel.layer.locked
    corners.forEach((p, i) => {
      cornerHandles[i].position.copyFrom(p)
      cornerHandles[i].visible = editable
    })

    const center = sel.view.container.toGlobal(new Point(0, 0))
    const top = new Point((corners[0].x + corners[1].x) / 2, (corners[0].y + corners[1].y) / 2)
    const dx = top.x - center.x
    const dy = top.y - center.y
    const length = Math.hypot(dx, dy) || 1
    const knob = new Point(top.x + (dx / length) * ROTATE_HANDLE_OFFSET, top.y + (dy / length) * ROTATE_HANDLE_OFFSET)
    rotateHandle.position.copyFrom(knob)
    rotateHandle.visible = editable
    rotateLine.clear()
    if (editable) rotateLine.moveTo(top.x, top.y).lineTo(knob.x, knob.y).stroke({ width: 1.5, color: SELECTED_COLOR })
  }
  app.ticker.add(updateOverlay)

  // --- viewport -------------------------------------------------------------

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

  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    const rect = app.canvas.getBoundingClientRect()
    setScale(world.scale.x * Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top)
  }
  app.canvas.addEventListener('wheel', onWheel, { passive: false })

  // --- pointer gestures -----------------------------------------------------

  function onLayerPointerDown(e: FederatedPointerEvent, layerId: string) {
    if (e.button !== 0) return
    e.stopPropagation()
    const editor = useEditor.getState()
    editor.selectLayer(layerId)
    const layer = editor.doc.layers.find((l) => l.id === layerId)
    if (!layer || layer.locked) return
    gesture = {
      kind: 'move',
      layerId,
      mergeKey: `gesture-${++gestureCount}`,
      start: e.global.clone(),
      x: layer.x,
      y: layer.y
    }
  }

  app.stage.eventMode = 'static'
  app.stage.hitArea = app.screen

  app.stage.on('pointerdown', (e: FederatedPointerEvent) => {
    if (e.target !== app.stage && e.button !== 1) return
    gesture = { kind: 'pan', start: e.global.clone(), worldX: world.x, worldY: world.y }
    app.canvas.style.cursor = 'grabbing'
  })

  app.stage.on('globalpointermove', (e: FederatedPointerEvent) => {
    if (!gesture) return
    const editor = useEditor.getState()
    switch (gesture.kind) {
      case 'pan':
        world.position.set(gesture.worldX + e.global.x - gesture.start.x, gesture.worldY + e.global.y - gesture.start.y)
        break
      case 'move': {
        const dx = (e.global.x - gesture.start.x) / world.scale.x
        const dy = (e.global.y - gesture.start.y) / world.scale.y
        editor.updateLayer(gesture.layerId, { x: gesture.x + dx, y: gesture.y + dy }, gesture.mergeKey)
        break
      }
      case 'scale': {
        const distance = Math.hypot(e.global.x - gesture.center.x, e.global.y - gesture.center.y)
        const scale = Math.min(MAX_LAYER_SCALE, Math.max(MIN_LAYER_SCALE, (gesture.scale * distance) / gesture.startDistance))
        editor.updateLayer(gesture.layerId, { scale }, gesture.mergeKey)
        break
      }
      case 'rotate': {
        const angle = Math.atan2(e.global.y - gesture.center.y, e.global.x - gesture.center.x)
        let rotation = gesture.rotation + angle - gesture.startAngle
        if (e.shiftKey) rotation = Math.round(rotation / ROTATION_SNAP) * ROTATION_SNAP
        editor.updateLayer(gesture.layerId, { rotation }, gesture.mergeKey)
        break
      }
    }
  })

  const endGesture = (e: FederatedPointerEvent) => {
    if (gesture?.kind === 'pan') {
      const moved = Math.hypot(e.global.x - gesture.start.x, e.global.y - gesture.start.y)
      if (moved < CLICK_TOLERANCE && e.button === 0) useEditor.getState().selectZone(null)
      app.canvas.style.cursor = ''
    }
    gesture = null
  }
  app.stage.on('pointerup', endGesture)
  app.stage.on('pointerupoutside', endGesture)

  // --- store subscription ---------------------------------------------------

  mountTemplate()
  drawZones()
  syncLayers()
  fit()

  const unsubscribe = useEditor.subscribe((s, prev) => {
    if (s.doc.templateId !== prev.doc.templateId || s.activeViewId !== prev.activeViewId) {
      template = getTemplate(s.doc.templateId, s.activeViewId)
      mountTemplate()
      drawZones()
      syncLayers()
      // Views of one garment share a frame, so switching views keeps the zoom.
      if (s.doc.templateId !== prev.doc.templateId) fit()
      return
    }
    if (
      s.doc.zoneColors !== prev.doc.zoneColors ||
      s.doc.zonePatterns !== prev.doc.zonePatterns ||
      s.selectedZoneId !== prev.selectedZoneId
    ) {
      drawZones()
    }
    if (s.doc.layers !== prev.doc.layers) syncLayers()
  })

  return {
    viewport: {
      zoomBy: (factor) => setScale(world.scale.x * factor, app.screen.width / 2, app.screen.height / 2),
      fit
    },
    destroy: () => {
      destroyed = true
      unsubscribe()
      app.ticker.remove(updateOverlay)
      app.canvas.removeEventListener('wheel', onWheel)
    }
  }
}
