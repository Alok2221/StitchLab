import { useState } from 'react'
import { useEditor } from '../document/store'
import { CATEGORY_LABELS, garments, getGarment, TEMPLATE_CATEGORIES, templateThumbnail } from '../templates'

const thumbnails = new Map(garments.map((g) => [g.id, templateThumbnail(g.views[0])]))
const categories = TEMPLATE_CATEGORIES.filter((c) => garments.some((g) => g.category === c))

export function TemplatesPanel() {
  const currentId = useEditor((s) => s.doc.templateId)
  const setTemplate = useEditor((s) => s.setTemplate)
  const [shown, setShown] = useState({ templateId: currentId, category: getGarment(currentId).category })

  // Follow the current template when it changes from outside (open, undo, new project).
  let category = shown.category
  if (shown.templateId !== currentId) {
    category = getGarment(currentId).category
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
        {garments
          .filter((g) => g.category === category)
          .map((g) => (
            <button
              key={g.id}
              className={g.id === currentId ? 'template-card selected' : 'template-card'}
              onClick={() => setTemplate(g.id)}
              title={g.name}
            >
              <img src={thumbnails.get(g.id)} alt="" draggable={false} />
              <span>{g.name}</span>
            </button>
          ))}
      </div>
    </section>
  )
}
