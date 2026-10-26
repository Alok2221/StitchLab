import type { GarmentTemplate } from '../templates/parseTemplate'
import { CLIP_GARMENT, CLIP_NONE, zoneClip, type Layer, type LayerPatch } from './model'

/** Offset of a duplicate on the same view, in template units. */
export const DUPLICATE_OFFSET = 16

/**
 * Where a layer lands when it is copied or moved from one view to another:
 * - onto a mirrored view: mirrored left to right, so a logo by the heel stays by the heel,
 * - between views with print areas: the same spot relative to the print area,
 * - otherwise: the same coordinates.
 * A clip to a part the target view does not have falls back to the whole garment.
 */
export function placeOnView(layer: Layer, from: GarmentTemplate, to: GarmentTemplate): LayerPatch {
  const clip =
    layer.clip === CLIP_GARMENT || layer.clip === CLIP_NONE || to.zones.some((z) => zoneClip(z.id) === layer.clip)
      ? layer.clip
      : CLIP_GARMENT
  const placed = { view: to.view, x: layer.x, y: layer.y, rotation: layer.rotation, clip }
  if (from.view === to.view) return placed

  if (to.mirrorOf === from.view || from.mirrorOf === to.view) {
    const axis = from.viewBox.x + from.viewBox.width / 2
    return { ...placed, x: 2 * axis - layer.x, rotation: -layer.rotation }
  }

  const a = from.printArea
  const b = to.printArea
  if (a && b) {
    return {
      ...placed,
      x: b.x + ((layer.x - a.x) / a.width) * b.width,
      y: b.y + ((layer.y - a.y) / a.height) * b.height
    }
  }
  return placed
}
