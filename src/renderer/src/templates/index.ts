import tshirtFront from './tshirt-front.svg?raw'
import tshirtBack from './tshirt-back.svg?raw'
import hoodieFront from './hoodie-front.svg?raw'
import hoodieBack from './hoodie-back.svg?raw'
import trousersFront from './trousers-front.svg?raw'
import trousersBack from './trousers-back.svg?raw'
import dressFront from './dress-front.svg?raw'
import dressBack from './dress-back.svg?raw'
import toteBag from './tote-bag.svg?raw'
import sneakerSide from './sneaker-side.svg?raw'
import chelseaBootSide from './chelsea-boot-side.svg?raw'
import slideSandalSide from './slide-sandal-side.svg?raw'
import type { ZonePattern } from '../document/model'
import { patternDef } from '../document/patterns'
import {
  deriveView,
  parseTemplate,
  type GarmentTemplate,
  type TemplateCategory,
  type TemplateZone
} from './parseTemplate'

export const templateSources: Record<string, string> = {
  'tshirt-front.svg': tshirtFront,
  'tshirt-back.svg': tshirtBack,
  'hoodie-front.svg': hoodieFront,
  'hoodie-back.svg': hoodieBack,
  'trousers-front.svg': trousersFront,
  'trousers-back.svg': trousersBack,
  'dress-front.svg': dressFront,
  'dress-back.svg': dressBack,
  'tote-bag.svg': toteBag,
  'sneaker-side.svg': sneakerSide,
  'chelsea-boot-side.svg': chelseaBootSide,
  'slide-sandal-side.svg': slideSandalSide
}

const parsed = Object.fromEntries(Object.entries(templateSources).map(([file, svg]) => [file, parseTemplate(svg)]))
const innerSide = (file: string) => deriveView(parsed[file], 'inner', 'Inner side', { mirror: true })

/** A garment with all its views. Part colors and patterns are shared between views by part id. */
export interface Garment {
  id: string
  name: string
  category: TemplateCategory
  views: GarmentTemplate[]
  /** Every part of every view, in first-seen order. */
  zones: TemplateZone[]
}

function garment(views: GarmentTemplate[]): Garment {
  const zones = new Map<string, TemplateZone>()
  for (const view of views) for (const zone of view.zones) if (!zones.has(zone.id)) zones.set(zone.id, zone)
  const [first] = views
  return { id: first.id, name: first.name, category: first.category, views, zones: [...zones.values()] }
}

export const garments: Garment[] = [
  garment([parsed['tshirt-front.svg'], parsed['tshirt-back.svg']]),
  garment([parsed['hoodie-front.svg'], parsed['hoodie-back.svg']]),
  garment([parsed['trousers-front.svg'], parsed['trousers-back.svg']]),
  garment([parsed['dress-front.svg'], parsed['dress-back.svg']]),
  garment([parsed['tote-bag.svg'], deriveView(parsed['tote-bag.svg'], 'back', 'Back')]),
  garment([parsed['sneaker-side.svg'], innerSide('sneaker-side.svg')]),
  garment([parsed['chelsea-boot-side.svg'], innerSide('chelsea-boot-side.svg')]),
  garment([parsed['slide-sandal-side.svg'], innerSide('slide-sandal-side.svg')])
]

const byId = new Map(garments.map((g) => [g.id, g]))

/** Template ids used by project files saved before garments had several views. */
export const LEGACY_GARMENT_IDS: Record<string, string> = {
  'tshirt-front': 'tshirt',
  'hoodie-front': 'hoodie',
  'trousers-front': 'trousers',
  'dress-front': 'dress',
  'sneaker-side': 'sneaker',
  'chelsea-boot-side': 'chelsea-boot',
  'slide-sandal-side': 'slide-sandal'
}

export const defaultGarment = garments[0]

export function hasGarment(id: string): boolean {
  return byId.has(id)
}

export function getGarment(id: string): Garment {
  return byId.get(id) ?? defaultGarment
}

/** One view of a garment; falls back to the first view. */
export function getTemplate(garmentId: string, viewId?: string): GarmentTemplate {
  const { views } = getGarment(garmentId)
  return views.find((v) => v.view === viewId) ?? views[0]
}

export const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  tops: 'Tops',
  bottoms: 'Bottoms',
  dresses: 'Dresses',
  bags: 'Bags',
  footwear: 'Footwear'
}

export function templateThumbnail(
  template: GarmentTemplate,
  colors: Record<string, string> = {},
  patterns: Record<string, ZonePattern> = {}
): string {
  const { x, y, width, height } = template.viewBox
  let defs = ''
  const paths = template.zones
    .map((z, i) => {
      const color = colors[z.id] ?? z.defaultColor
      const pattern = patterns[z.id]
      if (pattern) defs += patternDef(`p${i}`, pattern, color)
      return `<path d="${z.path}" fill="${pattern ? `url(#p${i})` : color}" stroke="#2b2b30" stroke-width="4" />`
    })
    .join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${width} ${height}">${defs ? `<defs>${defs}</defs>` : ''}${paths}</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export { TEMPLATE_CATEGORIES, mirrorPath } from './parseTemplate'
export type { GarmentTemplate, TemplateZone, TemplateCategory, Rect } from './parseTemplate'
