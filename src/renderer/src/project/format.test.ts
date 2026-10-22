import { describe, expect, it } from 'vitest'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { CLIP_GARMENT, createDocument, type DesignDocument, type ImageLayer, type TextLayer } from '../document/model'
import { parseProject, ProjectFormatError, serializeProject } from './format'

const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

const base = { rotation: 0.5, scale: 0.75, opacity: 0.9, visible: true, locked: false, clip: CLIP_GARMENT }

const text: TextLayer = {
  ...base,
  id: 't1',
  type: 'text',
  name: 'Headline',
  x: 120,
  y: 200,
  text: 'STITCH\nLAB',
  fontFamily: 'Impact',
  fontSize: 64,
  fontWeight: 'bold',
  fill: '#c8102e'
}

const image = (id: string): ImageLayer => ({
  ...base,
  id,
  type: 'image',
  name: `Logo ${id}`,
  x: 300,
  y: 250,
  src: PNG_DATA_URL,
  width: 1,
  height: 1
})

function sampleDoc(): DesignDocument {
  const doc = createDocument('hoodie-front', [
    { id: 'body', defaultColor: '#3b3f4a' },
    { id: 'hood', defaultColor: '#3b3f4a' }
  ])
  return { ...doc, zoneColors: { ...doc.zoneColors, body: '#c8102e' }, layers: [text, image('i1'), image('i2')] }
}

function rezip(data: Uint8Array, edit: (json: Record<string, unknown>) => void): Uint8Array {
  const files = unzipSync(data)
  const json = JSON.parse(strFromU8(files['project.json']))
  edit(json)
  files['project.json'] = strToU8(JSON.stringify(json))
  return zipSync(files)
}

describe('project file format', () => {
  it('round-trips a document with text and image layers', async () => {
    const doc = sampleDoc()
    const loaded = parseProject(await serializeProject(doc))
    expect(loaded.doc).toEqual(doc)
  })

  it('stores each distinct image once in assets/', async () => {
    const files = unzipSync(await serializeProject(sampleDoc()))
    const assets = Object.keys(files).filter((name) => name.startsWith('assets/'))
    expect(assets).toHaveLength(1)
    expect(assets[0]).toMatch(/^assets\/[0-9a-f]{24}\.png$/)

    const json = JSON.parse(strFromU8(files['project.json']))
    expect(json.format).toBe('stitchlab-project')
    expect(json.version).toBe(1)
    expect(JSON.stringify(json)).not.toContain('data:image')
  })

  it('keeps an optional thumbnail', async () => {
    const thumbnail = new Uint8Array([1, 2, 3])
    const loaded = parseProject(await serializeProject(sampleDoc(), { thumbnail }))
    expect(loaded.thumbnail).toEqual(thumbnail)
  })

  it('rejects files that are not projects', () => {
    expect(() => parseProject(new Uint8Array([1, 2, 3]))).toThrow(ProjectFormatError)
    expect(() => parseProject(zipSync({ 'other.txt': strToU8('hi') }))).toThrow('not a StitchLab project')
  })

  it('rejects projects from a newer version', async () => {
    const data = rezip(await serializeProject(sampleDoc()), (json) => {
      json.version = 99
    })
    expect(() => parseProject(data)).toThrow('newer version')
  })

  it('rejects missing assets', async () => {
    const files = unzipSync(await serializeProject(sampleDoc()))
    for (const name of Object.keys(files)) if (name.startsWith('assets/')) delete files[name]
    expect(() => parseProject(zipSync(files))).toThrow('is missing')
  })

  it('rejects invalid colors and layers', async () => {
    const data = await serializeProject(sampleDoc())
    const badColor = rezip(data, (json) => {
      ;(json.document as { zoneColors: Record<string, string> }).zoneColors.body = 'red; drop'
    })
    expect(() => parseProject(badColor)).toThrow('invalid part colors')

    const badLayer = rezip(data, (json) => {
      ;(json.document as { layers: Record<string, unknown>[] }).layers[0].x = 'left'
    })
    expect(() => parseProject(badLayer)).toThrow('invalid x')

    const duplicate = rezip(data, (json) => {
      const layers = (json.document as { layers: Record<string, unknown>[] }).layers
      layers[1].id = layers[0].id
    })
    expect(() => parseProject(duplicate)).toThrow('duplicate layer ids')
  })
})
