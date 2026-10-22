import tshirtFront from './tshirt-front.svg?raw'
import { parseTemplate, type GarmentTemplate } from './parseTemplate'

export const templates: GarmentTemplate[] = [parseTemplate(tshirtFront)]

export const defaultTemplate = templates[0]

export type { GarmentTemplate, TemplateZone, Rect } from './parseTemplate'
