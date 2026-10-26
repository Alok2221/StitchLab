import type { StitchLabApi } from '../../shared/api'

declare global {
  interface Window {
    stitchlab?: StitchLabApi
  }
}

declare module '*.glb?url' {
  const url: string
  export default url
}

export {}
