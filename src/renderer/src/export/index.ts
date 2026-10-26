import type { ExportFormat } from '../../../shared/api'
import { resolvedColorways, withColorway, type Colorway, type DesignDocument } from '../document/model'
import type { GarmentTemplate } from '../templates/parseTemplate'
import { lookbookScale, lookbookSvg } from './lookbook'
import { buildPdf, type PdfRender, type PdfSheet } from './pdf'
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
  /** Export every view of the garment instead of only the one on the canvas. */
  allViews?: boolean
  /** PNG / SVG: put every exported view and colorway on one lookbook sheet instead of separate files. */
  combine?: boolean
}

export function exportSize(template: GarmentTemplate, scale: number) {
  return {
    width: Math.round(template.viewBox.width * scale),
    height: Math.round(template.viewBox.height * scale)
  }
}

/** File name stem for one view, e.g. `tshirt-back-navy-drop`, or `tshirt-back-design` without a colorway. */
export function colorwayFileStem(template: GarmentTemplate, colorway: Colorway | null): string {
  const slug = colorway?.name
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${template.id}-${template.view}-${colorway ? slug || colorway.id : 'design'}`
}

async function renderView(doc: DesignDocument, template: GarmentTemplate): Promise<PdfRender> {
  const { width, height } = template.viewBox
  const scale = PDF_IMAGE_LONG_SIDE / Math.max(width, height)
  const png = await svgToPng(documentToSvg(doc, template, { background: '#ffffff' }), { width, height, scale })
  const size = exportSize(template, scale)
  return { png, pngWidth: size.width, pngHeight: size.height }
}

async function renderSheet(doc: DesignDocument, views: GarmentTemplate[], colorway: Colorway, named: boolean): Promise<PdfSheet> {
  const colored = withColorway(doc, colorway.id)
  const renders: PdfRender[] = []
  for (const view of views) renders.push(await renderView(colored, view))
  return { name: named ? colorway.name : null, zoneColors: colorway.zoneColors, zonePatterns: colorway.zonePatterns, renders }
}

/** Renders one view as it currently looks (active colorway) to PNG or SVG. */
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

/** Lookbook sheet with the given views side by side, one row per colorway. */
export function renderLookbook(doc: DesignDocument, views: GarmentTemplate[], colorways: Colorway[], background: string | null) {
  const named = doc.colorways.length > 1
  const rows = colorways.map((c) => ({ name: named ? c.name : null, doc: withColorway(doc, c.id) }))
  return lookbookSvg(views, rows, { background })
}

export async function renderPdf(doc: DesignDocument, views: GarmentTemplate[], allColorways: boolean): Promise<Uint8Array> {
  const colorways = resolvedColorways(doc)
  const selected = allColorways ? colorways : colorways.filter((c) => c.id === doc.activeColorwayId)
  const named = colorways.length > 1
  const sheets: PdfSheet[] = []
  for (const colorway of selected) sheets.push(await renderSheet(doc, views, colorway, named))
  return buildPdf({ doc, views, sheets })
}

/**
 * Exports and saves the design. `views` are all views of the garment, `active` the one on the canvas.
 * Resolves to a status message, or null when the user cancelled.
 */
export async function exportDesign(
  doc: DesignDocument,
  views: GarmentTemplate[],
  active: GarmentTemplate,
  options: ExportOptions
): Promise<string | null> {
  const api = window.stitchlab
  if (!api) throw new Error('Export is only available in the desktop app')
  const colorways = resolvedColorways(doc)
  const activeColorway = colorways.find((c) => c.id === doc.activeColorwayId) ?? colorways[0]
  const named = colorways.length > 1
  const selectedColorways = options.allColorways && named ? colorways : [activeColorway]
  const selectedViews = options.allViews && views.length > 1 ? views : [active]

  if (options.format === 'pdf') {
    const data = await renderPdf(doc, selectedViews, selectedColorways.length > 1)
    const stem =
      selectedViews.length > 1
        ? `${active.id}-${selectedColorways.length > 1 ? 'colorways' : 'design'}`
        : selectedColorways.length > 1
          ? `${active.id}-${active.view}-colorways`
          : colorwayFileStem(active, named ? activeColorway : null)
    const path = await api.saveFile({ format: 'pdf', defaultName: stem, data })
    return path && `Exported to ${path}`
  }

  if (options.combine && selectedViews.length * selectedColorways.length > 1) {
    const sheet = renderLookbook(doc, selectedViews, selectedColorways, options.background)
    const data =
      options.format === 'png'
        ? await svgToPng(sheet.svg, {
            width: sheet.width,
            height: sheet.height,
            scale: lookbookScale(sheet.width, sheet.height, options.pngScale)
          })
        : sheet.svg
    const path = await api.saveFile({ format: options.format, defaultName: `${active.id}-lookbook`, data })
    return path && `Exported to ${path}`
  }

  const files = []
  for (const colorway of selectedColorways) {
    const colored = withColorway(doc, colorway.id)
    for (const view of selectedViews) {
      files.push({
        name: colorwayFileStem(view, named ? colorway : null),
        data: await renderImage(colored, view, options)
      })
    }
  }
  if (files.length === 1) {
    const path = await api.saveFile({ format: options.format, defaultName: files[0].name, data: files[0].data })
    return path && `Exported to ${path}`
  }
  const saved = await api.saveFiles({ format: options.format, files })
  return saved && `Exported ${saved.paths.length} files to ${saved.directory}`
}
