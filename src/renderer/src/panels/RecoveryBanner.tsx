import type { RecoveryFile } from '../../../shared/api'
import { discardRecovery, fileStem, restoreRecovery } from '../project/actions'

interface Props {
  recovery: RecoveryFile
  onDone: () => void
}

export function RecoveryBanner({ recovery, onDone }: Props) {
  const when = new Date(recovery.savedAt).toLocaleString()
  const name = fileStem(recovery.path) ?? 'an untitled project'

  return (
    <div className="recovery-banner" role="alert">
      <span>
        StitchLab found unsaved work on <strong>{name}</strong> from {when}.
      </span>
      <button
        className="primary"
        onClick={async () => {
          await restoreRecovery(recovery.data, recovery.path)
          onDone()
        }}
      >
        Restore
      </button>
      <button
        onClick={async () => {
          await discardRecovery()
          onDone()
        }}
      >
        Discard
      </button>
    </div>
  )
}
