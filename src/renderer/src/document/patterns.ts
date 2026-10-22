import type { PatternKind, ZonePattern } from './model'

/** Base tile edge of the geometric patterns, in template units. */
export const PATTERN_TILE = 24
/** Long side of an image pattern tile at scale 1, in template units. */
export const IMAGE_TILE = 120
export const MIN_PATTERN_SCALE = 0.25
export const MAX_PATTERN_SCALE = 4

export const PATTERN_LABELS: Record<PatternKind, string> = {
  stripes: 'Stripes',
  checks: 'Checks',
  dots: 'Dots',
  grid: 'Grid',
  image: 'Image'
}

const esc = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const round = (n: number) => Math.round(n * 1000) / 1000

export interface PatternTile {
  width: number
  height: number
  /** SVG markup of one tile in tile units, base color included. */
  body: string
}

export function patternTile(pattern: ZonePattern, base: string): PatternTile {
  const T = PATTERN_TILE
  const h = T / 2
  const background = (w: number, hh: number) => `<rect width="${w}" height="${hh}" fill="${esc(base)}"/>`

  if (pattern.kind === 'image') {
    const fit = IMAGE_TILE / Math.max(pattern.width, pattern.height, 1)
    const width = round(pattern.width * fit)
    const height = round(pattern.height * fit)
    return {
      width,
      height,
      body: `${background(width, height)}<image href="${esc(pattern.src)}" width="${width}" height="${height}" preserveAspectRatio="none"/>`
    }
  }

  const ink = esc(pattern.color)
  const shapes: Record<Exclude<PatternKind, 'image'>, string> = {
    stripes: `<rect width="${h}" height="${T}" fill="${ink}"/>`,
    checks: `<rect width="${h}" height="${T}" fill="${ink}" fill-opacity="0.5"/><rect width="${T}" height="${h}" fill="${ink}" fill-opacity="0.5"/>`,
    dots: `<circle cx="${T / 4}" cy="${T / 4}" r="3.5" fill="${ink}"/><circle cx="${(3 * T) / 4}" cy="${(3 * T) / 4}" r="3.5" fill="${ink}"/>`,
    grid: `<path d="M0 0.75H${T}M0.75 0V${T}" stroke="${ink}" stroke-width="1.5" fill="none"/>`
  }
  return { width: T, height: T, body: background(T, T) + shapes[pattern.kind] }
}

export function patternTransform(pattern: ZonePattern): string {
  const parts = []
  if (pattern.angle) parts.push(`rotate(${round(pattern.angle)})`)
  if (pattern.scale !== 1) parts.push(`scale(${round(pattern.scale)})`)
  return parts.join(' ')
}

/** `<pattern>` element tiling in template space, for SVG export and thumbnails. */
export function patternDef(id: string, pattern: ZonePattern, base: string): string {
  const tile = patternTile(pattern, base)
  const transform = patternTransform(pattern)
  return (
    `<pattern id="${esc(id)}" patternUnits="userSpaceOnUse" width="${tile.width}" height="${tile.height}"` +
    `${transform ? ` patternTransform="${transform}"` : ''}>${tile.body}</pattern>`
  )
}

/** One tile as a standalone SVG rendered at `resolution` pixels per unit, for the canvas texture. */
export function tileSvg(pattern: ZonePattern, base: string, resolution: number): { svg: string; width: number; height: number } {
  const tile = patternTile(pattern, base)
  const width = Math.max(1, Math.round(tile.width * resolution))
  const height = Math.max(1, Math.round(tile.height * resolution))
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${tile.width} ${tile.height}" preserveAspectRatio="none">${tile.body}</svg>`,
    width,
    height
  }
}

export function describePattern(pattern: ZonePattern): string {
  const details = pattern.kind === 'image' ? `image ${pattern.width}x${pattern.height}` : `${pattern.kind} ${pattern.color.toUpperCase()}`
  const angle = pattern.angle ? `, ${Math.round(pattern.angle)} deg` : ''
  return `${details}, ${Math.round(pattern.scale * 100)}%${angle}`
}

/** Readable ink for a new geometric pattern on the given base color. */
export function contrastInk(base: string): string {
  const value = Number.parseInt(base.replace('#', ''), 16)
  const luminance = 0.299 * ((value >> 16) & 255) + 0.587 * ((value >> 8) & 255) + 0.114 * (value & 255)
  return luminance > 140 ? '#1f1f22' : '#f4f4f2'
}

export function clampPatternScale(scale: number): number {
  return Math.min(MAX_PATTERN_SCALE, Math.max(MIN_PATTERN_SCALE, scale))
}
