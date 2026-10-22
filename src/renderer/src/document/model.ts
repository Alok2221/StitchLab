export const CLIP_NONE = 'none'
export const CLIP_GARMENT = 'garment'
export const zoneClip = (zoneId: string) => `zone:${zoneId}`

/** `none`, `garment` or `zone:<zoneId>` */
export type ClipMode = string

interface LayerBase {
  id: string
  name: string
  x: number
  y: number
  rotation: number
  scale: number
  opacity: number
  visible: boolean
  locked: boolean
  clip: ClipMode
}

export interface TextLayer extends LayerBase {
  type: 'text'
  text: string
  fontFamily: string
  fontSize: number
  fontWeight: 'normal' | 'bold'
  fill: string
}

export interface ImageLayer extends LayerBase {
  type: 'image'
  src: string
  width: number
  height: number
}

export type Layer = TextLayer | ImageLayer

export type LayerPatch = Partial<Omit<TextLayer, 'id' | 'type'>> & Partial<Omit<ImageLayer, 'id' | 'type'>>

export const PATTERN_KINDS = ['stripes', 'checks', 'dots', 'grid', 'image'] as const
export type PatternKind = (typeof PATTERN_KINDS)[number]

interface PatternBase {
  /** Tile size multiplier. */
  scale: number
  /** Degrees. */
  angle: number
}

export interface GeometricPattern extends PatternBase {
  kind: Exclude<PatternKind, 'image'>
  /** Ink color drawn over the part color. */
  color: string
}

export interface ImagePattern extends PatternBase {
  kind: 'image'
  src: string
  width: number
  height: number
}

/** Repeating fill drawn over a part's base color. */
export type ZonePattern = GeometricPattern | ImagePattern

/** How the garment parts are filled: base colors plus optional patterns. */
export interface ZoneFills {
  zoneColors: Record<string, string>
  zonePatterns: Record<string, ZonePattern>
}

export interface Colorway extends ZoneFills {
  id: string
  name: string
}

/** For the active colorway, the document-level `zoneColors` and `zonePatterns` are authoritative. */
export interface DesignDocument extends ZoneFills {
  templateId: string
  colorways: Colorway[]
  activeColorwayId: string
  palette: string[]
  layers: Layer[]
}

export interface ColorwayState extends ZoneFills {
  colorways: Colorway[]
  activeColorwayId: string
}

export interface GarmentState extends ColorwayState {
  templateId: string
}

export type Operation =
  | { type: 'setZoneColor'; zoneId: string; from: string; to: string }
  | { type: 'setZonePattern'; zoneId: string; from: ZonePattern | null; to: ZonePattern | null; mergeKey?: string }
  | { type: 'addPaletteColor'; color: string }
  | { type: 'setTemplate'; from: GarmentState; to: GarmentState }
  | { type: 'setColorways'; from: ColorwayState; to: ColorwayState; mergeKey?: string }
  | { type: 'addLayer'; layer: Layer; index: number }
  | { type: 'removeLayer'; layer: Layer; index: number }
  | { type: 'updateLayer'; id: string; from: LayerPatch; to: LayerPatch; mergeKey?: string }
  | { type: 'moveLayer'; from: number; to: number }

export interface History {
  past: Operation[]
  future: Operation[]
}

export const HISTORY_LIMIT = 200

export const DEFAULT_PALETTE = [
  '#f4f4f2',
  '#1f1f22',
  '#c8102e',
  '#1d4e89',
  '#2e7d4f',
  '#f2b134',
  '#7a4fa3',
  '#e07a5f'
]

export function defaultZoneColors(zones: { id: string; defaultColor: string }[]): Record<string, string> {
  return Object.fromEntries(zones.map((z) => [z.id, z.defaultColor]))
}

export const FIRST_COLORWAY_ID = 'colorway-1'

export function initialColorways(
  zoneColors: Record<string, string>,
  zonePatterns: Record<string, ZonePattern> = {}
): ColorwayState {
  return {
    zoneColors,
    zonePatterns,
    colorways: [{ id: FIRST_COLORWAY_ID, name: 'Colorway 1', zoneColors, zonePatterns }],
    activeColorwayId: FIRST_COLORWAY_ID
  }
}

export function createDocument(
  templateId: string,
  zones: { id: string; defaultColor: string }[]
): DesignDocument {
  return {
    templateId,
    ...initialColorways(defaultZoneColors(zones)),
    palette: [...DEFAULT_PALETTE],
    layers: []
  }
}

export function colorwayState(doc: DesignDocument): ColorwayState {
  return {
    zoneColors: doc.zoneColors,
    zonePatterns: doc.zonePatterns,
    colorways: doc.colorways,
    activeColorwayId: doc.activeColorwayId
  }
}

/** All colorways with the active one carrying the live fills. */
export function resolvedColorways(doc: DesignDocument): Colorway[] {
  return doc.colorways.map((c) =>
    c.id === doc.activeColorwayId ? { ...c, zoneColors: doc.zoneColors, zonePatterns: doc.zonePatterns } : c
  )
}

/** The document as it looks with another colorway active. */
export function withColorway(doc: DesignDocument, colorwayId: string): DesignDocument {
  const colorways = resolvedColorways(doc)
  const target = colorways.find((c) => c.id === colorwayId)
  if (!target) return doc
  return {
    ...doc,
    colorways,
    activeColorwayId: target.id,
    zoneColors: target.zoneColors,
    zonePatterns: target.zonePatterns
  }
}

function withPattern(patterns: Record<string, ZonePattern>, zoneId: string, pattern: ZonePattern | null) {
  const next = { ...patterns }
  if (pattern) next[zoneId] = pattern
  else delete next[zoneId]
  return next
}

function insertAt<T>(items: T[], index: number, item: T): T[] {
  const next = [...items]
  next.splice(index, 0, item)
  return next
}

function removeAt<T>(items: T[], index: number): T[] {
  return items.filter((_, i) => i !== index)
}

function moveItem<T>(items: T[], from: number, to: number): T[] {
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

function patchLayer(layers: Layer[], id: string, patch: LayerPatch): Layer[] {
  return layers.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l))
}

export function applyOperation(doc: DesignDocument, op: Operation): DesignDocument {
  switch (op.type) {
    case 'setZoneColor':
      return { ...doc, zoneColors: { ...doc.zoneColors, [op.zoneId]: op.to } }
    case 'setZonePattern':
      return { ...doc, zonePatterns: withPattern(doc.zonePatterns, op.zoneId, op.to) }
    case 'addPaletteColor':
      return { ...doc, palette: [...doc.palette, op.color] }
    case 'setTemplate':
    case 'setColorways':
      return { ...doc, ...op.to }
    case 'addLayer':
      return { ...doc, layers: insertAt(doc.layers, op.index, op.layer) }
    case 'removeLayer':
      return { ...doc, layers: removeAt(doc.layers, op.index) }
    case 'updateLayer':
      return { ...doc, layers: patchLayer(doc.layers, op.id, op.to) }
    case 'moveLayer':
      return { ...doc, layers: moveItem(doc.layers, op.from, op.to) }
  }
}

export function revertOperation(doc: DesignDocument, op: Operation): DesignDocument {
  switch (op.type) {
    case 'setZoneColor':
      return { ...doc, zoneColors: { ...doc.zoneColors, [op.zoneId]: op.from } }
    case 'setZonePattern':
      return { ...doc, zonePatterns: withPattern(doc.zonePatterns, op.zoneId, op.from) }
    case 'addPaletteColor':
      return { ...doc, palette: doc.palette.slice(0, -1) }
    case 'setTemplate':
    case 'setColorways':
      return { ...doc, ...op.from }
    case 'addLayer':
      return { ...doc, layers: removeAt(doc.layers, op.index) }
    case 'removeLayer':
      return { ...doc, layers: insertAt(doc.layers, op.index, op.layer) }
    case 'updateLayer':
      return { ...doc, layers: patchLayer(doc.layers, op.id, op.from) }
    case 'moveLayer':
      return { ...doc, layers: moveItem(doc.layers, op.to, op.from) }
  }
}

/**
 * Consecutive operations with the same `mergeKey` (one drag, one text field
 * edit) collapse into a single history entry.
 */
function mergeWithLast(past: Operation[], op: Operation): Operation[] {
  const last = past.at(-1)
  if (
    op.type === 'updateLayer' &&
    op.mergeKey &&
    last?.type === 'updateLayer' &&
    last.mergeKey === op.mergeKey &&
    last.id === op.id
  ) {
    const merged: Operation = { ...op, from: { ...op.from, ...last.from }, to: { ...last.to, ...op.to } }
    return [...past.slice(0, -1), merged]
  }
  if (op.type === 'setColorways' && op.mergeKey && last?.type === 'setColorways' && last.mergeKey === op.mergeKey) {
    return [...past.slice(0, -1), { ...op, from: last.from }]
  }
  if (
    op.type === 'setZonePattern' &&
    op.mergeKey &&
    last?.type === 'setZonePattern' &&
    last.mergeKey === op.mergeKey &&
    last.zoneId === op.zoneId
  ) {
    return [...past.slice(0, -1), { ...op, from: last.from }]
  }
  const next = [...past, op]
  if (next.length > HISTORY_LIMIT) next.shift()
  return next
}

export function commit(
  doc: DesignDocument,
  history: History,
  op: Operation
): { doc: DesignDocument; history: History } {
  return { doc: applyOperation(doc, op), history: { past: mergeWithLast(history.past, op), future: [] } }
}

export function undo(doc: DesignDocument, history: History): { doc: DesignDocument; history: History } {
  const op = history.past.at(-1)
  if (!op) return { doc, history }
  return {
    doc: revertOperation(doc, op),
    history: { past: history.past.slice(0, -1), future: [op, ...history.future] }
  }
}

export function redo(doc: DesignDocument, history: History): { doc: DesignDocument; history: History } {
  const [op, ...future] = history.future
  if (!op) return { doc, history }
  return {
    doc: applyOperation(doc, op),
    history: { past: [...history.past, op], future }
  }
}

/** Values the layer currently has for every key in `patch`, used as the undo side of an update. */
export function pickLayerValues(layer: Layer, patch: LayerPatch): LayerPatch {
  const source = layer as unknown as Record<string, unknown>
  return Object.fromEntries(Object.keys(patch).map((key) => [key, source[key]])) as LayerPatch
}
