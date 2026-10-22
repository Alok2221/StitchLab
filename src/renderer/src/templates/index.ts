import tshirtFront from './tshirt-front.svg?raw'
import hoodieFront from './hoodie-front.svg?raw'
import trousersFront from './trousers-front.svg?raw'
import dressFront from './dress-front.svg?raw'
import toteBag from './tote-bag.svg?raw'
import sneakerSide from './sneaker-side.svg?raw'
import chelseaBootSide from './chelsea-boot-side.svg?raw'
import slideSandalSide from './slide-sandal-side.svg?raw'
import { parseTemplate, type GarmentTemplate, type TemplateCategory } from './parseTemplate'

export const templateSources: Record<string, string> = {
  'tshirt-front.svg': tshirtFront,
  'hoodie-front.svg': hoodieFront,
  'trousers-front.svg': trousersFront,
  'dress-front.svg': dressFront,
  'tote-bag.svg': toteBag,
  'sneaker-side.svg': sneakerSide,
  'chelsea-boot-side.svg': chelseaBootSide,
  'slide-sandal-side.svg': slideSandalSide
}

export const templates: GarmentTemplate[] = Object.values(templateSources).map(parseTemplate)

const byId = new Map(templates.map((t) => [t.id, t]))

export const defaultTemplate = templates[0]

export function getTemplate(id: string): GarmentTemplate {
  return byId.get(id) ?? defaultTemplate
}

export const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  tops: 'Tops',
  bottoms: 'Bottoms',
  dresses: 'Dresses',
  bags: 'Bags',
  footwear: 'Footwear'
}

export function templateThumbnail(template: GarmentTemplate): string {
  const { x, y, width, height } = template.viewBox
  const paths = template.zones
    .map((z) => `<path d="${z.path}" fill="${z.defaultColor}" stroke="#2b2b30" stroke-width="4" />`)
    .join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${width} ${height}">${paths}</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export { TEMPLATE_CATEGORIES } from './parseTemplate'
export type { GarmentTemplate, TemplateZone, TemplateCategory, Rect } from './parseTemplate'
