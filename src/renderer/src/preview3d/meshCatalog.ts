import dressUrl from './meshes/dress.glb?url'
import bootUrl from './meshes/boot.glb?url'
import hoodieUrl from './meshes/hoodie.glb?url'
import sandalUrl from './meshes/sandal.glb?url'
import sneakerUrl from './meshes/sneaker.glb?url'
import toteUrl from './meshes/tote.glb?url'
import trousersUrl from './meshes/trousers.glb?url'
import tshirtUrl from './meshes/tshirt.glb?url'

/**
 * How to turn a GLB into a preview shell: optional material filter, and how to
 * face the mesh toward the camera before planar UVs are built.
 */
export interface GarmentMeshSpec {
  /** Vite URL of the `.glb` file. */
  url: string
  /**
   * Material names to keep. When omitted, every mesh in the file is used.
   */
  keepMaterials?: string[]
  /**
   * Extra rotation in radians applied after world transforms, before UVs.
   * `yaw` turns around Y (side profile for footwear).
   */
  yaw?: number
  roll?: number
}

/**
 * One GLB per garment. Apparel faces the camera on +Z (planar XY UVs).
 * Footwear is yawed so the outer side faces +Z for the side-view templates.
 */
export const GARMENT_MESHES: Record<string, GarmentMeshSpec> = {
  tshirt: { url: tshirtUrl },
  // Source mesh faces −Z; 180° yaw puts the chest toward the front camera (+Z).
  hoodie: { url: hoodieUrl, yaw: Math.PI },
  trousers: { url: trousersUrl },
  dress: { url: dressUrl },
  'tote-bag': { url: toteUrl },
  sneaker: { url: sneakerUrl, yaw: Math.PI / 2 },
  'chelsea-boot': { url: bootUrl, yaw: Math.PI / 2 },
  'slide-sandal': { url: sandalUrl, yaw: Math.PI / 2 }
}

export function meshSpecFor(garmentId: string): GarmentMeshSpec | null {
  return GARMENT_MESHES[garmentId] ?? null
}
