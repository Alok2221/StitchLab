import { describe, expect, it } from 'vitest'
import { CLIP_GARMENT, CLIP_NONE, createDocument, zoneClip, type ImageLayer, type TextLayer } from '../document/model'
import type { GarmentTemplate } from '../templates/parseTemplate'
import { documentToSvg, escapeXml } from './svg'

const template: GarmentTemplate = {
  id: 'test-shirt',
  name: 'Test shirt',
  category: 'tops',
  view: 'front',
  viewLabel: 'Front',
  viewBox: { x: 0, y: 0, width: 200, height: 300 },
  zones: [
    { id: 'body', label: 'Body', path: 'M0 0 L200 0 L200 300 L0 300 Z', defaultColor: '#ffffff' },
    { id: 'collar', label: 'Collar', path: 'M80 0 L120 0 L100 20 Z', defaultColor: '#cccccc' }
  ],
  printArea: null
}

const base = {
  view: 'front',
  rotation: 0,
  scale: 1,
  opacity: 1,
  visible: true,
  locked: false
}

const text: TextLayer = {
  ...base,
  id: 't1',
  type: 'text',
  name: 'Text 1',
  x: 100,
  y: 120,
  clip: CLIP_GARMENT,
  text: 'Tom & <Jerry>',
  fontFamily: 'Arial',
  fontSize: 32,
  fontWeight: 'bold',
  fill: '#c8102e'
}

const image: ImageLayer = {
  ...base,
  id: 'i1',
  type: 'image',
  name: 'Logo',
  x: 50,
  y: 60,
  rotation: Math.PI / 2,
  scale: 0.5,
  clip: zoneClip('body'),
  src: 'data:image/png;base64,AAAA',
  width: 120,
  height: 80
}

function doc(layers = [text, image]) {
  const d = createDocument(template.id, template.zones)
  return { ...d, zoneColors: { ...d.zoneColors, body: '#1d4e89' }, layers }
}

describe('documentToSvg', () => {
  it('draws every garment part with its current color', () => {
    const svg = documentToSvg(doc([]), template)
    expect(svg).toContain('viewBox="0 0 200 300"')
    expect(svg).toMatch(/id="zone-body"[^>]*fill="#1d4e89"/)
    expect(svg).toMatch(/id="zone-collar"[^>]*fill="#cccccc"/)
    expect(svg).not.toContain('<defs>')
  })

  it('escapes text content', () => {
    const svg = documentToSvg(doc([text]), template)
    expect(svg).toContain('Tom &amp; &lt;Jerry&gt;')
    expect(svg).not.toContain('<Jerry>')
  })

  it('writes layer transforms and clip paths', () => {
    const svg = documentToSvg(doc(), template)
    expect(svg).toContain('<clipPath id="clip-garment">')
    expect(svg).toContain('<clipPath id="clip-zone-body">')
    expect(svg).toContain('translate(50 60) rotate(90) scale(0.5)')
    expect(svg).toContain('x="-60" y="-40" width="120" height="80"')
    expect(svg.indexOf('Tom &amp;')).toBeLessThan(svg.indexOf('data:image/png'))
  })

  it('leaves unclipped layers outside clip groups', () => {
    const svg = documentToSvg(doc([{ ...text, clip: CLIP_NONE }]), template)
    expect(svg).not.toContain('clip-path=')
  })

  it('skips hidden layers', () => {
    const svg = documentToSvg(doc([{ ...text, visible: false }]), template)
    expect(svg).not.toContain('<text')
  })

  it('draws only the layers of its view', () => {
    const svg = documentToSvg(doc([text, { ...image, view: 'back' }]), template)
    expect(svg).toContain('<text')
    expect(svg).not.toContain('data:image/png')
    expect(svg).toContain('<title>Test shirt (Front) - StitchLab</title>')
  })

  it('splits multi-line text into centered lines', () => {
    const svg = documentToSvg(doc([{ ...text, text: 'ONE\nTWO' }]), template)
    expect(svg).toContain('<tspan x="0" y="-19.2">ONE</tspan>')
    expect(svg).toContain('<tspan x="0" y="19.2">TWO</tspan>')
  })

  it('fills patterned parts with a tiled pattern over the part color', () => {
    const d = { ...doc([]), zonePatterns: { body: { kind: 'stripes' as const, color: '#ffffff', scale: 2, angle: 45 } } }
    const svg = documentToSvg(d, template)
    expect(svg).toMatch(/id="zone-body"[^>]*fill="url\(#fill-0\)"/)
    expect(svg).toMatch(/id="zone-collar"[^>]*fill="#cccccc"/)
    expect(svg).toContain('<pattern id="fill-0" patternUnits="userSpaceOnUse" width="24" height="24" patternTransform="rotate(45) scale(2)">')
    expect(svg).toContain('<rect width="24" height="24" fill="#1d4e89"/>')
    expect(svg).toContain('<rect width="12" height="24" fill="#ffffff"/>')
  })

  it('tiles image patterns at their aspect ratio', () => {
    const pattern = { kind: 'image' as const, src: 'data:image/png;base64,AAAA', width: 400, height: 200, scale: 1, angle: 0 }
    const svg = documentToSvg({ ...doc([]), zonePatterns: { collar: pattern } }, template)
    expect(svg).toContain('<pattern id="fill-1" patternUnits="userSpaceOnUse" width="120" height="60">')
    expect(svg).toContain('<image href="data:image/png;base64,AAAA" width="120" height="60" preserveAspectRatio="none"/>')
  })

  it('adds an optional background', () => {
    expect(documentToSvg(doc([]), template, { background: '#ffffff' })).toContain('<rect x="0" y="0" width="200" height="300" fill="#ffffff" />')
  })

  it('escapes all XML special characters', () => {
    expect(escapeXml(`a&b<c>d"e'f`)).toBe('a&amp;b&lt;c&gt;d&quot;e&apos;f')
  })
})
