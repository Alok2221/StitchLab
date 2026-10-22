import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import {
  EXPORT_FORMATS,
  IPC_SAVE_FILE,
  IPC_SAVE_FILES,
  type ExportFormat,
  type SaveFileRequest,
  type SaveFilesRequest,
  type SavedFiles
} from '../shared/api'

const MAX_FILE_BYTES = 512 * 1024 * 1024
const MAX_BATCH_FILES = 200
const MAX_BATCH_BYTES = 2 * 1024 * 1024 * 1024

const isFileData = (data: unknown): data is Uint8Array | string => typeof data === 'string' || data instanceof Uint8Array
const isFormat = (format: unknown): format is ExportFormat => typeof format === 'string' && format in EXPORT_FORMATS

function isSaveRequest(value: unknown): value is SaveFileRequest {
  if (typeof value !== 'object' || value === null) return false
  const req = value as Record<string, unknown>
  return isFormat(req.format) && typeof req.defaultName === 'string' && isFileData(req.data)
}

function isSaveFilesRequest(value: unknown): value is SaveFilesRequest {
  if (typeof value !== 'object' || value === null) return false
  const req = value as Record<string, unknown>
  return (
    isFormat(req.format) &&
    Array.isArray(req.files) &&
    req.files.length > 0 &&
    req.files.length <= MAX_BATCH_FILES &&
    req.files.every(
      (f: unknown) =>
        typeof f === 'object' && f !== null && typeof (f as Record<string, unknown>).name === 'string' && isFileData((f as Record<string, unknown>).data)
    )
  )
}

const byteLength = (data: Uint8Array | string) => (typeof data === 'string' ? Buffer.byteLength(data) : data.byteLength)

function safeStem(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/[. ]+$/, '').trim().slice(0, 120) || 'design'
}

function safeFileName(name: string, format: ExportFormat): string {
  return `${safeStem(basename(name, extname(name)))}.${EXPORT_FORMATS[format].extension}`
}

function windowFor(sender: Electron.WebContents) {
  return BrowserWindow.fromWebContents(sender)
}

export function registerFileHandlers(): void {
  ipcMain.handle(IPC_SAVE_FILE, async (event, request: unknown) => {
    if (!isSaveRequest(request)) throw new Error('Invalid save request')
    if (byteLength(request.data) > MAX_FILE_BYTES) throw new Error('File is too large')

    const { name, extension } = EXPORT_FORMATS[request.format]
    const window = windowFor(event.sender)
    const options = {
      title: `Export ${name}`,
      defaultPath: join(app.getPath('documents'), safeFileName(request.defaultName, request.format)),
      filters: [{ name, extensions: [extension] }]
    }
    const { canceled, filePath } = window
      ? await dialog.showSaveDialog(window, options)
      : await dialog.showSaveDialog(options)
    if (canceled || !filePath) return null

    const target = extname(filePath).toLowerCase() === `.${extension}` ? filePath : `${filePath}.${extension}`
    await writeFile(target, typeof request.data === 'string' ? request.data : Buffer.from(request.data))
    return target
  })

  ipcMain.handle(IPC_SAVE_FILES, async (event, request: unknown): Promise<SavedFiles | null> => {
    if (!isSaveFilesRequest(request)) throw new Error('Invalid save request')
    const sizes = request.files.map((f) => byteLength(f.data))
    if (sizes.some((s) => s > MAX_FILE_BYTES) || sizes.reduce((a, b) => a + b, 0) > MAX_BATCH_BYTES) {
      throw new Error('Files are too large')
    }

    const window = windowFor(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: `Export ${request.files.length} ${EXPORT_FORMATS[request.format].name} files`,
      defaultPath: app.getPath('documents'),
      buttonLabel: 'Export here',
      properties: ['openDirectory', 'createDirectory']
    }
    const { canceled, filePaths } = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    const directory = filePaths[0]
    if (canceled || !directory) return null

    const { extension } = EXPORT_FORMATS[request.format]
    const paths: string[] = []
    for (const file of request.files) {
      const stem = safeStem(file.name)
      const data = typeof file.data === 'string' ? file.data : Buffer.from(file.data)
      for (let n = 1; ; n++) {
        const target = join(directory, n === 1 ? `${stem}.${extension}` : `${stem} (${n}).${extension}`)
        try {
          await writeFile(target, data, { flag: 'wx' })
          paths.push(target)
          break
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || n >= 1000) throw error
        }
      }
    }
    return { directory, paths }
  })
}
