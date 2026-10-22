import { useRef, type ChangeEvent } from 'react'
import { PATTERN_KINDS, type PatternKind, type ZonePattern } from '../document/model'
import {
  clampPatternScale,
  contrastInk,
  MAX_PATTERN_SCALE,
  MIN_PATTERN_SCALE,
  PATTERN_LABELS
} from '../document/patterns'
import { useCurrentTemplate, useEditor } from '../document/store'
import { notify } from '../project/notice'
import { IMAGE_ACCEPT, readImage } from './readImage'

export function PatternPanel() {
  const template = useCurrentTemplate()
  const zoneId = useEditor((s) => s.selectedZoneId)
  const pattern = useEditor((s) => (s.selectedZoneId ? s.doc.zonePatterns[s.selectedZoneId] : undefined))
  const baseColor = useEditor((s) => (s.selectedZoneId ? s.doc.zoneColors[s.selectedZoneId] : undefined))
  const setZonePattern = useEditor((s) => s.setZonePattern)
  const fileInput = useRef<HTMLInputElement>(null)

  const zone = template.zones.find((z) => z.id === zoneId)
  if (!zone || !zoneId) return null

  const transform = { scale: pattern?.scale ?? 1, angle: pattern?.angle ?? 0 }
  const ink = pattern && pattern.kind !== 'image' ? pattern.color : contrastInk(baseColor ?? zone.defaultColor)

  const choose = (kind: PatternKind | null) => {
    if (kind === null) return setZonePattern(zoneId, null)
    if (kind === 'image') return fileInput.current?.click()
    if (pattern?.kind === kind) return
    setZonePattern(zoneId, { kind, color: ink, ...transform })
  }

  const update = (patch: Partial<ZonePattern>, field: string) => {
    if (pattern) setZonePattern(zoneId, { ...pattern, ...patch } as ZonePattern, `pattern:${zoneId}:${field}`)
  }

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const { src, width, height } = await readImage(file)
      setZonePattern(zoneId, { kind: 'image', src, width, height, ...transform })
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), 'error')
    }
  }

  return (
    <section className="panel-section properties">
      <h2>Pattern - {zone.label}</h2>
      <div className="pattern-kinds">
        <button className={pattern ? '' : 'selected'} onClick={() => choose(null)}>
          None
        </button>
        {PATTERN_KINDS.map((kind) => (
          <button key={kind} className={pattern?.kind === kind ? 'selected' : ''} onClick={() => choose(kind)}>
            {kind === 'image' ? 'Image...' : PATTERN_LABELS[kind]}
          </button>
        ))}
        <input ref={fileInput} type="file" accept={IMAGE_ACCEPT} hidden onChange={onFile} />
      </div>

      {pattern && (
        <>
          {pattern.kind !== 'image' && (
            <label className="field">
              <span>Pattern color</span>
              <input type="color" value={pattern.color} onChange={(e) => update({ color: e.target.value }, 'color')} />
            </label>
          )}
          <label className="field">
            <span>Size {Math.round(pattern.scale * 100)}%</span>
            <input
              type="range"
              min={Math.log2(MIN_PATTERN_SCALE)}
              max={Math.log2(MAX_PATTERN_SCALE)}
              step={0.05}
              value={Math.log2(pattern.scale)}
              onChange={(e) => update({ scale: clampPatternScale(2 ** Number(e.target.value)) }, 'scale')}
            />
          </label>
          <label className="field">
            <span>Angle {Math.round(pattern.angle)}°</span>
            <input
              type="range"
              min={-90}
              max={90}
              step={1}
              value={pattern.angle}
              onChange={(e) => update({ angle: Number(e.target.value) }, 'angle')}
            />
          </label>
        </>
      )}
    </section>
  )
}
