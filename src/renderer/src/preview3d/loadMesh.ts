import { BufferAttribute, BufferGeometry, Matrix4, Mesh, Vector3, type Object3D } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { InflatedMesh } from './inflate'
import type { GarmentMeshSpec } from './meshCatalog'
import type { SilhouetteMask } from './silhouette'

const loader = new GLTFLoader()
/** Resolution of the UV-space silhouette used to warp the 2D design onto the mesh. */
const SILHOUETTE_SIZE = 768
/**
 * Fraction of the mesh depth duplicated onto both front and back around midZ.
 * A hard midplane cut leaves a jagged hole along every side seam; overlapping
 * that band seals the join so the fabric color covers the silhouette from the side.
 */
const SEAM_OVERLAP = 0.12
/** Extra pixels stamped around each projected triangle so UV edges stay inside the mask. */
const SILHOUETTE_DILATE = 2

function stampTriangle(mask: Uint8Array, size: number, x0: number, y0: number, x1: number, y1: number, x2: number, y2: number) {
  const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)))
  const maxX = Math.min(size - 1, Math.ceil(Math.max(x0, x1, x2)))
  const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)))
  const maxY = Math.min(size - 1, Math.ceil(Math.max(y0, y1, y2)))
  const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
  if (Math.abs(area) < 1e-8) return
  const sign = area > 0 ? 1 : -1
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5
      const py = y + 0.5
      const w0 = ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) * sign
      const w1 = ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)) * sign
      const w2 = ((x0 - px) * (y1 - py) - (x1 - px) * (y0 - py)) * sign
      if (w0 >= 0 && w1 >= 0 && w2 >= 0) mask[y * size + x] = 1
    }
  }
}

/** Grow the binary mask by a few pixels so planar UV samples at triangle edges stay covered. */
function dilateMask(mask: Uint8Array, size: number, radius: number): void {
  if (radius <= 0) return
  const copy = mask.slice()
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (copy[y * size + x] === 0) continue
      const x0 = Math.max(0, x - radius)
      const x1 = Math.min(size - 1, x + radius)
      const y0 = Math.max(0, y - radius)
      const y1 = Math.min(size - 1, y + radius)
      for (let yy = y0; yy <= y1; yy++) {
        for (let xx = x0; xx <= x1; xx++) mask[yy * size + xx] = 1
      }
    }
  }
}

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
    // Drop authored UVs — the 2D design is mapped with planar front/back projection.
    geometry.deleteAttribute('uv')
    geometry.deleteAttribute('uv1')
    geometry.deleteAttribute('normal')
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

type SideBuild = {
  positions: number[]
  uvs: number[]
  indices: number[]
  /** Source vertex index → output vertex index on this side. */
  remap: Map<number, number>
}

function pushSideVert(
  side: SideBuild,
  sourceIndex: number,
  x: number,
  y: number,
  z: number,
  minX: number,
  spanX: number,
  minY: number,
  spanY: number,
  mirrorU: boolean
): number {
  const existing = side.remap.get(sourceIndex)
  if (existing !== undefined) return existing
  const index = side.positions.length / 3
  side.remap.set(sourceIndex, index)
  side.positions.push(x, y, z)
  let u = (x - minX) / spanX
  let v = (y - minY) / spanY
  u = Math.min(1, Math.max(0, u))
  v = Math.min(1, Math.max(0, v))
  if (mirrorU) u = 1 - u
  side.uvs.push(u, v)
  return index
}

/**
 * Merge cloth geometries into the preview mesh format: front-facing triangles
 * use the front texture (planar XY UVs), back-facing use the back texture.
 * Vertices are shared within each side so high-poly GLBs stay manageable.
 */
export function geometriesToInflatedMesh(geometries: BufferGeometry[], spec: GarmentMeshSpec = { url: '' }): InflatedMesh {
  if (geometries.length === 0) throw new Error('Garment mesh has no cloth geometry')

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
    // Non-indexed from collectClothGeometries — still support indexed inputs in tests.
    const index = geometry.getIndex()
    if (index) {
      for (let i = 0; i < index.count; i++) srcIndex.push(index.getX(i) + vertexBase)
    } else {
      for (let i = 0; i < pos.count; i++) srcIndex.push(vertexBase + i)
    }
    vertexBase += pos.count
  }

  const posArr = new Float32Array(positions)
  // If most of the cloth faces −Z (common after Blender/FBX export), turn it around
  // so the front view texture lands on the chest / outer face.
  {
    let netZ = 0
    let area = 0
    for (let t = 0; t < srcIndex.length; t += 3) {
      const i0 = srcIndex[t] * 3
      const i1 = srcIndex[t + 1] * 3
      const i2 = srcIndex[t + 2] * 3
      const ax = posArr[i0]
      const ay = posArr[i0 + 1]
      const az = posArr[i0 + 2]
      const e1x = posArr[i1] - ax
      const e1y = posArr[i1 + 1] - ay
      const e1z = posArr[i1 + 2] - az
      const e2x = posArr[i2] - ax
      const e2y = posArr[i2 + 1] - ay
      const e2z = posArr[i2 + 2] - az
      const cz = e1x * e2y - e1y * e2x
      const cx = e1y * e2z - e1z * e2y
      const cy = e1z * e2x - e1x * e2z
      const a = Math.hypot(cx, cy, cz)
      if (a < 1e-12) continue
      netZ += cz
      area += a
    }
    if (area > 0 && netZ / area < -0.05) {
      for (let i = 0; i < posArr.length; i += 3) {
        posArr[i] *= -1
        posArr[i + 2] *= -1
      }
    }
  }

  const posAttr = new BufferAttribute(posArr, 3)

  const a = new Vector3()
  const b = new Vector3()
  const c = new Vector3()

  // UV frame and front/back split from the bounding box. Side is chosen by depth
  // (z), not only by normal: inward faces of a tote opening point at the camera
  // but sit on the back half — they must not get the front print (or a mirrored seam).
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i)
    const y = posAttr.getY(i)
    const z = posAttr.getZ(i)
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
    minZ = Math.min(minZ, z)
    maxZ = Math.max(maxZ, z)
  }
  const spanX = Math.max(1e-6, maxX - minX)
  const spanY = Math.max(1e-6, maxY - minY)
  const spanZ = Math.max(1e-6, maxZ - minZ)
  const midZ = (minZ + maxZ) / 2
  const seamBand = spanZ * SEAM_OVERLAP

  const front: SideBuild = { positions: [], uvs: [], indices: [], remap: new Map() }
  const back: SideBuild = { positions: [], uvs: [], indices: [], remap: new Map() }
  const frontMask = new Uint8Array(SILHOUETTE_SIZE * SILHOUETTE_SIZE)
  const backMask = new Uint8Array(SILHOUETTE_SIZE * SILHOUETTE_SIZE)

  const planarUv = (x: number, y: number, mirrorU: boolean): [number, number] => {
    let u = (x - minX) / spanX
    let v = (y - minY) / spanY
    u = Math.min(1, Math.max(0, u))
    v = Math.min(1, Math.max(0, v))
    if (mirrorU) u = 1 - u
    return [u, v]
  }

  const addTriangle = (
    side: SideBuild,
    mask: Uint8Array,
    mirrorU: boolean,
    vi0: number,
    vi1: number,
    vi2: number
  ) => {
    side.indices.push(
      pushSideVert(side, vi0, a.x, a.y, a.z, minX, spanX, minY, spanY, mirrorU),
      pushSideVert(side, vi1, b.x, b.y, b.z, minX, spanX, minY, spanY, mirrorU),
      pushSideVert(side, vi2, c.x, c.y, c.z, minX, spanX, minY, spanY, mirrorU)
    )
    const [ua, va] = planarUv(a.x, a.y, mirrorU)
    const [ub, vb] = planarUv(b.x, b.y, mirrorU)
    const [uc, vc] = planarUv(c.x, c.y, mirrorU)
    // ImageData / canvas: y = 0 at the top; mesh v = 1 is the top of the texture.
    stampTriangle(
      mask,
      SILHOUETTE_SIZE,
      ua * SILHOUETTE_SIZE,
      (1 - va) * SILHOUETTE_SIZE,
      ub * SILHOUETTE_SIZE,
      (1 - vb) * SILHOUETTE_SIZE,
      uc * SILHOUETTE_SIZE,
      (1 - vc) * SILHOUETTE_SIZE
    )
  }

  for (let t = 0; t < srcIndex.length; t += 3) {
    const vi0 = srcIndex[t]
    const vi1 = srcIndex[t + 1]
    const vi2 = srcIndex[t + 2]
    a.fromBufferAttribute(posAttr, vi0)
    b.fromBufferAttribute(posAttr, vi1)
    c.fromBufferAttribute(posAttr, vi2)
    // Own the front half plus a band past midZ (and the same for back) so side-facing
    // triangles at the silhouette edge are drawn twice instead of leaving a black gap.
    const triMinZ = Math.min(a.z, b.z, c.z)
    const triMaxZ = Math.max(a.z, b.z, c.z)
    if (triMaxZ >= midZ - seamBand) addTriangle(front, frontMask, false, vi0, vi1, vi2)
    if (triMinZ <= midZ + seamBand) addTriangle(back, backMask, true, vi0, vi1, vi2)
  }

  dilateMask(frontMask, SILHOUETTE_SIZE, SILHOUETTE_DILATE)
  dilateMask(backMask, SILHOUETTE_SIZE, SILHOUETTE_DILATE)

  const frontVertexCount = front.positions.length / 3
  const positionsOut = new Float32Array(front.positions.length + back.positions.length)
  positionsOut.set(front.positions, 0)
  positionsOut.set(back.positions, front.positions.length)

  const uvsOut = new Float32Array(front.uvs.length + back.uvs.length)
  uvsOut.set(front.uvs, 0)
  uvsOut.set(back.uvs, front.uvs.length)

  const indicesOut = new Uint32Array(front.indices.length + back.indices.length)
  indicesOut.set(front.indices, 0)
  for (let i = 0; i < back.indices.length; i++) indicesOut[front.indices.length + i] = back.indices[i] + frontVertexCount

  const frontSilhouette: SilhouetteMask = { width: SILHOUETTE_SIZE, height: SILHOUETTE_SIZE, data: frontMask }
  const backSilhouette: SilhouetteMask = { width: SILHOUETTE_SIZE, height: SILHOUETTE_SIZE, data: backMask }

  return {
    positions: positionsOut,
    uvs: uvsOut,
    indices: indicesOut,
    frontIndexCount: front.indices.length,
    vertexCount: frontVertexCount,
    frontSilhouette,
    backSilhouette
  }
}

/** Load a garment GLB and build planar front/back UVs for the 2D design. */
export async function loadGarmentMesh(spec: GarmentMeshSpec): Promise<InflatedMesh> {
  const gltf = await loader.loadAsync(spec.url)
  const geometries = collectClothGeometries(gltf.scene, spec.keepMaterials)
  return geometriesToInflatedMesh(geometries, spec)
}
