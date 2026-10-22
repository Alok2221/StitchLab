import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC_CLEAR_RECOVERY,
  IPC_OPEN_PROJECT,
  IPC_READ_RECOVERY,
  IPC_SAVE_FILE,
  IPC_SAVE_FILES,
  IPC_SAVE_PROJECT,
  IPC_WRITE_RECOVERY,
  type StitchLabApi
} from '../shared/api'

const api: StitchLabApi = {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  },
  saveFile: (request) => ipcRenderer.invoke(IPC_SAVE_FILE, request),
  saveFiles: (request) => ipcRenderer.invoke(IPC_SAVE_FILES, request),
  saveProject: (request) => ipcRenderer.invoke(IPC_SAVE_PROJECT, request),
  openProject: () => ipcRenderer.invoke(IPC_OPEN_PROJECT),
  writeRecovery: (data, path) => ipcRenderer.invoke(IPC_WRITE_RECOVERY, data, path),
  readRecovery: () => ipcRenderer.invoke(IPC_READ_RECOVERY),
  clearRecovery: () => ipcRenderer.invoke(IPC_CLEAR_RECOVERY)
}

contextBridge.exposeInMainWorld('stitchlab', api)
