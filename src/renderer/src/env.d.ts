import type { StitchLabApi } from '../../shared/api'

declare global {
  interface Window {
    stitchlab?: StitchLabApi
  }
}

export {}
