import dressUrl from './meshes/dress.glb?url'
import bootUrl from './meshes/boot.glb?url'
import hoodieUrl from './meshes/hoodie.glb?url'
import sandalUrl from './meshes/sandal.glb?url'
import sneakerUrl from './meshes/sneaker.glb?url'
import toteUrl from './meshes/tote.glb?url'
import trousersUrl from './meshes/trousers.glb?url'
import tshirtUrl from './meshes/tshirt.glb?url'

/**
 * How to turn a downloaded GLB into a preview shell: which materials are cloth
 * (hangers and hooks are dropped), and how to face the mesh toward the camera.
 */
export interface GarmentMeshSpec {
  /** Vite URL of the `.glb` file. */
  url: string
  /**
   * Material names to keep. When omitted, every mesh is kept.
   * Hung garments include a hanger; only the fabric materials are listed.
   */
  keepMaterials?: string[]
  /**
   * Extra rotation in radians applied after world transforms, before UVs.
   * `yaw` turns around Y (side profile for footwear), `roll` around Z
   * (trousers hung from the hem are flipped so the waist sits up).
   */
  yaw?: number
  roll?: number
}

/** One CC0 mesh per garment id; footwear side views face +Z after `yaw`. */
export const GARMENT_MESHES: Record<string, GarmentMeshSpec> = {
  tshirt: { url: tshirtUrl, keepMaterials: ['rust'] },
  hoodie: { url: hoodieUrl, keepMaterials: ['sage', 'shell'] },
  trousers: { url: trousersUrl, keepMaterials: ['navy'], roll: Math.PI },
  dress: { url: dressUrl, keepMaterials: ['rust', 'shell'] },
  'tote-bag': { url: toteUrl },
  sneaker: { url: sneakerUrl, yaw: Math.PI / 2 },
  'chelsea-boot': { url: bootUrl, yaw: Math.PI / 2 },
  'slide-sandal': { url: sandalUrl, yaw: Math.PI / 2 }
}

export function meshSpecFor(garmentId: string): GarmentMeshSpec | null {
  return GARMENT_MESHES[garmentId] ?? null
}
