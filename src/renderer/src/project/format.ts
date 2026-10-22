import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import {
  initialColorways,
  resolvedColorways,
  type Colorway,
  type ColorwayState,
  type DesignDocument,
  type ImageLayer,
  type Layer,
  type TextLayer
} from '../document/model'

export const PROJECT_FORMAT = 'stitchlab-project'
/** v2 added colorways; v1 files load with a single colorway. */
export const PROJECT_VERSION = 2

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

interface ProjectJson {
  format: typeof PROJECT_FORMAT
  version: number
  savedAt: string
  document: Omit<DesignDocument, 'layers'> & { layers: StoredLayer[] }
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

  const layers: StoredLayer[] = []
  for (const layer of doc.layers) {
    if (layer.type === 'text') {
      layers.push(layer)
      continue
    }
    let asset = assetsBySrc.get(layer.src)
    if (!asset) {
      const { mime, bytes } = decodeDataUrl(layer.src)
      const extension = MIME_EXTENSIONS[mime]
      if (!extension) throw new ProjectFormatError(`Unsupported image type: ${mime}`)
      asset = `${ASSETS_DIR}${await contentHash(bytes)}.${extension}`
      files[asset] = [bytes, { level: 0 }]
      assetsBySrc.set(layer.src, asset)
    }
    const { src: _src, ...rest } = layer
    layers.push({ ...rest, asset })
  }

  const json: ProjectJson = {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    savedAt: (options.savedAt ?? new Date()).toISOString(),
    document: {
      templateId: doc.templateId,
      zoneColors: doc.zoneColors,
      colorways: resolvedColorways(doc),
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
    if (!isString(raw.asset) || !raw.asset.startsWith(ASSETS_DIR)) fail(`image layer ${index + 1} has no asset`)
    if (!isNumber(raw.width) || !isNumber(raw.height) || raw.width <= 0 || raw.height <= 0) {
      fail(`image layer ${index + 1} has an invalid size`)
    }
    const bytes = files[raw.asset]
    if (!bytes) fail(`asset ${raw.asset} is missing`)
    const mime = EXTENSION_MIMES[raw.asset.split('.').pop() ?? '']
    if (!mime) fail(`asset ${raw.asset} has an unsupported type`)
    return {
      ...base,
      type: 'image',
      src: `data:${mime};base64,${bytesToBase64(bytes)}`,
      width: raw.width,
      height: raw.height
    }
  }

  fail(`layer ${index + 1} has an unknown type`)
}

function readColorways(raw: Record<string, unknown>, zoneColors: Record<string, string>): ColorwayState {
  if (!Array.isArray(raw.colorways) || raw.colorways.length === 0 || raw.colorways.length > MAX_COLORWAYS) {
    fail('invalid colorways')
  }
  const colorways: Colorway[] = raw.colorways.map((c, i) => {
    if (!isObject(c) || !isString(c.id) || !c.id || !isString(c.name)) fail(`colorway ${i + 1} is invalid`)
    if (!isObject(c.zoneColors) || !Object.values(c.zoneColors).every(isColor)) {
      fail(`colorway ${i + 1} has invalid part colors`)
    }
    return { id: c.id, name: c.name, zoneColors: c.zoneColors as Record<string, string> }
  })
  if (new Set(colorways.map((c) => c.id)).size !== colorways.length) fail('duplicate colorway ids')
  const active = colorways.find((c) => c.id === raw.activeColorwayId)
  if (!active) fail('unknown active colorway')
  return {
    zoneColors,
    colorways: colorways.map((c) => (c.id === active.id ? { ...c, zoneColors } : c)),
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

  const zoneColors = raw.zoneColors as Record<string, string>
  const colorways = raw.colorways === undefined && json.version < 2 ? initialColorways(zoneColors) : readColorways(raw, zoneColors)

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
