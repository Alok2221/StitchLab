import {
  BufferAttribute,
  BufferGeometry,
  Float32BufferAttribute,
  Matrix4,
  Mesh,
  Vector3,
  type Object3D
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { InflatedMesh } from './inflate'
import type { GarmentMeshSpec } from './meshCatalog'

const loader = new GLTFLoader()

function materialName(mesh: Mesh): string {
  const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
  return mat?.name ?? ''
}

/** Cloth meshes from a loaded scene, with world transforms baked in. */
export function collectClothGeometries(root: Object3D, keepMaterials?: string[]): BufferGeometry[] {
  root.updateMatrixWorld(true)
  const keep = keepMaterials ? new Set(keepMaterials) : null
  const out: BufferGeometry[] = []
  root.traverse((obj) => {
    if (!(obj instanceof Mesh) || !obj.geometry) return
    if (keep && !keep.has(materialName(obj))) return
    const geometry = obj.geometry.clone()
    geometry.applyMatrix4(obj.matrixWorld)
    out.push(geometry)
  })
  return out
}

function applyOrientation(geometry: BufferGeometry, spec: GarmentMeshSpec): void {
  const m = new Matrix4()
  if (spec.yaw) m.makeRotationY(spec.yaw)
  if (spec.roll) m.multiply(new Matrix4().makeRotationZ(spec.roll))
  if (spec.yaw || spec.roll) geometry.applyMatrix4(m)
}

/**
 * Merge cloth geometries into the preview mesh format: front-facing triangles
 * use the front texture (planar XY UVs), back-facing use the back texture.
 */
export function geometriesToInflatedMesh(geometries: BufferGeometry[], spec: GarmentMeshSpec = { url: '' }): InflatedMesh {
  if (geometries.length === 0) throw new Error('Garment mesh has no cloth geometry')

  const merged = new BufferGeometry()
  const positions: number[] = []
  const srcIndex: number[] = []
  let vertexBase = 0

  for (const geometry of geometries) {
    applyOrientation(geometry, spec)
    const pos = geometry.getAttribute('position')
    if (!pos) continue
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i))
    }
    const index = geometry.getIndex()
    if (index) {
      for (let i = 0; i < index.count; i++) srcIndex.push(index.getX(i) + vertexBase)
    } else {
      for (let i = 0; i < pos.count; i++) srcIndex.push(vertexBase + i)
    }
    vertexBase += pos.count
  }

  merged.setAttribute('position', new Float32BufferAttribute(positions, 3))
  merged.setIndex(srcIndex)

  const posAttr = merged.getAttribute('position') as BufferAttribute

  const a = new Vector3()
  const b = new Vector3()
  const c = new Vector3()
  const ab = new Vector3()
  const ac = new Vector3()
  const normal = new Vector3()

  // UV bounds from faces that look toward the camera (±Z), so side walls do not
  // inflate the frame and push the design into a smaller island with empty margins.
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  let facingHits = 0
  for (let t = 0; t < srcIndex.length; t += 3) {
    a.fromBufferAttribute(posAttr, srcIndex[t])
    b.fromBufferAttribute(posAttr, srcIndex[t + 1])
    c.fromBufferAttribute(posAttr, srcIndex[t + 2])
    ab.subVectors(b, a)
    ac.subVectors(c, a)
    normal.crossVectors(ab, ac)
    if (Math.abs(normal.z) < Math.abs(normal.x) && Math.abs(normal.z) < Math.abs(normal.y)) continue
    facingHits++
    for (const v of [a, b, c]) {
      minX = Math.min(minX, v.x)
      maxX = Math.max(maxX, v.x)
      minY = Math.min(minY, v.y)
      maxY = Math.max(maxY, v.y)
    }
  }
  if (facingHits === 0) {
    for (let i = 0; i < posAttr.count; i++) {
      minX = Math.min(minX, posAttr.getX(i))
      maxX = Math.max(maxX, posAttr.getX(i))
      minY = Math.min(minY, posAttr.getY(i))
      maxY = Math.max(maxY, posAttr.getY(i))
    }
  }
  const spanX = Math.max(1e-6, maxX - minX)
  const spanY = Math.max(1e-6, maxY - minY)

  const frontPositions: number[] = []
  const backPositions: number[] = []
  const frontUvs: number[] = []
  const backUvs: number[] = []
  const frontIndices: number[] = []
  const backIndices: number[] = []

  const pushVert = (
    positionsOut: number[],
    uvsOut: number[],
    indicesOut: number[],
    vertex: Vector3,
    mirrorU: boolean
  ) => {
    const index = positionsOut.length / 3
    positionsOut.push(vertex.x, vertex.y, vertex.z)
    // Clamp so rim triangles just outside the facing frame still sample the cloth edge.
    let u = (vertex.x - minX) / spanX
    let v = (vertex.y - minY) / spanY
    u = Math.min(1, Math.max(0, u))
    v = Math.min(1, Math.max(0, v))
    if (mirrorU) u = 1 - u
    uvsOut.push(u, v)
    indicesOut.push(index)
  }

  for (let t = 0; t < srcIndex.length; t += 3) {
    const i0 = srcIndex[t]
    const i1 = srcIndex[t + 1]
    const i2 = srcIndex[t + 2]
    a.fromBufferAttribute(posAttr, i0)
    b.fromBufferAttribute(posAttr, i1)
    c.fromBufferAttribute(posAttr, i2)
    ab.subVectors(b, a)
    ac.subVectors(c, a)
    normal.crossVectors(ab, ac)
    const front = normal.z >= 0
    const positionsOut = front ? frontPositions : backPositions
    const uvsOut = front ? frontUvs : backUvs
    const indicesOut = front ? frontIndices : backIndices
    // Back view texture is drawn as seen from behind; mirror U so logos read correctly.
    const mirrorU = !front
    pushVert(positionsOut, uvsOut, indicesOut, a, mirrorU)
    pushVert(positionsOut, uvsOut, indicesOut, b, mirrorU)
    pushVert(positionsOut, uvsOut, indicesOut, c, mirrorU)
  }

  const frontVertexCount = frontPositions.length / 3
  const positionsOut = new Float32Array(frontPositions.length + backPositions.length)
  positionsOut.set(frontPositions, 0)
  positionsOut.set(backPositions, frontPositions.length)

  const uvsOut = new Float32Array(frontUvs.length + backUvs.length)
  uvsOut.set(frontUvs, 0)
  uvsOut.set(backUvs, frontUvs.length)

  const indicesOut = new Uint32Array(frontIndices.length + backIndices.length)
  indicesOut.set(frontIndices, 0)
  for (let i = 0; i < backIndices.length; i++) indicesOut[frontIndices.length + i] = backIndices[i] + frontVertexCount

  return {
    positions: positionsOut,
    uvs: uvsOut,
    indices: indicesOut,
    frontIndexCount: frontIndices.length,
    vertexCount: frontVertexCount
  }
}

/** Load a garment GLB, drop the hanger, and build planar front/back UVs. */
export async function loadGarmentMesh(spec: GarmentMeshSpec): Promise<InflatedMesh> {
  const gltf = await loader.loadAsync(spec.url)
  const geometries = collectClothGeometries(gltf.scene, spec.keepMaterials)
  return geometriesToInflatedMesh(geometries, spec)
}
