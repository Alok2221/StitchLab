import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { rmSync } from 'node:fs'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import {
  IPC_CLEAR_RECOVERY,
  IPC_OPEN_PROJECT,
  IPC_READ_RECOVERY,
  IPC_SAVE_PROJECT,
  IPC_WRITE_RECOVERY,
  PROJECT_EXTENSION,
  type ProjectFile,
  type RecoveryFile
} from '../shared/api'

const MAX_PROJECT_BYTES = 1024 * 1024 * 1024
const FILTERS = [{ name: 'StitchLab project', extensions: [PROJECT_EXTENSION] }]

/** Paths the user picked in a dialog this session; the renderer may only write to these. */
const approvedPaths = new Set<string>()

const recoveryDir = () => join(app.getPath('userData'), 'recovery')
const recoveryData = () => join(recoveryDir(), `recovery.${PROJECT_EXTENSION}`)
const recoveryMeta = () => join(recoveryDir(), 'recovery.json')

function withExtension(path: string): string {
  return extname(path).toLowerCase() === `.${PROJECT_EXTENSION}` ? path : `${path}.${PROJECT_EXTENSION}`
}

function approve(path: string): string {
  const full = resolve(path)
  approvedPaths.add(full)
  return full
}

function assertBytes(data: unknown): asserts data is Uint8Array {
  if (!(data instanceof Uint8Array)) throw new Error('Project data must be bytes')
  if (data.byteLength > MAX_PROJECT_BYTES) throw new Error('Project is too large')
}

function windowOf(event: IpcMainInvokeEvent) {
  return BrowserWindow.fromWebContents(event.sender) ?? undefined
}

async function saveProject(event: IpcMainInvokeEvent, request: unknown): Promise<string | null> {
  if (typeof request !== 'object' || request === null) throw new Error('Invalid save request')
  const { path, defaultName, data } = request as Record<string, unknown>
  assertBytes(data)
  if (path !== null && typeof path !== 'string') throw new Error('Invalid project path')

  let target = typeof path === 'string' ? resolve(path) : null
  if (target && !approvedPaths.has(target)) throw new Error('Project path was not chosen by the user')

  if (!target) {
    const stem = typeof defaultName === 'string' ? basename(defaultName).replace(/[<>:"/\\|?*\x00-\x1f]/g, '-') : ''
    const options = {
      title: 'Save project',
      defaultPath: join(app.getPath('documents'), `${stem || 'Untitled'}.${PROJECT_EXTENSION}`),
      filters: FILTERS
    }
    const win = windowOf(event)
    const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return null
    target = approve(withExtension(result.filePath))
  }

  const temp = `${target}.tmp`
  await writeFile(temp, data)
  await rename(temp, target)
  return target
}

async function openProject(event: IpcMainInvokeEvent): Promise<ProjectFile | null> {
  const options = { title: 'Open project', filters: FILTERS, properties: ['openFile' as const] }
  const win = windowOf(event)
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  const [path] = result.filePaths
  if (result.canceled || !path) return null
  if ((await stat(path)).size > MAX_PROJECT_BYTES) throw new Error('Project is too large')
  return { path: approve(path), data: new Uint8Array(await readFile(path)) }
}

async function writeRecovery(_event: IpcMainInvokeEvent, data: unknown, path: unknown): Promise<void> {
  assertBytes(data)
  await mkdir(recoveryDir(), { recursive: true })
  await writeFile(recoveryData(), data)
  const meta = { path: typeof path === 'string' ? path : null, savedAt: Date.now() }
  await writeFile(recoveryMeta(), JSON.stringify(meta))
}

async function readRecovery(): Promise<RecoveryFile | null> {
  try {
    const meta = JSON.parse(await readFile(recoveryMeta(), 'utf8')) as { path: unknown; savedAt: unknown }
    const data = new Uint8Array(await readFile(recoveryData()))
    const path = typeof meta.path === 'string' ? approve(meta.path) : null
    return { data, path, savedAt: typeof meta.savedAt === 'number' ? meta.savedAt : 0 }
  } catch {
    return null
  }
}

async function clearRecovery(): Promise<void> {
  await rm(recoveryDir(), { recursive: true, force: true })
}

export function registerProjectHandlers(): void {
  ipcMain.handle(IPC_SAVE_PROJECT, saveProject)
  ipcMain.handle(IPC_OPEN_PROJECT, openProject)
  ipcMain.handle(IPC_WRITE_RECOVERY, writeRecovery)
  ipcMain.handle(IPC_READ_RECOVERY, readRecovery)
  ipcMain.handle(IPC_CLEAR_RECOVERY, clearRecovery)
}

/** Asks before closing when the renderer reports unsaved changes through `beforeunload`. */
export function confirmUnsavedOnClose(win: BrowserWindow): void {
  win.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: ['Close without saving', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      title: 'Unsaved changes',
      message: 'This project has unsaved changes.',
      detail: 'Changes made since the last save will be lost.'
    })
    if (choice !== 0) return
    rmSync(recoveryDir(), { recursive: true, force: true })
    event.preventDefault()
  })
}
