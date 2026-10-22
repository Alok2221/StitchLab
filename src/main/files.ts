import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { EXPORT_FORMATS, IPC_SAVE_FILE, type ExportFormat, type SaveFileRequest } from '../shared/api'

const MAX_FILE_BYTES = 512 * 1024 * 1024

function isSaveRequest(value: unknown): value is SaveFileRequest {
  if (typeof value !== 'object' || value === null) return false
  const req = value as Record<string, unknown>
  return (
    typeof req.format === 'string' &&
    req.format in EXPORT_FORMATS &&
    typeof req.defaultName === 'string' &&
    (typeof req.data === 'string' || req.data instanceof Uint8Array)
  )
}

function safeFileName(name: string, format: ExportFormat): string {
  const { extension } = EXPORT_FORMATS[format]
  const stem = basename(name, extname(name)).replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').trim() || 'design'
  return `${stem}.${extension}`
}

export function registerFileHandlers(): void {
  ipcMain.handle(IPC_SAVE_FILE, async (event, request: unknown) => {
    if (!isSaveRequest(request)) throw new Error('Invalid save request')
    const size = typeof request.data === 'string' ? Buffer.byteLength(request.data) : request.data.byteLength
    if (size > MAX_FILE_BYTES) throw new Error('File is too large')

    const { name, extension } = EXPORT_FORMATS[request.format]
    const window = BrowserWindow.fromWebContents(event.sender)
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
}
