// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createDocument } from '../document/model'
import { getTemplate } from '../templates'
import { adoptDocument, fileStem } from './actions'

describe('adoptDocument', () => {
  it('keeps saved colors and fills in parts missing from the file', () => {
    const template = getTemplate('hoodie-front')
    const doc = { ...createDocument(template.id, []), zoneColors: { body: '#c8102e', removed: '#000000' } }
    const adopted = adoptDocument(doc)
    expect(adopted.zoneColors.body).toBe('#c8102e')
    expect(adopted.zoneColors.hood).toBe(template.zones.find((z) => z.id === 'hood')!.defaultColor)
    expect(adopted.zoneColors).not.toHaveProperty('removed')
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
