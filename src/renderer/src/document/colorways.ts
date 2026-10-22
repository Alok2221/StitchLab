import {
  defaultZoneColors,
  resolvedColorways,
  type Colorway,
  type ColorwayState,
  type DesignDocument
} from './model'

export function nextColorwayName(colorways: Colorway[]): string {
  const used = new Set(colorways.map((c) => c.name))
  let n = colorways.length + 1
  while (used.has(`Colorway ${n}`)) n++
  return `Colorway ${n}`
}

/** Duplicates the active colorway and makes the copy active. */
export function addColorway(doc: DesignDocument, id: string, name = nextColorwayName(doc.colorways)): ColorwayState {
  const colorways = resolvedColorways(doc)
  const copy: Colorway = { id, name, zoneColors: { ...doc.zoneColors } }
  const index = colorways.findIndex((c) => c.id === doc.activeColorwayId) + 1
  return {
    zoneColors: copy.zoneColors,
    colorways: [...colorways.slice(0, index), copy, ...colorways.slice(index)],
    activeColorwayId: id
  }
}

export function switchColorway(doc: DesignDocument, id: string): ColorwayState | null {
  if (id === doc.activeColorwayId) return null
  const colorways = resolvedColorways(doc)
  const target = colorways.find((c) => c.id === id)
  if (!target) return null
  return { zoneColors: target.zoneColors, colorways, activeColorwayId: id }
}

export function renameColorway(doc: DesignDocument, id: string, name: string): ColorwayState | null {
  const trimmed = name.trim()
  const current = doc.colorways.find((c) => c.id === id)
  if (!current || !trimmed || current.name === trimmed) return null
  return {
    zoneColors: doc.zoneColors,
    colorways: doc.colorways.map((c) => (c.id === id ? { ...c, name: trimmed } : c)),
    activeColorwayId: doc.activeColorwayId
  }
}

/** Removes a colorway; the last one cannot be removed. */
export function removeColorway(doc: DesignDocument, id: string): ColorwayState | null {
  const colorways = resolvedColorways(doc)
  const index = colorways.findIndex((c) => c.id === id)
  if (index < 0 || colorways.length === 1) return null
  const remaining = colorways.filter((c) => c.id !== id)
  if (id !== doc.activeColorwayId) {
    return { zoneColors: doc.zoneColors, colorways: remaining, activeColorwayId: doc.activeColorwayId }
  }
  const next = remaining[Math.min(index, remaining.length - 1)]
  return { zoneColors: next.zoneColors, colorways: remaining, activeColorwayId: next.id }
}

/**
 * Moves every colorway onto another template: parts with the same id keep
 * their color, new parts get the template default.
 */
export function remapColorways(
  doc: DesignDocument,
  zones: { id: string; defaultColor: string }[]
): ColorwayState {
  const defaults = defaultZoneColors(zones)
  const remap = (colors: Record<string, string>) =>
    Object.fromEntries(Object.entries(defaults).map(([id, color]) => [id, colors[id] ?? color]))
  const colorways = resolvedColorways(doc).map((c) => ({ ...c, zoneColors: remap(c.zoneColors) }))
  const active = colorways.find((c) => c.id === doc.activeColorwayId) ?? colorways[0]
  return { zoneColors: active.zoneColors, colorways, activeColorwayId: active.id }
}
