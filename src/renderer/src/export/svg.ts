import { CLIP_GARMENT, CLIP_NONE, zoneClip, type DesignDocument, type Layer } from '../document/model'
import { patternDef } from '../document/patterns'
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

function clipId(clip: string, prefix: string): string {
  return prefix + (clip === CLIP_GARMENT ? 'clip-garment' : `clip-${clip.replace(/[^a-z0-9-]/gi, '-')}`)
}

function clipPathDef(template: GarmentTemplate, clip: string, prefix: string): string {
  const zones = clip === CLIP_GARMENT ? template.zones : template.zones.filter((z) => zoneClip(z.id) === clip)
  const paths = (zones.length > 0 ? zones : template.zones).map((z) => `<path d="${escapeXml(z.path)}" />`).join('')
  return `<clipPath id="${clipId(clip, prefix)}">${paths}</clipPath>`
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

function layerElement(layer: Layer, prefix: string): string {
  const transform = `translate(${round(layer.x)} ${round(layer.y)}) rotate(${round((layer.rotation * 180) / Math.PI)}) scale(${round(layer.scale)})`
  const opacity = layer.opacity < 1 ? ` opacity="${round(layer.opacity)}"` : ''
  const inner = `<g transform="${transform}"${opacity}>${layerContent(layer)}</g>`
  return layer.clip === CLIP_NONE ? inner : `<g clip-path="url(#${clipId(layer.clip, prefix)})">${inner}</g>`
}

/**
 * Definitions and drawing of one garment view: its parts, then its visible layers in stacking order.
 * Every id starts with `prefix`, so several views can share one SVG document.
 */
export function viewContent(doc: DesignDocument, template: GarmentTemplate, prefix = ''): { defs: string; body: string } {
  const layers = doc.layers.filter((l) => l.visible && l.view === template.view)
  const clips = [...new Set(layers.map((l) => l.clip).filter((c) => c !== CLIP_NONE))]
  const fills = template.zones.map((zone, i) => {
    const color = doc.zoneColors[zone.id] ?? zone.defaultColor
    const pattern = doc.zonePatterns[zone.id]
    const id = `${prefix}fill-${i}`
    return pattern ? { def: patternDef(id, pattern, color), ref: `url(#${id})` } : { def: '', ref: color }
  })
  const body = [`<g id="${prefix}garment">`]
  template.zones.forEach((zone, i) => {
    body.push(
      `<path id="${prefix}zone-${escapeXml(zone.id)}" d="${escapeXml(zone.path)}" fill="${escapeXml(fills[i].ref)}" stroke="${OUTLINE_COLOR}" stroke-width="${OUTLINE_WIDTH}" stroke-linejoin="round" />`
    )
  })
  body.push('</g>', `<g id="${prefix}layers">`)
  for (const layer of layers) body.push(layerElement(layer, prefix))
  body.push('</g>')
  return {
    defs: [...clips.map((c) => clipPathDef(template, c, prefix)), ...fills.map((f) => f.def)].join(''),
    body: body.join('\n')
  }
}

export interface SvgExportOptions {
  background?: string | null
}

/** Self-contained SVG of one garment view. */
export function documentToSvg(doc: DesignDocument, template: GarmentTemplate, options: SvgExportOptions = {}): string {
  const { x, y, width, height } = template.viewBox
  const { defs, body } = viewContent(doc, template)
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${width} ${height}" width="${width}" height="${height}">`,
    `<title>${escapeXml(template.name)} (${escapeXml(template.viewLabel)}) - StitchLab</title>`
  ]
  if (defs) parts.push(`<defs>${defs}</defs>`)
  if (options.background) {
    parts.push(`<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${escapeXml(options.background)}" />`)
  }
  parts.push(body, '</svg>')
  return parts.join('\n')
}
