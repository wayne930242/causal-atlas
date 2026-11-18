import { useCallback, useDeferredValue, useEffect, useRef, useState } from 'react'
import type { Locale } from '../../engine/index.ts'
import { ControlsPanel } from './ControlsPanel.tsx'
import { ExplorerNav } from './ExplorerNav.tsx'
import { Figure, FigureBoundary } from './Figure.tsx'
import { TEXT } from './explorer-text.ts'
import type { ModelSource } from './model-info.ts'
import { BLOG_DIFFERS, sourceKey } from './model-info.ts'
import { component } from './registry.ts'
import type { ComponentId } from './registry.ts'
import type { Snippet } from './snippet.ts'
import { mdxText, snippet } from './snippet.ts'
import { getStory } from './stories.ts'
import type { ExplorerState, Notice, Theme } from './url-state.ts'
import { EXPLORER_PATH, basicState, parseHash, serialize, storyState } from './url-state.ts'
import './explorer.css'

type Mode = 'push' | 'replace'

/** Tell the page shell (language, theme) that the hash changed under it; `replaceState` and `pushState` fire nothing. */
function announce(): void {
  window.dispatchEvent(new Event('hashchange'))
}

function SnippetPanel({ state }: { readonly state: ExplorerState }) {
  const t = TEXT[state.lang]
  const [tab, setTab] = useState<'jsx' | 'mdx'>('jsx')
  const [copied, setCopied] = useState<string | undefined>(undefined)
  let shown: Snippet | undefined
  try {
    shown = snippet(state)
  } catch {
    shown = undefined
  }
  const text = shown === undefined ? '' : tab === 'jsx' ? shown.jsx : mdxText(shown)
  const copy = (what: string, value: string): void => {
    void navigator.clipboard?.writeText(value).then(() => {
      setCopied(what)
      setTimeout(() => setCopied(undefined), 1500)
    })
  }
  const differs = state.source.kind === 'lesson' && BLOG_DIFFERS.includes(state.source.id)
  return (
    <section className="ex-snippet" aria-label={t.snippet}>
      <div className="ex-tabs" role="tablist" aria-label={t.snippet}>
        {(['jsx', 'mdx'] as const).map((id) => (
          <button key={id} type="button" role="tab" id={`ex-tab-${id}`} aria-selected={tab === id} aria-controls="ex-snippet-body" className="ex-tab" onClick={() => setTab(id)}>
            {t[id]}
          </button>
        ))}
        <span className="ex-spacer" />
        <button type="button" className="ex-button" onClick={() => copy('code', text)}>
          {copied === 'code' ? t.copied : t.copy}
        </button>
        <button type="button" className="ex-button" onClick={() => copy('link', window.location.href)}>
          {copied === 'link' ? t.linkCopied : t.copyLink}
        </button>
      </div>
      <pre id="ex-snippet-body" role="tabpanel" aria-labelledby={`ex-tab-${tab}`} className="ex-pre" data-snippet={tab} tabIndex={0}>
        <code>{text}</code>
      </pre>
      {tab === 'mdx' && differs && <p className="ex-muted ex-note">{t.blogDiffers}</p>}
    </section>
  )
}

function noticeText(lang: Locale, n: Notice): string {
  return `${TEXT[lang].notice[n.code]}${n.detail}`
}

/** The component explorer: pick a component and a model, edit its props, copy the JSX or the blog's MDX; the whole state is the hash. */
export function Explorer() {
  const initial = parseHash(window.location.hash, document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
  const [state, setState] = useState<ExplorerState>(initial.state)
  const [notices, setNotices] = useState<readonly Notice[]>(initial.notices)
  const [sheet, setSheet] = useState(false)
  const current = useRef(state)
  current.current = state
  const t = TEXT[state.lang]

  const commit = useCallback((next: ExplorerState, mode: Mode): void => {
    const hash = serialize(next)
    if (hash !== window.location.hash) {
      if (mode === 'push') window.history.pushState(null, '', hash)
      else window.history.replaceState(null, '', hash)
    }
    setState(next)
    setNotices([])
    if (next.lang !== current.current.lang || next.theme !== current.current.theme) announce()
  }, [])

  // Back, Forward, a pasted link or a language link: read the state from the address again.
  useEffect(() => {
    const on = (): void => {
      if (!window.location.hash.startsWith(`#${EXPLORER_PATH}`)) return
      const parsed = parseHash(window.location.hash)
      if (serialize(parsed.state) === serialize(current.current)) return
      setState(parsed.state)
      setNotices(parsed.notices)
    }
    window.addEventListener('popstate', on)
    window.addEventListener('hashchange', on)
    return () => {
      window.removeEventListener('popstate', on)
      window.removeEventListener('hashchange', on)
    }
  }, [])

  // A hash without the explorer's parameters (`#/explorer`) is written out in full once.
  useEffect(() => {
    if (serialize(initial.state) !== window.location.hash) window.history.replaceState(null, '', serialize(initial.state))
    // Once, on mount.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const base = (): Pick<ExplorerState, 'lang' | 'theme'> => ({ lang: current.current.lang, theme: current.current.theme })

  const onComponent = (id: ComponentId): void => {
    const s = current.current
    const def = component(id)
    const fallback = basicState(id, s.lang, s.theme)
    const keep = def.sources.length > 0 && def.sources.includes(s.source.kind)
    commit(keep ? { ...fallback, story: undefined, source: s.source, args: {} } : fallback, 'push')
  }
  const onStory = (id: string | undefined): void => {
    const s = current.current
    const story = id === undefined ? undefined : getStory(id)
    commit(story === undefined ? { ...s, story: undefined, args: {} } : storyState(story, s.lang, s.theme), 'push')
    setSheet(false)
  }
  const onModel = (source: ModelSource): void => {
    const s = current.current
    commit({ component: s.component, source, args: {}, ...base() }, 'push')
    setSheet(false)
  }
  const onArg = (key: string, value: unknown): void => {
    const s = current.current
    const args = { ...s.args }
    if (value === undefined) delete args[key]
    else args[key] = value
    commit({ ...s, args }, 'replace')
  }
  const onLang = (lang: Locale): void => commit({ ...current.current, lang }, 'replace')
  const onTheme = (theme: Theme): void => commit({ ...current.current, theme }, 'replace')

  const deferred = useDeferredValue(state)
  const figureKey = serialize({ ...deferred, theme: 'light' })
  const def = component(state.component)
  const storyNote = state.story === undefined ? undefined : state.story
  return (
    <div className="ex-root" data-component={state.component} data-story={storyNote}>
      <div className="ex-grid">
      <header className="ex-head">
      <div className="ex-bar">
        <h1 className="ex-title">{t.title}</h1>
        <button type="button" className="ex-button ex-pick" aria-haspopup="dialog" aria-expanded={sheet} onClick={() => setSheet(true)}>
          <span>{t.pick}</span>
          <span className="ex-pick-now">
            {t.components[state.component].split(' ')[0]}
            {def.sources.length > 0 ? ` · ${sourceKey(state.source)}` : ''}
          </span>
        </button>
      </div>
      {notices.length > 0 && (
        <p className="ex-notice" role="status">
          {notices.map((n) => noticeText(state.lang, n)).join('；')}
        </p>
      )}
      </header>
      <ExplorerNav state={state} lang={state.lang} open={sheet} onClose={() => setSheet(false)} onComponent={onComponent} onStory={onStory} onModel={onModel} />
      <main className="ex-main" aria-label={t.canvas}>
        <div className="ex-canvas" data-pending={deferred === state ? undefined : 'true'}>
          <FigureBoundary resetKey={figureKey} title={t.errorTitle}>
            <Figure key={figureKey} state={deferred} />
          </FigureBoundary>
        </div>
        <SnippetPanel state={state} />
      </main>
      <ControlsPanel state={state} onArg={onArg} onLang={onLang} onTheme={onTheme} />
      </div>
    </div>
  )
}
