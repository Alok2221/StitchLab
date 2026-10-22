import { useEffect, useState } from 'react'
import type { RecoveryFile } from '../../../shared/api'
import { isDirty, useEditor } from '../document/store'
import { fileStem, writeRecovery } from './actions'

const AUTOSAVE_DELAY_MS = 1500

/**
 * Autosaves unsaved work to the recovery file, offers recovery on startup, keeps
 * the window title in sync and blocks closing the window with unsaved changes.
 */
export function useProjectLifecycle() {
  const [recovery, setRecovery] = useState<RecoveryFile | null>(null)
  const [recoveryChecked, setRecoveryChecked] = useState(false)
  const filePath = useEditor((s) => s.filePath)
  const dirty = useEditor(isDirty)

  useEffect(() => {
    const bridge = window.stitchlab
    if (!bridge) {
      setRecoveryChecked(true)
      return
    }
    void bridge
      .readRecovery()
      .then(setRecovery)
      .finally(() => setRecoveryChecked(true))
  }, [])

  // Recovery data must not be overwritten before the user decides what to do with it.
  const autosaveEnabled = recoveryChecked && recovery === null && Boolean(window.stitchlab)

  useEffect(() => {
    if (!autosaveEnabled) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = useEditor.subscribe((s, prev) => {
      if (s.revision === prev.revision || !isDirty(s)) return
      clearTimeout(timer)
      timer = setTimeout(() => void writeRecovery().catch(console.error), AUTOSAVE_DELAY_MS)
    })
    return () => {
      clearTimeout(timer)
      unsubscribe()
    }
  }, [autosaveEnabled])

  useEffect(() => {
    document.title = `${dirty ? '* ' : ''}${fileStem(filePath) ?? 'Untitled'} - StitchLab`
  }, [dirty, filePath])

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirty(useEditor.getState())) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  return { recovery, dismissRecovery: () => setRecovery(null) }
}
