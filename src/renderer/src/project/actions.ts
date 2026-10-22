import { createDocument, defaultZoneColors, type DesignDocument } from '../document/model'
import { isDirty, useEditor } from '../document/store'
import { svgToPng } from '../export/raster'
import { documentToSvg } from '../export/svg'
import { defaultTemplate, getTemplate, hasTemplate } from '../templates'
import { parseProject, ProjectFormatError, serializeProject } from './format'
import { notify } from './notice'

const THUMBNAIL_LONG_SIDE = 256

function api() {
  const bridge = window.stitchlab
  if (!bridge) throw new Error('Projects are only available in the desktop app')
  return bridge
}

export function fileStem(path: string | null): string | null {
  if (!path) return null
  return path.split(/[\\/]/).pop()?.replace(/\.stitch$/i, '') ?? null
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Fills in parts the saved document does not know about and drops parts the template no longer has. */
export function adoptDocument(doc: DesignDocument): DesignDocument {
  if (!hasTemplate(doc.templateId)) {
    throw new ProjectFormatError(`This project uses an unknown template: ${doc.templateId}`)
  }
  const template = getTemplate(doc.templateId)
  const zoneColors = defaultZoneColors(template.zones)
  for (const zone of template.zones) {
    const saved = doc.zoneColors[zone.id]
    if (saved) zoneColors[zone.id] = saved
  }
  return { ...doc, zoneColors }
}

async function thumbnailFor(doc: DesignDocument): Promise<Uint8Array | undefined> {
  try {
    const template = getTemplate(doc.templateId)
    const { width, height } = template.viewBox
    return await svgToPng(documentToSvg(doc, template), { width, height, scale: THUMBNAIL_LONG_SIDE / Math.max(width, height) })
  } catch {
    return undefined
  }
}

export async function saveProject(saveAs = false): Promise<boolean> {
  const { doc, filePath, revision } = useEditor.getState()
  try {
    const data = await serializeProject(doc, { thumbnail: await thumbnailFor(doc) })
    const path = await api().saveProject({
      path: saveAs ? null : filePath,
      defaultName: fileStem(filePath) ?? getTemplate(doc.templateId).name,
      data
    })
    if (!path) return false
    useEditor.getState().markSaved(path, revision)
    if (!isDirty(useEditor.getState())) await api().clearRecovery()
    notify(`Saved ${fileStem(path)}`)
    return true
  } catch (error) {
    notify(`Could not save the project: ${errorMessage(error)}`, 'error')
    return false
  }
}

function confirmDiscard(): boolean {
  if (!isDirty(useEditor.getState())) return true
  return window.confirm('This project has unsaved changes. Discard them?')
}

export async function newProject(): Promise<void> {
  if (!confirmDiscard()) return
  useEditor.getState().loadDocument(createDocument(defaultTemplate.id, defaultTemplate.zones), null)
  await api().clearRecovery()
}

export async function openProject(): Promise<void> {
  if (!confirmDiscard()) return
  try {
    const file = await api().openProject()
    if (!file) return
    const { doc } = parseProject(file.data)
    useEditor.getState().loadDocument(adoptDocument(doc), file.path)
    await api().clearRecovery()
    notify(`Opened ${fileStem(file.path)}`)
  } catch (error) {
    notify(`Could not open the project: ${errorMessage(error)}`, 'error')
  }
}

export async function restoreRecovery(data: Uint8Array, path: string | null): Promise<void> {
  try {
    const { doc } = parseProject(data)
    useEditor.getState().loadDocument(adoptDocument(doc), path, { dirty: true })
    notify('Unsaved work restored')
  } catch (error) {
    notify(`Could not restore unsaved work: ${errorMessage(error)}`, 'error')
    await api().clearRecovery()
  }
}

export async function writeRecovery(): Promise<void> {
  const { doc, filePath } = useEditor.getState()
  await api().writeRecovery(await serializeProject(doc), filePath)
}

export async function discardRecovery(): Promise<void> {
  await api().clearRecovery()
}
