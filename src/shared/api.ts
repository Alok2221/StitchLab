export const EXPORT_FORMATS = {
  png: { name: 'PNG image', extension: 'png' },
  svg: { name: 'SVG vector', extension: 'svg' },
  pdf: { name: 'PDF document', extension: 'pdf' }
} as const

export type ExportFormat = keyof typeof EXPORT_FORMATS

export interface SaveFileRequest {
  format: ExportFormat
  defaultName: string
  data: Uint8Array | string
}

export interface StitchLabApi {
  platform: string
  versions: {
    electron: string
    chrome: string
    node: string
  }
  /** Shows a save dialog and writes the file. Resolves to the saved path, or null when cancelled. */
  saveFile: (request: SaveFileRequest) => Promise<string | null>
}

export const IPC_SAVE_FILE = 'file:save'
