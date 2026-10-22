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

export interface SaveFilesRequest {
  format: ExportFormat
  files: { name: string; data: Uint8Array | string }[]
}

export interface SavedFiles {
  directory: string
  paths: string[]
}

export interface SaveProjectRequest {
  /** Existing project path; `null` shows a Save As dialog. */
  path: string | null
  defaultName: string
  data: Uint8Array
}

export interface ProjectFile {
  path: string
  data: Uint8Array
}

export interface RecoveryFile {
  data: Uint8Array
  /** Path of the project the unsaved work belongs to, if it was ever saved. */
  path: string | null
  savedAt: number
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
  /** Asks for a folder and writes every file into it without overwriting existing ones. Null when cancelled. */
  saveFiles: (request: SaveFilesRequest) => Promise<SavedFiles | null>
  saveProject: (request: SaveProjectRequest) => Promise<string | null>
  openProject: () => Promise<ProjectFile | null>
  writeRecovery: (data: Uint8Array, path: string | null) => Promise<void>
  readRecovery: () => Promise<RecoveryFile | null>
  clearRecovery: () => Promise<void>
}

export const IPC_SAVE_FILE = 'file:save'
export const IPC_SAVE_FILES = 'file:saveMany'
export const IPC_SAVE_PROJECT = 'project:save'
export const IPC_OPEN_PROJECT = 'project:open'
export const IPC_WRITE_RECOVERY = 'recovery:write'
export const IPC_READ_RECOVERY = 'recovery:read'
export const IPC_CLEAR_RECOVERY = 'recovery:clear'

export const PROJECT_EXTENSION = 'stitch'
