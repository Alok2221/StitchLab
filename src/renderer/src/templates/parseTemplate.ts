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

/** One view of a garment (front, back, outer side ...). `id` is the garment id shared by all its views. */
export interface GarmentTemplate {
  id: string
  name: string
  category: TemplateCategory
  view: string
  viewLabel: string
  viewBox: Rect
  zones: TemplateZone[]
  printArea: Rect | null
  /** The view this one is a left-right mirror of, for views derived with `mirror`. */
  mirrorOf?: string
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

  const view = svg.getAttribute('data-view')
  if (!view) throw new Error(`Garment template "${id}" is missing data-view`)

  return {
    id,
    name: svg.getAttribute('data-name') ?? id,
    category,
    view,
    viewLabel: svg.getAttribute('data-view-label') ?? view,
    viewBox: { x, y, width, height },
    zones,
    printArea
  }
}

const PATH_TOKEN = /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)/g
const PARAMS: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 }

/** Mirrors an SVG path horizontally around the vertical line `x = axis`. */
export function mirrorPath(d: string, axis: number): string {
  const out: string[] = []
  let command = ''
  let args: number[] = []
  const flush = () => {
    const upper = command.toUpperCase()
    const relative = command !== upper
    const n = PARAMS[upper]
    for (let i = 0; i < args.length; i += n) {
      // The first point of a path is absolute even after a lowercase `m`.
      const absolute = !relative || (out.length === 0 && upper === 'M')
      const flipX = (v: number) => (absolute ? 2 * axis - v : -v)
      const p = args.slice(i, i + n)
      if (upper === 'H') p[0] = flipX(p[0])
      else if (upper === 'A') {
        p[2] = -p[2]
        p[4] = 1 - p[4]
        p[5] = flipX(p[5])
      } else if (upper !== 'V') {
        for (let j = 0; j < p.length; j += 2) p[j] = flipX(p[j])
      }
      const name = upper === 'M' && i > 0 ? (relative ? 'l' : 'L') : command
      out.push(name + p.map((v) => Math.round(v * 1000) / 1000).join(' '))
    }
    if (n === 0) out.push(command)
  }
  for (const [, cmd, num] of d.matchAll(PATH_TOKEN)) {
    if (cmd) {
      if (command) flush()
      command = cmd
      args = []
    } else {
      args.push(Number(num))
    }
  }
  if (command) flush()
  return out.join(' ')
}

/** A second view derived from an existing one, optionally mirrored left to right. */
export function deriveView(
  template: GarmentTemplate,
  view: string,
  viewLabel: string,
  options: { mirror?: boolean } = {}
): GarmentTemplate {
  if (!options.mirror) return { ...template, view, viewLabel }
  const { x, width } = template.viewBox
  const axis = x + width / 2
  const area = template.printArea
  return {
    ...template,
    view,
    viewLabel,
    mirrorOf: template.view,
    zones: template.zones.map((z) => ({ ...z, path: mirrorPath(z.path, axis) })),
    printArea: area && { ...area, x: 2 * axis - area.x - area.width }
  }
}
