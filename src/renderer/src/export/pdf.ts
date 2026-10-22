import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { CLIP_GARMENT, CLIP_NONE, zoneClip, type DesignDocument, type Layer } from '../document/model'
import type { GarmentTemplate } from '../templates/parseTemplate'

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN = 40
const IMAGE_MAX_HEIGHT = 440
const ROW_HEIGHT = 18
const SWATCH = 12
const TEXT_COLOR = rgb(0.12, 0.12, 0.14)
const MUTED_COLOR = rgb(0.45, 0.45, 0.5)
const BORDER_COLOR = rgb(0.75, 0.75, 0.78)

/** Standard PDF fonts only cover WinAnsi; anything else is transliterated or replaced. */
export function toWinAnsi(text: string): string {
  return text
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/gu, '?')
}

export function hexToRgb(hex: string) {
  const value = Number.parseInt(hex.replace('#', ''), 16)
  return rgb(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255)
}

export function clipLabel(clip: string, template: GarmentTemplate): string {
  if (clip === CLIP_GARMENT) return 'whole garment'
  if (clip === CLIP_NONE) return 'no clipping'
  return template.zones.find((z) => zoneClip(z.id) === clip)?.label.toLowerCase() ?? 'whole garment'
}

function describeLayer(layer: Layer, template: GarmentTemplate): string {
  const details =
    layer.type === 'text'
      ? `text "${layer.text.replace(/\s+/g, ' ')}", ${layer.fontFamily} ${layer.fontSize}${layer.fontWeight === 'bold' ? ' bold' : ''}, ${layer.fill}`
      : `image ${layer.width}x${layer.height}`
  const transform = [
    `scale ${Math.round(layer.scale * 100)}%`,
    layer.rotation ? `rotation ${Math.round((layer.rotation * 180) / Math.PI)} deg` : null,
    layer.opacity < 1 ? `opacity ${Math.round(layer.opacity * 100)}%` : null,
    `clip: ${clipLabel(layer.clip, template)}`,
    layer.visible ? null : 'hidden'
  ]
    .filter(Boolean)
    .join(', ')
  return `${layer.name} - ${details}; ${transform}`
}

export interface PdfInput {
  doc: DesignDocument
  template: GarmentTemplate
  png: Uint8Array
  pngWidth: number
  pngHeight: number
  createdAt?: Date
}

/** A4 sheet with the rendered design followed by a spec: part colors and layers. */
export async function buildPdf({ doc, template, png, pngWidth, pngHeight, createdAt = new Date() }: PdfInput) {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`${template.name} - StitchLab`)
  pdf.setCreator('StitchLab')
  pdf.setCreationDate(createdAt)

  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y = PAGE_HEIGHT - MARGIN

  const write = (target: PDFPage, text: string, x: number, size: number, font: PDFFont, color = TEXT_COLOR, maxWidth?: number) => {
    let line = toWinAnsi(text)
    if (maxWidth) {
      while (line.length > 1 && font.widthOfTextAtSize(line, size) > maxWidth) line = `${line.slice(0, -2)}~`
    }
    target.drawText(line, { x, y, size, font, color })
  }
  const ensureSpace = (height: number) => {
    if (y - height >= MARGIN) return
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    y = PAGE_HEIGHT - MARGIN
  }

  y -= 18
  write(page, `${template.name} - StitchLab design`, MARGIN, 18, bold)
  y -= 16
  write(page, `Exported ${createdAt.toISOString().slice(0, 10)}`, MARGIN, 10, regular, MUTED_COLOR)
  y -= 16

  const image = await pdf.embedPng(png)
  const contentWidth = PAGE_WIDTH - MARGIN * 2
  const fit = Math.min(contentWidth / pngWidth, IMAGE_MAX_HEIGHT / pngHeight)
  const drawWidth = pngWidth * fit
  const drawHeight = pngHeight * fit
  y -= drawHeight
  page.drawImage(image, { x: MARGIN + (contentWidth - drawWidth) / 2, y, width: drawWidth, height: drawHeight })
  y -= 28

  write(page, 'Part colors', MARGIN, 13, bold)
  y -= ROW_HEIGHT + 2
  const columnWidth = contentWidth / 2
  template.zones.forEach((zone, i) => {
    const column = i % 2
    if (column === 0) ensureSpace(ROW_HEIGHT)
    const x = MARGIN + column * columnWidth
    const color = doc.zoneColors[zone.id] ?? zone.defaultColor
    page.drawRectangle({
      x,
      y: y - 2,
      width: SWATCH,
      height: SWATCH,
      color: hexToRgb(color),
      borderColor: BORDER_COLOR,
      borderWidth: 0.5
    })
    write(page, zone.label, x + SWATCH + 8, 10, regular, TEXT_COLOR, columnWidth - 110)
    write(page, color.toUpperCase(), x + columnWidth - 80, 10, regular, MUTED_COLOR)
    if (column === 1 || i === template.zones.length - 1) y -= ROW_HEIGHT
  })

  y -= 14
  ensureSpace(ROW_HEIGHT * 2)
  write(page, 'Layers', MARGIN, 13, bold)
  y -= ROW_HEIGHT + 2
  if (doc.layers.length === 0) {
    write(page, 'No layers - garment colors only.', MARGIN, 10, regular, MUTED_COLOR)
  }
  ;[...doc.layers].reverse().forEach((layer, i) => {
    ensureSpace(ROW_HEIGHT)
    write(page, `${i + 1}. ${describeLayer(layer, template)}`, MARGIN, 10, regular, TEXT_COLOR, contentWidth)
    y -= ROW_HEIGHT
  })

  return pdf.save()
}
