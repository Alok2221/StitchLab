// @vitest-environment happy-dom
import { BufferAttribute, BufferGeometry } from 'three'
import { describe, expect, it } from 'vitest'
import { geometriesToInflatedMesh } from './loadMesh'
import { GARMENT_MESHES, meshSpecFor } from './meshCatalog'
import { garments } from '../templates'

function boxGeometry(min: [number, number, number], max: [number, number, number]): BufferGeometry {
  const [x0, y0, z0] = min
  const [x1, y1, z1] = max
  // Two quads: front (+z) and back (−z), each two triangles.
  const positions = new Float32Array([
    x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1,
    x0, y0, z0, x0, y1, z0, x1, y1, z0, x1, y0, z0
  ])
  const indices = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  return geometry
}

/** Closed box including ±X side walls that sit on the midZ seam. */
function closedBoxGeometry(min: [number, number, number], max: [number, number, number]): BufferGeometry {
  const [x0, y0, z0] = min
  const [x1, y1, z1] = max
  const positions = new Float32Array([
    // front (+z)
    x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1,
    // back (−z)
    x0, y0, z0, x0, y1, z0, x1, y1, z0, x1, y0, z0,
    // +x side
    x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1,
    // −x side
    x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0
  ])
  const indices = [
    0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11, 12, 13, 14, 12, 14, 15
  ]
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  return geometry
}

describe('geometriesToInflatedMesh', () => {
  it('maps the front face to the front group and the back face to the back', () => {
    const mesh = geometriesToInflatedMesh([boxGeometry([-1, -1, -0.2], [1, 1, 0.2])])
    expect(mesh.frontIndexCount).toBe(6)
    expect(mesh.indices.length).toBe(12)
    expect(mesh.positions.length).toBeGreaterThan(0)
    // First front corner is the box min (u=0, v=0).
    expect(mesh.uvs[0]).toBeCloseTo(0)
    expect(mesh.uvs[1]).toBeCloseTo(0)
    expect(mesh.frontSilhouette?.data.some((v) => v > 0)).toBe(true)
    expect(mesh.backSilhouette?.data.some((v) => v > 0)).toBe(true)
  })

  it('duplicates side-seam triangles onto both front and back so the join stays covered', () => {
    // 8 source triangles; the four side-wall triangles straddle midZ and must be drawn twice.
    const mesh = geometriesToInflatedMesh([closedBoxGeometry([-1, -1, -0.5], [1, 1, 0.5])])
    expect(mesh.frontIndexCount).toBeGreaterThan(6)
    expect(mesh.indices.length - mesh.frontIndexCount).toBeGreaterThan(6)
    expect(mesh.indices.length).toBeGreaterThan(24)
  })

  it('rejects an empty cloth list', () => {
    expect(() => geometriesToInflatedMesh([])).toThrow(/no cloth/)
  })
})

describe('meshCatalog', () => {
  it('covers every garment template', () => {
    for (const garment of garments) {
      expect(meshSpecFor(garment.id), garment.id).not.toBeNull()
    }
  })

  it('points every entry at a glb url', () => {
    for (const [id, spec] of Object.entries(GARMENT_MESHES)) {
      expect(spec.url, id).toMatch(/\.glb/)
    }
  })
})
