import { contextBridge } from 'electron'
import type { StitchLabApi } from '../shared/api'

const api: StitchLabApi = {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  }
}

contextBridge.exposeInMainWorld('stitchlab', api)
