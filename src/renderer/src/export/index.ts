import type { ExportFormat } from '../../../shared/api'
import { resolvedColorways, withColorway, type Colorway, type DesignDocument } from '../document/model'
import type { GarmentTemplate } from '../templates/parseTemplate'
import { buildPdf, type PdfSheet } from './pdf'
import { svgToPng } from './raster'
import { documentToSvg } from './svg'

/** Long side of the design image embedded in the PDF, in pixels. */
const PDF_IMAGE_LONG_SIDE = 2400

export interface ExportOptions {
  format: ExportFormat
  pngScale: number
  background: string | null
  /** Export every colorway instead of only the active one. */
  allColorways?: boolean
}

export function exportSize(template: GarmentTemplate, scale: number) {
  return {
    width: Math.round(template.viewBox.width * scale),
    height: Math.round(template.viewBox.height * scale)
  }
}

/** File name stem for a colorway export, e.g. `tshirt-front-navy-drop`. */
export function colorwayFileStem(template: GarmentTemplate, colorway: Colorway): string {
  const slug = colorway.name
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${template.id}-${slug || colorway.id}`
}

async function renderSheet(doc: DesignDocument, template: GarmentTemplate, colorway: Colorway, named: boolean): Promise<PdfSheet> {
  const { width, height } = template.viewBox
  const scale = PDF_IMAGE_LONG_SIDE / Math.max(width, height)
  const png = await svgToPng(documentToSvg(withColorway(doc, colorway.id), template, { background: '#ffffff' }), {
    width,
    height,
    scale
  })
  const size = exportSize(template, scale)
  return {
    name: named ? colorway.name : null,
    zoneColors: colorway.zoneColors,
    zonePatterns: colorway.zonePatterns,
    png,
    pngWidth: size.width,
    pngHeight: size.height
  }
}

/** Renders the design as it currently looks (active colorway) to PNG or SVG. */
export async function renderImage(
  doc: DesignDocument,
  template: GarmentTemplate,
  { format, pngScale, background }: ExportOptions
): Promise<Uint8Array | string> {
  const svg = documentToSvg(doc, template, { background })
  if (format !== 'png') return svg
  const { width, height } = template.viewBox
  return svgToPng(svg, { width, height, scale: pngScale })
}

export async function renderPdf(doc: DesignDocument, template: GarmentTemplate, allColorways: boolean): Promise<Uint8Array> {
  const colorways = resolvedColorways(doc)
  const selected = allColorways ? colorways : colorways.filter((c) => c.id === doc.activeColorwayId)
  const named = colorways.length > 1
  const sheets: PdfSheet[] = []
  for (const colorway of selected) sheets.push(await renderSheet(doc, template, colorway, named))
  return buildPdf({ doc, template, sheets })
}

/** Exports and saves the design. Resolves to a status message, or null when the user cancelled. */
export async function exportDesign(
  doc: DesignDocument,
  template: GarmentTemplate,
  options: ExportOptions
): Promise<string | null> {
  const api = window.stitchlab
  if (!api) throw new Error('Export is only available in the desktop app')
  const colorways = resolvedColorways(doc)
  const active = colorways.find((c) => c.id === doc.activeColorwayId) ?? colorways[0]
  const all = Boolean(options.allColorways) && colorways.length > 1

  if (options.format === 'pdf') {
    const data = await renderPdf(doc, template, all)
    const defaultName = all ? `${template.id}-colorways` : colorways.length > 1 ? colorwayFileStem(template, active) : `${template.id}-design`
    const path = await api.saveFile({ format: 'pdf', defaultName, data })
    return path && `Exported to ${path}`
  }

  if (!all) {
    const data = await renderImage(doc, template, options)
    const defaultName = colorways.length > 1 ? colorwayFileStem(template, active) : `${template.id}-design`
    const path = await api.saveFile({ format: options.format, defaultName, data })
    return path && `Exported to ${path}`
  }

  const files = []
  for (const colorway of colorways) {
    files.push({
      name: colorwayFileStem(template, colorway),
      data: await renderImage(withColorway(doc, colorway.id), template, options)
    })
  }
  const saved = await api.saveFiles({ format: options.format, files })
  return saved && `Exported ${saved.paths.length} files to ${saved.directory}`
}
