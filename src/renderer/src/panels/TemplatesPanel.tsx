import { useState } from 'react'
import { useEditor } from '../document/store'
import { CATEGORY_LABELS, getTemplate, TEMPLATE_CATEGORIES, templates, templateThumbnail } from '../templates'

const thumbnails = new Map(templates.map((t) => [t.id, templateThumbnail(t)]))
const categories = TEMPLATE_CATEGORIES.filter((c) => templates.some((t) => t.category === c))

export function TemplatesPanel() {
  const currentId = useEditor((s) => s.doc.templateId)
  const setTemplate = useEditor((s) => s.setTemplate)
  const [shown, setShown] = useState({ templateId: currentId, category: getTemplate(currentId).category })

  // Follow the current template when it changes from outside (open, undo, new project).
  let category = shown.category
  if (shown.templateId !== currentId) {
    category = getTemplate(currentId).category
    setShown({ templateId: currentId, category })
  }

  return (
    <section className="panel-section">
      <h2>Templates</h2>
      <div className="category-tabs" role="tablist">
        {categories.map((c) => (
          <button
            key={c}
            role="tab"
            aria-selected={c === category}
            className={c === category ? 'selected' : ''}
            onClick={() => setShown({ templateId: currentId, category: c })}
          >
            {CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>
      <div className="template-grid">
        {templates
          .filter((t) => t.category === category)
          .map((t) => (
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
    </section>
  )
}
