export type LightingPreset = 'studio' | 'soft' | 'outdoor'

export interface LightSpec {
  color: number
  intensity: number
  position: [number, number, number]
}

export interface Lighting {
  background: string
  hemi: { sky: number; ground: number; intensity: number }
  key: LightSpec & { shadow: boolean }
  fill: LightSpec
  rim: LightSpec
  floorOpacity: number
}

export const LIGHTING_PRESETS: Record<LightingPreset, Lighting> = {
  studio: {
    background: '#2a2b31',
    hemi: { sky: 0xffffff, ground: 0x3a3b44, intensity: 1.1 },
    key: { color: 0xffffff, intensity: 2.2, position: [2.5, 4, 4], shadow: true },
    fill: { color: 0xdfe6ff, intensity: 0.8, position: [-4, 1.5, 2.5] },
    rim: { color: 0xffffff, intensity: 1.4, position: [0, 2.5, -4.5] },
    floorOpacity: 0.28
  },
  soft: {
    background: '#32333a',
    hemi: { sky: 0xfff6ee, ground: 0x6a6b74, intensity: 1.7 },
    key: { color: 0xfff4e8, intensity: 0.9, position: [1.2, 5, 2.5], shadow: true },
    fill: { color: 0xe8eeff, intensity: 1.5, position: [-2.5, 2.5, 2] },
    rim: { color: 0xffffff, intensity: 0.4, position: [0, 2, -3] },
    floorOpacity: 0.1
  },
  outdoor: {
    background: '#2a3038',
    hemi: { sky: 0xcfe8ff, ground: 0x4a4038, intensity: 0.9 },
    key: { color: 0xfff1d0, intensity: 3.4, position: [4.5, 5.5, 1.5], shadow: true },
    fill: { color: 0x7eacd9, intensity: 1.3, position: [-3.5, 1.2, 2] },
    rim: { color: 0xffe4b5, intensity: 0.7, position: [-1, 3, -4] },
    floorOpacity: 0.35
  }
}

export const LIGHTING_LABELS: Record<LightingPreset, string> = {
  studio: 'Studio',
  soft: 'Soft',
  outdoor: 'Outdoor'
}

const red = (color: number) => (color >> 16) & 0xff
const blue = (color: number) => color & 0xff

export function isWarmer(color: number, than: number): boolean {
  return red(color) - blue(color) > red(than) - blue(than)
}
