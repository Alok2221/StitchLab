export interface TemplateZone {
  id: string
  label: string
  path: string
  defaultColor: string
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export const TEMPLATE_CATEGORIES = ['tops', 'bottoms', 'dresses', 'bags', 'footwear'] as const

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number]

export interface GarmentTemplate {
  id: string
  name: string
  category: TemplateCategory
  viewBox: Rect
  zones: TemplateZone[]
  printArea: Rect | null
}

const ZONE_PREFIX = 'zone-'

export function parseTemplate(svgSource: string): GarmentTemplate {
  const doc = new DOMParser().parseFromString(svgSource, 'image/svg+xml')
  const svg = doc.documentElement
  if (svg.nodeName !== 'svg') {
    throw new Error('Garment template is not a valid SVG document')
  }

  const id = svg.getAttribute('data-template-id')
  if (!id) throw new Error('Garment template is missing data-template-id')

  const category = svg.getAttribute('data-category') as TemplateCategory | null
  if (!category || !TEMPLATE_CATEGORIES.includes(category)) {
    throw new Error(`Garment template "${id}" has an unknown data-category: ${category}`)
  }

  const [x, y, width, height] = (svg.getAttribute('viewBox') ?? '0 0 0 0').split(/[\s,]+/).map(Number)

  const zones = Array.from(svg.querySelectorAll(`path[id^="${ZONE_PREFIX}"]`)).map((el) => ({
    id: el.id.slice(ZONE_PREFIX.length),
    label: el.getAttribute('data-label') ?? el.id,
    path: el.getAttribute('d') ?? '',
    defaultColor: el.getAttribute('fill') ?? '#ffffff'
  }))

  const printEl = svg.querySelector('#print-area')
  const printArea = printEl
    ? {
        x: Number(printEl.getAttribute('x')),
        y: Number(printEl.getAttribute('y')),
        width: Number(printEl.getAttribute('width')),
        height: Number(printEl.getAttribute('height'))
      }
    : null

  return {
    id,
    name: svg.getAttribute('data-name') ?? id,
    category,
    viewBox: { x, y, width, height },
    zones,
    printArea
  }
}
