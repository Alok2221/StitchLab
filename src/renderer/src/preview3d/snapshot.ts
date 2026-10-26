import type { CameraPreset } from './viewer'

export const SNAPSHOT_SIDES = [1024, 2048, 4096] as const
export const DEFAULT_SNAPSHOT_SIDE = 2048

/** Pixel size of a 3D snapshot: `longSide` on the longer edge, limited by the GPU. */
export function snapshotSize(aspect: number, longSide: number, maxTexture = 8192): { width: number; height: number } {
  const width = aspect >= 1 ? longSide : Math.max(1, Math.round(longSide * aspect))
  const height = aspect >= 1 ? Math.max(1, Math.round(longSide / aspect)) : longSide
  const scale = Math.min(1, maxTexture / width, maxTexture / height)
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** File name stem, e.g. `tshirt-3d-front` or `tshirt-3d-view` after a free orbit. */
export function snapshotFileStem(garmentId: string, preset: CameraPreset | null): string {
  const camera = preset === 'three-quarter' ? '34' : (preset ?? 'view')
  return `${garmentId}-3d-${camera}`
}

/** PNG bytes of a `data:image/png;base64,...` URL produced by a canvas. */
export function pngFromDataUrl(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',')
  if (comma < 0 || !dataUrl.startsWith('data:image/png')) throw new Error('PNG encoding failed')
  const binary = atob(dataUrl.slice(comma + 1))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
