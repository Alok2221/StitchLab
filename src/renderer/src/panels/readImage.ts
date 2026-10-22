const FALLBACK_IMAGE_SIZE = 512

export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/svg+xml,image/webp'

export interface LoadedImage {
  src: string
  width: number
  height: number
  name: string
}

/** Reads an image file as a data URL together with its natural size. */
export function readImage(file: File): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => {
      const src = reader.result as string
      const img = new Image()
      img.onerror = () => reject(new Error(`Could not read image ${file.name}`))
      img.onload = () =>
        resolve({
          src,
          width: img.naturalWidth || FALLBACK_IMAGE_SIZE,
          height: img.naturalHeight || FALLBACK_IMAGE_SIZE,
          name: file.name.replace(/\.[^.]+$/, '')
        })
      img.src = src
    }
    reader.readAsDataURL(file)
  })
}
