import type { DesignDocument } from '../document/model'
import type { GarmentTemplate } from '../templates/parseTemplate'
import { escapeXml, viewContent } from './svg'

const INK = '#2b2b30'
const MUTED = '#6b6b75'
const FONT = 'Segoe UI, Arial, sans-serif'
/** Chromium refuses larger canvases; stay well below its limits. */
const MAX_PNG_SIDE = 16000
const MAX_PNG_AREA = 120_000_000

/** One row of the sheet: the design in one colorway. */
export interface LookbookRow {
  /** Colorway name shown above the row; omitted for a design with one colorway. */
  name: string | null
  doc: DesignDocument
}

export interface Lookbook {
  svg: string
  width: number
  height: number
}

const round = (n: number) => Math.round(n * 100) / 100

/** Positions on the sheet, in template units. */
function layout(views: GarmentTemplate[], rowNames: (string | null)[]) {
  const cellWidth = Math.max(...views.map((v) => v.viewBox.width))
  const cellHeight = Math.max(...views.map((v) => v.viewBox.height))
  const unit = Math.max(cellWidth, cellHeight) / 20
  const gap = unit * 2
  const margin = unit * 2
  const titleSize = unit * 1.3
  const labelSize = unit * 0.75
  const viewLabels = views.length > 1

  const titleY = margin + titleSize
  let y = titleY + titleSize * 0.8
  const rows = rowNames.map((name) => {
    y += gap * 0.6
    let nameY = null
    if (name) {
      nameY = y + labelSize
      y = nameY + labelSize * 0.6
    }
    const top = y
    y += cellHeight + (viewLabels ? labelSize * 1.8 : 0)
    return { nameY, top }
  })
  return {
    cellWidth,
    cellHeight,
    gap,
    margin,
    titleSize,
    labelSize,
    viewLabels,
    titleY,
    rows,
    cellX: (column: number) => margin + column * (cellWidth + gap),
    width: Math.ceil(margin * 2 + views.length * cellWidth + (views.length - 1) * gap),
    height: Math.ceil(y + margin)
  }
}

/** Size of the sheet in template units, without rendering it. */
export function lookbookSize(views: GarmentTemplate[], rowNames: (string | null)[]): { width: number; height: number } {
  const { width, height } = layout(views, rowNames)
  return { width, height }
}

/**
 * One SVG sheet with every view side by side and one row per colorway,
 * titled with the garment name. Sizes are in template units.
 */
export function lookbookSvg(views: GarmentTemplate[], rows: LookbookRow[], options: { background: string | null }): Lookbook {
  if (views.length === 0 || rows.length === 0) throw new Error('Nothing to export')
  const l = layout(views, rows.map((r) => r.name))
  const defs: string[] = []
  const body: string[] = []
  const text = (x: number, y: number, size: number, value: string, attrs: string) =>
    body.push(
      `<text x="${round(x)}" y="${round(y)}" font-family="${FONT}" font-size="${round(size)}"${attrs}>${escapeXml(value)}</text>`
    )

  text(l.margin, l.titleY, l.titleSize, views[0].name, ` font-weight="bold" fill="${INK}"`)
  rows.forEach((row, r) => {
    const { nameY, top } = l.rows[r]
    if (row.name && nameY !== null) text(l.margin, nameY, l.labelSize, row.name, ` font-weight="bold" fill="${INK}"`)
    views.forEach((view, c) => {
      const x = l.cellX(c)
      const { x: vx, y: vy, width: vw, height: vh } = view.viewBox
      const content = viewContent(row.doc, view, `r${r}v${c}-`)
      if (content.defs) defs.push(content.defs)
      body.push(
        `<svg x="${round(x)}" y="${round(top)}" width="${l.cellWidth}" height="${l.cellHeight}" viewBox="${vx} ${vy} ${vw} ${vh}">`,
        content.body,
        '</svg>'
      )
      if (l.viewLabels) {
        const labelY = top + l.cellHeight + l.labelSize * 1.4
        text(x + l.cellWidth / 2, labelY, l.labelSize, view.viewLabel, ` text-anchor="middle" fill="${MUTED}"`)
      }
    })
  })

  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${l.width} ${l.height}" width="${l.width}" height="${l.height}">`,
    `<title>${escapeXml(views[0].name)} lookbook - StitchLab</title>`
  ]
  if (defs.length > 0) parts.push(`<defs>${defs.join('')}</defs>`)
  if (options.background) parts.push(`<rect width="${l.width}" height="${l.height}" fill="${escapeXml(options.background)}" />`)
  parts.push(...body, '</svg>')
  return { svg: parts.join('\n'), width: l.width, height: l.height }
}

/** The requested PNG scale, reduced when the sheet would not fit in a canvas. */
export function lookbookScale(width: number, height: number, requested: number): number {
  return Math.min(requested, MAX_PNG_SIDE / Math.max(width, height), Math.sqrt(MAX_PNG_AREA / (width * height)))
}
