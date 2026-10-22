export interface DesignDocument {
  templateId: string
  zoneColors: Record<string, string>
  palette: string[]
}

export type Operation =
  | { type: 'setZoneColor'; zoneId: string; from: string; to: string }
  | { type: 'addPaletteColor'; color: string }

export interface History {
  past: Operation[]
  future: Operation[]
}

export const HISTORY_LIMIT = 200

export const DEFAULT_PALETTE = [
  '#f4f4f2',
  '#1f1f22',
  '#c8102e',
  '#1d4e89',
  '#2e7d4f',
  '#f2b134',
  '#7a4fa3',
  '#e07a5f'
]

export function createDocument(
  templateId: string,
  zones: { id: string; defaultColor: string }[]
): DesignDocument {
  return {
    templateId,
    zoneColors: Object.fromEntries(zones.map((z) => [z.id, z.defaultColor])),
    palette: [...DEFAULT_PALETTE]
  }
}

export function applyOperation(doc: DesignDocument, op: Operation): DesignDocument {
  switch (op.type) {
    case 'setZoneColor':
      return { ...doc, zoneColors: { ...doc.zoneColors, [op.zoneId]: op.to } }
    case 'addPaletteColor':
      return { ...doc, palette: [...doc.palette, op.color] }
  }
}

export function revertOperation(doc: DesignDocument, op: Operation): DesignDocument {
  switch (op.type) {
    case 'setZoneColor':
      return { ...doc, zoneColors: { ...doc.zoneColors, [op.zoneId]: op.from } }
    case 'addPaletteColor':
      return { ...doc, palette: doc.palette.slice(0, -1) }
  }
}

export function commit(
  doc: DesignDocument,
  history: History,
  op: Operation
): { doc: DesignDocument; history: History } {
  const past = [...history.past, op]
  if (past.length > HISTORY_LIMIT) past.shift()
  return { doc: applyOperation(doc, op), history: { past, future: [] } }
}

export function undo(doc: DesignDocument, history: History): { doc: DesignDocument; history: History } {
  const op = history.past.at(-1)
  if (!op) return { doc, history }
  return {
    doc: revertOperation(doc, op),
    history: { past: history.past.slice(0, -1), future: [op, ...history.future] }
  }
}

export function redo(doc: DesignDocument, history: History): { doc: DesignDocument; history: History } {
  const [op, ...future] = history.future
  if (!op) return { doc, history }
  return {
    doc: applyOperation(doc, op),
    history: { past: [...history.past, op], future }
  }
}
