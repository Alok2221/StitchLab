// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { CLIP_GARMENT, createDocument, type TextLayer } from '../document/model'
import { getGarment } from '../templates'
import { adoptDocument, fileStem } from './actions'

const text = (id: string, view: string): TextLayer => ({
  id,
  type: 'text',
  name: id,
  view,
  x: 0,
  y: 0,
  rotation: 0,
  scale: 1,
  opacity: 1,
  visible: true,
  locked: false,
  clip: CLIP_GARMENT,
  text: 'Hi',
  fontFamily: 'Arial',
  fontSize: 32,
  fontWeight: 'bold',
  fill: '#000000'
})

describe('adoptDocument', () => {
  it('keeps saved colors and fills in parts of every view missing from the file', () => {
    const garment = getGarment('hoodie')
    const doc = { ...createDocument(garment.id, []), zoneColors: { body: '#c8102e', removed: '#000000' } }
    const adopted = adoptDocument(doc)
    expect(adopted.zoneColors.body).toBe('#c8102e')
    const filled = garment.zones.find((z) => z.id !== 'body')!
    expect(adopted.zoneColors[filled.id]).toBe(filled.defaultColor)
    expect(Object.keys(adopted.zoneColors).sort()).toEqual(garment.zones.map((z) => z.id).sort())
    expect(adopted.zoneColors).not.toHaveProperty('removed')
  })

  it('maps older template ids to garments and puts their layers on the first view', () => {
    const doc = { ...createDocument('sneaker-side', []), layers: [text('a', ''), text('b', 'inner'), text('c', 'top')] }
    const adopted = adoptDocument(doc)
    expect(adopted.templateId).toBe('sneaker')
    expect(adopted.layers.map((l) => l.view)).toEqual(['outer', 'inner', 'outer'])
  })

  it('rejects projects that use an unknown template', () => {
    expect(() => adoptDocument(createDocument('ball-gown', []))).toThrow('unknown template')
  })
})

describe('fileStem', () => {
  it('returns the file name without the project extension', () => {
    expect(fileStem('C:\\Users\\me\\Documents\\Summer drop.stitch')).toBe('Summer drop')
    expect(fileStem('/home/me/merch.STITCH')).toBe('merch')
    expect(fileStem(null)).toBeNull()
  })
})
