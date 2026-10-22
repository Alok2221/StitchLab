import { useEditor } from '../document/store'
import { CATEGORY_LABELS, TEMPLATE_CATEGORIES, templates, templateThumbnail } from '../templates'

const thumbnails = new Map(templates.map((t) => [t.id, templateThumbnail(t)]))

export function TemplatesPanel() {
  const currentId = useEditor((s) => s.doc.templateId)
  const setTemplate = useEditor((s) => s.setTemplate)

  return (
    <section className="panel-section">
      <h2>Templates</h2>
      {TEMPLATE_CATEGORIES.map((category) => {
        const items = templates.filter((t) => t.category === category)
        if (items.length === 0) return null
        return (
          <div key={category} className="template-group">
            <h3>{CATEGORY_LABELS[category]}</h3>
            <div className="template-grid">
              {items.map((t) => (
                <button
                  key={t.id}
                  className={t.id === currentId ? 'template-card selected' : 'template-card'}
                  onClick={() => setTemplate(t.id)}
                  title={t.name}
                >
                  <img src={thumbnails.get(t.id)} alt="" draggable={false} />
                  <span>{t.name}</span>
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </section>
  )
}
