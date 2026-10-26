export interface RasterOptions {
  width: number
  height: number
  scale: number
}

/** Draws an SVG string onto a new canvas using the browser's SVG renderer. */
export async function svgToCanvas(svg: string, { width, height, scale }: RasterOptions): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context is not available')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Renders an SVG string to PNG bytes using the browser's SVG renderer. */
export async function svgToPng(svg: string, options: RasterOptions): Promise<Uint8Array> {
  const canvas = await svgToCanvas(svg, options)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('PNG encoding failed')
  return new Uint8Array(await blob.arrayBuffer())
}
