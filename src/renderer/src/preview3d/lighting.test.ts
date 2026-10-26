import { describe, expect, it } from 'vitest'
import { isWarmer, LIGHTING_PRESETS } from './lighting'

describe('LIGHTING_PRESETS', () => {
  it('has studio, soft and outdoor', () => {
    expect(Object.keys(LIGHTING_PRESETS)).toEqual(['studio', 'soft', 'outdoor'])
  })

  it('makes studio the punchiest key light, soft the flattest', () => {
    const { studio, soft, outdoor } = LIGHTING_PRESETS
    expect(studio.key.intensity).toBeGreaterThan(soft.key.intensity)
    expect(outdoor.key.intensity).toBeGreaterThan(studio.key.intensity)
    expect(soft.fill.intensity).toBeGreaterThan(soft.key.intensity)
    expect(soft.floorOpacity).toBeLessThan(studio.floorOpacity)
  })

  it('makes outdoor sunlight warmer than the sky fill', () => {
    const { outdoor, studio } = LIGHTING_PRESETS
    expect(isWarmer(outdoor.key.color, outdoor.fill.color)).toBe(true)
    expect(isWarmer(outdoor.key.color, studio.key.color)).toBe(true)
  })

  it('keeps a dark backdrop so the editor chrome does not change', () => {
    for (const preset of Object.values(LIGHTING_PRESETS)) {
      expect(preset.background.startsWith('#')).toBe(true)
      expect(preset.key.shadow).toBe(true)
    }
  })
})
