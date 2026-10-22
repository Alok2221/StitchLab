import type { ExportFormat } from '../../../shared/api'
import type { DesignDocument } from '../document/model'
import type { GarmentTemplate } from '../templates/parseTemplate'
import { buildPdf } from './pdf'
import { svgToPng } from './raster'
import { documentToSvg } from './svg'

/** Long side of the design image embedded in the PDF, in pixels. */
const PDF_IMAGE_LONG_SIDE = 2400

export interface ExportOptions {
  format: ExportFormat
  pngScale: number
  background: string | null
}

export function exportSize(template: GarmentTemplate, scale: number) {
  return {
    width: Math.round(template.viewBox.width * scale),
    height: Math.round(template.viewBox.height * scale)
  }
}

export async function renderExport(
  doc: DesignDocument,
  template: GarmentTemplate,
  { format, pngScale, background }: ExportOptions
): Promise<Uint8Array | string> {
  const svg = documentToSvg(doc, template, { background })
  if (format === 'svg') return svg

  const { width, height } = template.viewBox
  if (format === 'png') return svgToPng(svg, { width, height, scale: pngScale })

  const scale = PDF_IMAGE_LONG_SIDE / Math.max(width, height)
  const png = await svgToPng(svg, { width, height, scale })
  const size = exportSize(template, scale)
  return buildPdf({ doc, template, png, pngWidth: size.width, pngHeight: size.height })
}

export async function exportDesign(
  doc: DesignDocument,
  template: GarmentTemplate,
  options: ExportOptions
): Promise<string | null> {
  const api = window.stitchlab
  if (!api) throw new Error('Export is only available in the desktop app')
  const data = await renderExport(doc, template, options)
  return api.saveFile({ format: options.format, defaultName: `${template.id}-design`, data })
}
