import { contextBridge, ipcRenderer } from 'electron'
import { IPC_SAVE_FILE, type StitchLabApi } from '../shared/api'

const api: StitchLabApi = {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  },
  saveFile: (request) => ipcRenderer.invoke(IPC_SAVE_FILE, request)
}

contextBridge.exposeInMainWorld('stitchlab', api)
