import { CLIP_GARMENT, CLIP_NONE, zoneClip, type DesignDocument, type Layer } from '../document/model'
import type { GarmentTemplate } from '../templates/parseTemplate'

const OUTLINE_COLOR = '#2b2b30'
const OUTLINE_WIDTH = 1.5
const LINE_HEIGHT = 1.2

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

const round = (n: number) => Math.round(n * 1000) / 1000

function clipId(clip: string): string {
  return clip === CLIP_GARMENT ? 'clip-garment' : `clip-${clip.replace(/[^a-z0-9-]/gi, '-')}`
}

function clipPathDef(template: GarmentTemplate, clip: string): string {
  const zones = clip === CLIP_GARMENT ? template.zones : template.zones.filter((z) => zoneClip(z.id) === clip)
  const paths = (zones.length > 0 ? zones : template.zones).map((z) => `<path d="${escapeXml(z.path)}" />`).join('')
  return `<clipPath id="${clipId(clip)}">${paths}</clipPath>`
}

function layerContent(layer: Layer): string {
  if (layer.type === 'image') {
    return `<image href="${escapeXml(layer.src)}" x="${round(-layer.width / 2)}" y="${round(-layer.height / 2)}" width="${layer.width}" height="${layer.height}" preserveAspectRatio="none" />`
  }
  const lines = layer.text.split('\n')
  const offset = ((lines.length - 1) / 2) * layer.fontSize * LINE_HEIGHT
  const tspans = lines
    .map(
      (line, i) =>
        `<tspan x="0" y="${round(i * layer.fontSize * LINE_HEIGHT - offset)}">${escapeXml(line) || ' '}</tspan>`
    )
    .join('')
  return (
    `<text text-anchor="middle" dominant-baseline="central" xml:space="preserve"` +
    ` font-family="${escapeXml(layer.fontFamily)}" font-size="${layer.fontSize}"` +
    ` font-weight="${layer.fontWeight}" fill="${escapeXml(layer.fill)}">${tspans}</text>`
  )
}

function layerElement(layer: Layer): string {
  const transform = `translate(${round(layer.x)} ${round(layer.y)}) rotate(${round((layer.rotation * 180) / Math.PI)}) scale(${round(layer.scale)})`
  const opacity = layer.opacity < 1 ? ` opacity="${round(layer.opacity)}"` : ''
  const inner = `<g transform="${transform}"${opacity}>${layerContent(layer)}</g>`
  return layer.clip === CLIP_NONE ? inner : `<g clip-path="url(#${clipId(layer.clip)})">${inner}</g>`
}

export interface SvgExportOptions {
  background?: string | null
}

/** Self-contained SVG of the design: garment parts, then visible layers in stacking order. */
export function documentToSvg(doc: DesignDocument, template: GarmentTemplate, options: SvgExportOptions = {}): string {
  const { x, y, width, height } = template.viewBox
  const layers = doc.layers.filter((l) => l.visible)
  const clips = [...new Set(layers.map((l) => l.clip).filter((c) => c !== CLIP_NONE))]

  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${width} ${height}" width="${width}" height="${height}">`,
    `<title>${escapeXml(template.name)} - StitchLab</title>`
  ]
  if (clips.length > 0) parts.push(`<defs>${clips.map((c) => clipPathDef(template, c)).join('')}</defs>`)
  if (options.background) {
    parts.push(`<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${escapeXml(options.background)}" />`)
  }
  parts.push('<g id="garment">')
  for (const zone of template.zones) {
    const fill = doc.zoneColors[zone.id] ?? zone.defaultColor
    parts.push(
      `<path id="zone-${escapeXml(zone.id)}" d="${escapeXml(zone.path)}" fill="${escapeXml(fill)}" stroke="${OUTLINE_COLOR}" stroke-width="${OUTLINE_WIDTH}" stroke-linejoin="round" />`
    )
  }
  parts.push('</g>', '<g id="layers">')
  for (const layer of layers) parts.push(layerElement(layer))
  parts.push('</g>', '</svg>')
  return parts.join('\n')
}
