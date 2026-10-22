import {
  defaultZoneColors,
  resolvedColorways,
  type Colorway,
  type ColorwayState,
  type DesignDocument,
  type ZoneFills
} from './model'

export function nextColorwayName(colorways: Colorway[]): string {
  const used = new Set(colorways.map((c) => c.name))
  let n = colorways.length + 1
  while (used.has(`Colorway ${n}`)) n++
  return `Colorway ${n}`
}

const fillsOf = (source: ZoneFills): ZoneFills => ({ zoneColors: source.zoneColors, zonePatterns: source.zonePatterns })

/** Duplicates the active colorway and makes the copy active. */
export function addColorway(doc: DesignDocument, id: string, name = nextColorwayName(doc.colorways)): ColorwayState {
  const colorways = resolvedColorways(doc)
  const copy: Colorway = { id, name, zoneColors: { ...doc.zoneColors }, zonePatterns: { ...doc.zonePatterns } }
  const index = colorways.findIndex((c) => c.id === doc.activeColorwayId) + 1
  return {
    ...fillsOf(copy),
    colorways: [...colorways.slice(0, index), copy, ...colorways.slice(index)],
    activeColorwayId: id
  }
}

export function switchColorway(doc: DesignDocument, id: string): ColorwayState | null {
  if (id === doc.activeColorwayId) return null
  const colorways = resolvedColorways(doc)
  const target = colorways.find((c) => c.id === id)
  if (!target) return null
  return { ...fillsOf(target), colorways, activeColorwayId: id }
}

export function renameColorway(doc: DesignDocument, id: string, name: string): ColorwayState | null {
  const trimmed = name.trim()
  const current = doc.colorways.find((c) => c.id === id)
  if (!current || !trimmed || current.name === trimmed) return null
  return {
    ...fillsOf(doc),
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
    return { ...fillsOf(doc), colorways: remaining, activeColorwayId: doc.activeColorwayId }
  }
  const next = remaining[Math.min(index, remaining.length - 1)]
  return { ...fillsOf(next), colorways: remaining, activeColorwayId: next.id }
}

/**
 * Moves every colorway onto another template: parts with the same id keep
 * their color and pattern, new parts get the template default.
 */
export function remapColorways(
  doc: DesignDocument,
  zones: { id: string; defaultColor: string }[]
): ColorwayState {
  const defaults = defaultZoneColors(zones)
  const remap = (fills: ZoneFills): ZoneFills => ({
    zoneColors: Object.fromEntries(Object.entries(defaults).map(([id, color]) => [id, fills.zoneColors[id] ?? color])),
    zonePatterns: Object.fromEntries(Object.entries(fills.zonePatterns).filter(([id]) => id in defaults))
  })
  const colorways = resolvedColorways(doc).map((c) => ({ ...c, ...remap(c) }))
  const active = colorways.find((c) => c.id === doc.activeColorwayId) ?? colorways[0]
  return { ...fillsOf(active), colorways, activeColorwayId: active.id }
}
