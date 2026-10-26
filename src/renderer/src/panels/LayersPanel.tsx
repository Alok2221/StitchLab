import { useRef, type ChangeEvent } from 'react'
import { useCurrentTemplate, useEditor, useViewLayers } from '../document/store'
import { IMAGE_ACCEPT, readImage } from './readImage'

export function LayersPanel() {
  const layers = useViewLayers()
  const template = useCurrentTemplate()
  const selectedLayerId = useEditor((s) => s.selectedLayerId)
  const { selectLayer, addTextLayer, addImageLayer, updateLayer, removeLayer, moveLayer } = useEditor.getState()
  const fileInput = useRef<HTMLInputElement>(null)

  const selectedIndex = layers.findIndex((l) => l.id === selectedLayerId)

  const onFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    for (const file of files) {
      try {
        addImageLayer(await readImage(file))
      } catch (error) {
        console.error(error)
      }
    }
  }

  return (
    <section className="panel-section">
      <div className="section-header">
        <h2>Layers</h2>
        <div className="section-actions">
          <button onClick={addTextLayer} title="Add text layer">
            + Text
          </button>
          <button onClick={() => fileInput.current?.click()} title="Import PNG, JPG or SVG">
            + Image
          </button>
          <input
            ref={fileInput}
            type="file"
            accept={IMAGE_ACCEPT}
            multiple
            hidden
            onChange={onFiles}
          />
        </div>
      </div>

      {layers.length === 0 ? (
        <p className="hint">Add text or import a graphic to place it on the {template.viewLabel.toLowerCase()}.</p>
      ) : (
        <ul className="layers-list">
          {[...layers].reverse().map((layer) => (
            <li key={layer.id} className={layer.id === selectedLayerId ? 'layer-row selected' : 'layer-row'}>
              <button className="layer-name" onClick={() => selectLayer(layer.id)}>
                <span className="layer-kind">{layer.type === 'text' ? 'T' : 'IMG'}</span>
                <span className={layer.visible ? '' : 'muted'}>{layer.name}</span>
              </button>
              <button
                className={layer.visible ? 'icon-toggle' : 'icon-toggle off'}
                onClick={() => updateLayer(layer.id, { visible: !layer.visible })}
                title={layer.visible ? 'Hide' : 'Show'}
              >
                {layer.visible ? 'Hide' : 'Show'}
              </button>
              <button
                className={layer.locked ? 'icon-toggle on' : 'icon-toggle'}
                onClick={() => updateLayer(layer.id, { locked: !layer.locked })}
                title={layer.locked ? 'Unlock' : 'Lock'}
              >
                {layer.locked ? 'Locked' : 'Lock'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {selectedLayerId && (
        <div className="layer-actions">
          <button onClick={() => moveLayer(selectedLayerId, 'up')} disabled={selectedIndex >= layers.length - 1}>
            Bring forward
          </button>
          <button onClick={() => moveLayer(selectedLayerId, 'down')} disabled={selectedIndex <= 0}>
            Send back
          </button>
          <button className="danger" onClick={() => removeLayer(selectedLayerId)}>
            Delete
          </button>
        </div>
      )}
    </section>
  )
}
