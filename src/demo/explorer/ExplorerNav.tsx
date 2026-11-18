import { useMemo, useState } from 'react'
import { catalog } from '../../components/editor/catalog.ts'
import { messagesFor } from '../../components/i18n/messages.ts'
import type { Locale } from '../../engine/index.ts'
import { LESSON_MODELS } from '../lesson-models.ts'
import { TEXT } from './explorer-text.ts'
import type { ModelSource } from './model-info.ts'
import { LESSON_IDS, parseSource, sourceKey } from './model-info.ts'
import { COMPONENTS, component } from './registry.ts'
import type { ComponentId } from './registry.ts'
import { storiesOf } from './stories.ts'
import type { ExplorerState } from './url-state.ts'

export interface ExplorerNavProps {
  readonly state: ExplorerState
  readonly lang: Locale
  readonly open: boolean
  readonly onClose: () => void
  readonly onComponent: (id: ComponentId) => void
  readonly onStory: (id: string | undefined) => void
  readonly onModel: (source: ModelSource) => void
}

interface Entry {
  readonly key: string
  readonly label: string
  readonly search: string
}
interface Group {
  readonly id: string
  readonly label: string
  readonly entries: readonly Entry[]
}

function lessonGroups(): Group[] {
  const groups = new Map<string, Entry[]>()
  for (const id of LESSON_IDS) {
    const prefix = id.slice(0, 3)
    const title = LESSON_MODELS[id]?.title ?? id
    groups.set(prefix, [...(groups.get(prefix) ?? []), { key: `lesson:${id}`, label: `${id} · ${title}`, search: `${id} ${title}`.toLowerCase() }])
  }
  return [...groups].map(([prefix, entries]) => ({ id: `lesson-${prefix}`, label: prefix, entries }))
}

function matches(entry: Entry, query: string): boolean {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w !== '')
    .every((w) => entry.search.includes(w))
}

export function ExplorerNav({ state, lang, open, onClose, onComponent, onStory, onModel }: ExplorerNavProps) {
  const t = TEXT[lang]
  const def = component(state.component)
  const [query, setQuery] = useState('')
  const lessons = useMemo(() => lessonGroups(), [])
  const cases = useMemo(
    () =>
      catalog(messagesFor(lang), []).map((g) => ({
        id: g.id,
        label: g.label,
        entries: g.entries.map((e): Entry => ({ key: e.key.startsWith('model:') ? e.key : `case:${e.key}`, label: e.label, search: e.search })),
      })),
    [lang],
  )
  const groups: Group[] = [
    ...(def.sources.includes('blank') ? [{ id: 'blank', label: t.blank, entries: [{ key: 'blank', label: t.blank, search: 'blank 空白' }] }] : []),
    ...(def.sources.includes('lesson') ? lessons : []),
    ...(def.sources.includes('case') ? cases : []),
  ]
    .map((g) => ({ ...g, entries: g.entries.filter((e) => matches(e, query)) }))
    .filter((g) => g.entries.length > 0)
  const stories = storiesOf(state.component)
  const current = sourceKey(state.source)
  return (
    <aside className="ex-nav" data-open={open ? 'true' : 'false'} aria-label={t.nav}>
      <div className="ex-nav-head">
        <h2 className="ex-h">{t.nav}</h2>
        <button type="button" className="ex-button ex-close" onClick={onClose}>
          {t.close}
        </button>
      </div>
      <nav className="ex-list" aria-label={t.title}>
        {COMPONENTS.map((c) => (
          <div key={c.id} className="ex-comp">
            <button type="button" className="ex-item-button" aria-current={state.component === c.id ? 'true' : undefined} onClick={() => onComponent(c.id)}>
              {t.components[c.id]}
            </button>
            {state.component === c.id && (
              <ul className="ex-stories" aria-label={t.stories}>
                <li>
                  <button type="button" className="ex-story" aria-current={state.story === undefined ? 'true' : undefined} onClick={() => onStory(undefined)}>
                    {t.storiesCustom}
                  </button>
                </li>
                {stories.map((s) => (
                  <li key={s.id}>
                    <button type="button" className="ex-story" aria-current={state.story === s.id ? 'true' : undefined} onClick={() => onStory(s.id)}>
                      {s.id}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </nav>
      {def.sources.length > 0 && (
        <div className="ex-models">
          <h3 className="ex-h">{t.model}</h3>
          <input className="ex-input" type="search" aria-label={t.modelSearch} placeholder={t.modelSearch} value={query} onChange={(e) => setQuery(e.currentTarget.value)} />
          <div className="ex-model-list">
            {groups.length === 0 && <p className="ex-muted">{t.modelNone}</p>}
            {groups.map((g) => (
              <section key={g.id}>
                <h4 className="ex-group-title">{g.label}</h4>
                <ul>
                  {g.entries.map((e) => (
                    <li key={e.key}>
                      <button
                        type="button"
                        className="ex-story"
                        aria-current={current === e.key ? 'true' : undefined}
                        onClick={() => {
                          const parsed = parseSource(e.key)
                          if (parsed !== undefined) onModel(parsed)
                        }}
                      >
                        {e.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      )}
    </aside>
  )
}
