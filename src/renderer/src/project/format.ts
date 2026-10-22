import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import {
  initialColorways,
  PATTERN_KINDS,
  resolvedColorways,
  type Colorway,
  type ColorwayState,
  type DesignDocument,
  type GeometricPattern,
  type ImageLayer,
  type ImagePattern,
  type Layer,
  type TextLayer,
  type ZoneFills,
  type ZonePattern
} from '../document/model'
import { clampPatternScale } from '../document/patterns'

export const PROJECT_FORMAT = 'stitchlab-project'
/** v2 added colorways, v3 part patterns; older files still load. */
export const PROJECT_VERSION = 3

const PROJECT_JSON = 'project.json'
const THUMBNAIL = 'thumbnail.png'
const ASSETS_DIR = 'assets/'
const MAX_LAYERS = 2000
const MAX_COLORWAYS = 200

const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/svg+xml': 'svg',
  'image/webp': 'webp'
}
const EXTENSION_MIMES = Object.fromEntries(Object.entries(MIME_EXTENSIONS).map(([mime, ext]) => [ext, mime]))

export class ProjectFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProjectFormatError'
  }
}

type StoredImageLayer = Omit<ImageLayer, 'src'> & { asset: string }
type StoredLayer = TextLayer | StoredImageLayer
type StoredPattern = GeometricPattern | (Omit<ImagePattern, 'src'> & { asset: string })
type StoredPatterns = Record<string, StoredPattern>

interface ProjectJson {
  format: typeof PROJECT_FORMAT
  version: number
  savedAt: string
  document: Omit<DesignDocument, 'layers' | 'zonePatterns' | 'colorways'> & {
    zonePatterns: StoredPatterns
    colorways: (Omit<Colorway, 'zonePatterns'> & { zonePatterns: StoredPatterns })[]
    layers: StoredLayer[]
  }
}

// --- data URLs ---------------------------------------------------------------

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function decodeDataUrl(src: string): { mime: string; bytes: Uint8Array } {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(src)
  if (!match) throw new ProjectFormatError('Image layer has an unsupported source')
  const [, mime, base64, payload] = match
  const bytes = base64
    ? Uint8Array.from(atob(payload), (c) => c.charCodeAt(0))
    : strToU8(decodeURIComponent(payload))
  return { mime, bytes }
}

async function contentHash(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)
  return Array.from(new Uint8Array(digest).slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('')
}

// --- write -------------------------------------------------------------------

export async function serializeProject(
  doc: DesignDocument,
  options: { thumbnail?: Uint8Array; savedAt?: Date } = {}
): Promise<Uint8Array> {
  const files: Zippable = {}
  const assetsBySrc = new Map<string, string>()

  const storeAsset = async (src: string) => {
    let asset = assetsBySrc.get(src)
    if (!asset) {
      const { mime, bytes } = decodeDataUrl(src)
      const extension = MIME_EXTENSIONS[mime]
      if (!extension) throw new ProjectFormatError(`Unsupported image type: ${mime}`)
      asset = `${ASSETS_DIR}${await contentHash(bytes)}.${extension}`
      files[asset] = [bytes, { level: 0 }]
      assetsBySrc.set(src, asset)
    }
    return asset
  }

  const storePatterns = async (patterns: Record<string, ZonePattern>) => {
    const stored: StoredPatterns = {}
    for (const [zoneId, pattern] of Object.entries(patterns)) {
      if (pattern.kind !== 'image') {
        stored[zoneId] = pattern
        continue
      }
      const { src, ...rest } = pattern
      stored[zoneId] = { ...rest, asset: await storeAsset(src) }
    }
    return stored
  }

  const layers: StoredLayer[] = []
  for (const layer of doc.layers) {
    if (layer.type === 'text') {
      layers.push(layer)
      continue
    }
    const { src, ...rest } = layer
    layers.push({ ...rest, asset: await storeAsset(src) })
  }

  const colorways: ProjectJson['document']['colorways'] = []
  for (const colorway of resolvedColorways(doc)) {
    colorways.push({ ...colorway, zonePatterns: await storePatterns(colorway.zonePatterns) })
  }

  const json: ProjectJson = {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    savedAt: (options.savedAt ?? new Date()).toISOString(),
    document: {
      templateId: doc.templateId,
      zoneColors: doc.zoneColors,
      zonePatterns: await storePatterns(doc.zonePatterns),
      colorways,
      activeColorwayId: doc.activeColorwayId,
      palette: doc.palette,
      layers
    }
  }
  files[PROJECT_JSON] = strToU8(JSON.stringify(json, null, 2))
  if (options.thumbnail) files[THUMBNAIL] = [options.thumbnail, { level: 0 }]

  return zipSync(files, { level: 6 })
}

// --- read --------------------------------------------------------------------

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isString = (v: unknown): v is string => typeof v === 'string'
const isColor = (v: unknown): v is string => isString(v) && /^#[0-9a-f]{6}$/i.test(v)

function fail(message: string): never {
  throw new ProjectFormatError(`Invalid project file: ${message}`)
}

function readLayerBase(raw: Record<string, unknown>, index: number) {
  const where = `layer ${index + 1}`
  if (!isString(raw.id) || !raw.id) fail(`${where} has no id`)
  if (!isString(raw.name)) fail(`${where} has no name`)
  for (const key of ['x', 'y', 'rotation', 'scale', 'opacity'] as const) {
    if (!isNumber(raw[key])) fail(`${where} has an invalid ${key}`)
  }
  if (typeof raw.visible !== 'boolean' || typeof raw.locked !== 'boolean') fail(`${where} has invalid flags`)
  if (!isString(raw.clip)) fail(`${where} has an invalid clip`)
  return {
    id: raw.id,
    name: raw.name,
    x: raw.x as number,
    y: raw.y as number,
    rotation: raw.rotation as number,
    scale: Math.max(0.001, raw.scale as number),
    opacity: Math.min(1, Math.max(0, raw.opacity as number)),
    visible: raw.visible,
    locked: raw.locked,
    clip: raw.clip
  }
}

function readLayer(raw: unknown, index: number, files: Record<string, Uint8Array>): Layer {
  if (!isObject(raw)) fail(`layer ${index + 1} is not an object`)
  const base = readLayerBase(raw, index)

  if (raw.type === 'text') {
    if (!isString(raw.text) || !isString(raw.fontFamily) || !isNumber(raw.fontSize) || !isColor(raw.fill)) {
      fail(`text layer ${index + 1} has invalid text properties`)
    }
    return {
      ...base,
      type: 'text',
      text: raw.text,
      fontFamily: raw.fontFamily,
      fontSize: raw.fontSize,
      fontWeight: raw.fontWeight === 'bold' ? 'bold' : 'normal',
      fill: raw.fill
    }
  }

  if (raw.type === 'image') {
    if (!isNumber(raw.width) || !isNumber(raw.height) || raw.width <= 0 || raw.height <= 0) {
      fail(`image layer ${index + 1} has an invalid size`)
    }
    return {
      ...base,
      type: 'image',
      src: readAsset(raw.asset, `image layer ${index + 1}`, files),
      width: raw.width,
      height: raw.height
    }
  }

  fail(`layer ${index + 1} has an unknown type`)
}

function readAsset(asset: unknown, where: string, files: Record<string, Uint8Array>): string {
  if (!isString(asset) || !asset.startsWith(ASSETS_DIR)) fail(`${where} has no asset`)
  const bytes = files[asset]
  if (!bytes) fail(`asset ${asset} is missing`)
  const mime = EXTENSION_MIMES[asset.split('.').pop() ?? '']
  if (!mime) fail(`asset ${asset} has an unsupported type`)
  return `data:${mime};base64,${bytesToBase64(bytes)}`
}

/** Resolves an asset path to an image data URL. */
type AssetReader = (asset: unknown, where: string) => string

function readPattern(raw: unknown, where: string, readImage: AssetReader): ZonePattern {
  if (!isObject(raw) || !isNumber(raw.scale) || !isNumber(raw.angle)) fail(`${where} is invalid`)
  const base = { scale: clampPatternScale(raw.scale), angle: raw.angle % 360 }
  if (raw.kind === 'image') {
    if (!isNumber(raw.width) || !isNumber(raw.height) || raw.width <= 0 || raw.height <= 0) {
      fail(`${where} has an invalid size`)
    }
    return { ...base, kind: 'image', src: readImage(raw.asset, where), width: raw.width, height: raw.height }
  }
  const kind = PATTERN_KINDS.find((k) => k === raw.kind)
  if (!kind || kind === 'image') fail(`${where} has an unknown kind`)
  if (!isColor(raw.color)) fail(`${where} has an invalid color`)
  return { ...base, kind, color: raw.color }
}

function readPatterns(raw: unknown, where: string, readImage: AssetReader): Record<string, ZonePattern> {
  if (!isObject(raw)) fail(`${where} has invalid patterns`)
  return Object.fromEntries(
    Object.entries(raw).map(([zoneId, p]) => [zoneId, readPattern(p, `${where} pattern on ${zoneId}`, readImage)])
  )
}

function readColorways(raw: Record<string, unknown>, fills: ZoneFills, version: number, readImage: AssetReader): ColorwayState {
  if (!Array.isArray(raw.colorways) || raw.colorways.length === 0 || raw.colorways.length > MAX_COLORWAYS) {
    fail('invalid colorways')
  }
  const colorways: Colorway[] = raw.colorways.map((c, i) => {
    const where = `colorway ${i + 1}`
    if (!isObject(c) || !isString(c.id) || !c.id || !isString(c.name)) fail(`${where} is invalid`)
    if (!isObject(c.zoneColors) || !Object.values(c.zoneColors).every(isColor)) {
      fail(`${where} has invalid part colors`)
    }
    const zonePatterns = c.zonePatterns === undefined && version < 3 ? {} : readPatterns(c.zonePatterns, where, readImage)
    return { id: c.id, name: c.name, zoneColors: c.zoneColors as Record<string, string>, zonePatterns }
  })
  if (new Set(colorways.map((c) => c.id)).size !== colorways.length) fail('duplicate colorway ids')
  const active = colorways.find((c) => c.id === raw.activeColorwayId)
  if (!active) fail('unknown active colorway')
  return {
    ...fills,
    colorways: colorways.map((c) => (c.id === active.id ? { ...c, ...fills } : c)),
    activeColorwayId: active.id
  }
}

export interface LoadedProject {
  doc: DesignDocument
  savedAt: string
  thumbnail: Uint8Array | null
}

export function parseProject(data: Uint8Array): LoadedProject {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(data)
  } catch {
    throw new ProjectFormatError('This is not a StitchLab project file')
  }
  const jsonBytes = files[PROJECT_JSON]
  if (!jsonBytes) throw new ProjectFormatError('This is not a StitchLab project file')

  let json: unknown
  try {
    json = JSON.parse(strFromU8(jsonBytes))
  } catch {
    fail('project.json is not valid JSON')
  }
  if (!isObject(json) || json.format !== PROJECT_FORMAT) fail('unknown format')
  if (!isNumber(json.version) || json.version > PROJECT_VERSION) {
    throw new ProjectFormatError('This project was saved by a newer version of StitchLab')
  }

  const raw = json.document
  if (!isObject(raw)) fail('missing document')
  if (!isString(raw.templateId)) fail('missing template')
  if (!isObject(raw.zoneColors) || !Object.values(raw.zoneColors).every(isColor)) fail('invalid part colors')
  if (!Array.isArray(raw.palette) || !raw.palette.every(isColor)) fail('invalid palette')
  if (!Array.isArray(raw.layers) || raw.layers.length > MAX_LAYERS) fail('invalid layers')

  const layers = raw.layers.map((layer, i) => readLayer(layer, i, files))
  if (new Set(layers.map((l) => l.id)).size !== layers.length) fail('duplicate layer ids')

  const decoded = new Map<string, string>()
  const readImage: AssetReader = (asset, where) => {
    const key = String(asset)
    let src = decoded.get(key)
    if (!src) {
      src = readAsset(asset, where, files)
      decoded.set(key, src)
    }
    return src
  }

  const version = json.version
  const fills: ZoneFills = {
    zoneColors: raw.zoneColors as Record<string, string>,
    zonePatterns: raw.zonePatterns === undefined && version < 3 ? {} : readPatterns(raw.zonePatterns, 'document', readImage)
  }
  const colorways =
    raw.colorways === undefined && version < 2
      ? initialColorways(fills.zoneColors, fills.zonePatterns)
      : readColorways(raw, fills, version, readImage)

  return {
    doc: {
      templateId: raw.templateId,
      ...colorways,
      palette: raw.palette as string[],
      layers
    },
    savedAt: isString(json.savedAt) ? json.savedAt : '',
    thumbnail: files[THUMBNAIL] ?? null
  }
}
