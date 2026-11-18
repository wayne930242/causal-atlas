import type { Locale } from '../../engine/index.ts'
import type { DocPatch, ModelSource } from './model-info.ts'
import { parseSource, sourceKey } from './model-info.ts'
import type { ComponentId, PropDef } from './registry.ts'
import { RESERVED, component, isComponentId } from './registry.ts'
import type { Story } from './stories.ts'
import { basicStory, getStory } from './stories.ts'

export type Theme = 'light' | 'dark'

/** Everything the explorer shows lives here, and in the hash. */
export interface ExplorerState {
  readonly component: ComponentId
  /** The story the state started from; undefined once the model or component is picked on its own. */
  readonly story?: string
  readonly source: ModelSource
  readonly patch?: DocPatch
  /** Every prop that is set; the story's args with the edits on top. Never holds `undefined`. */
  readonly args: Readonly<Record<string, unknown>>
  readonly lang: Locale
  readonly theme: Theme
}

/** Something in the address that could not be used; the page shows one line and falls back to the default. */
export interface Notice {
  readonly code: 'component' | 'story' | 'model' | 'patch' | 'param' | 'value'
  readonly detail: string
}

export const EXPLORER_PATH = '/explorer'

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every((k) => k in b && deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}

function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T)
}

export function storyState(story: Story, lang: Locale = 'zh-TW', theme: Theme = 'light'): ExplorerState {
  return {
    component: story.component,
    story: story.id,
    source: story.source,
    ...(story.patch === undefined ? {} : { patch: clone(story.patch) }),
    args: clone(story.args),
    lang,
    theme,
  }
}

export function basicState(id: ComponentId, lang: Locale = 'zh-TW', theme: Theme = 'light'): ExplorerState {
  return storyState(basicStory(id), lang, theme)
}

function encodeProp(def: PropDef, value: unknown): string {
  return def.kind === 'string' ? String(value) : def.kind === 'json' ? JSON.stringify(value) : String(value)
}

function decodeProp(def: PropDef, text: string): { ok: true; value: unknown } | { ok: false } {
  if (def.kind === 'string') return { ok: true, value: text }
  if (def.kind === 'number') {
    const n = Number(text)
    return text.trim() !== '' && Number.isFinite(n) ? { ok: true, value: n } : { ok: false }
  }
  if (def.kind === 'boolean') return text === 'true' || text === 'false' ? { ok: true, value: text === 'true' } : { ok: false }
  try {
    return { ok: true, value: JSON.parse(text) as unknown }
  } catch {
    return { ok: false }
  }
}

const hasPatch = (patch: DocPatch | undefined): patch is DocPatch => patch !== undefined && Object.keys(patch).length > 0

/** The hash for a state: `#/explorer?c=…&s=…&src=…`, then the props that differ from the story's. */
export function serialize(state: ExplorerState): string {
  const def = component(state.component)
  const params = new URLSearchParams()
  params.set('c', state.component)
  const story = state.story === undefined ? undefined : getStory(state.story)
  if (story !== undefined) params.set('s', story.id)
  if (def.sources.length > 0) params.set('src', sourceKey(state.source))
  if (hasPatch(state.patch)) params.set('patch', JSON.stringify(state.patch))
  else if (hasPatch(story?.patch)) params.set('patch', '{}')
  const base = story?.args ?? {}
  const unset: string[] = []
  for (const prop of def.props) {
    const value = state.args[prop.name]
    if (value === undefined) {
      if (base[prop.name] !== undefined) unset.push(prop.name)
    } else if (!deepEqual(value, base[prop.name])) {
      params.set(prop.name, encodeProp(prop, value))
    }
  }
  if (unset.length > 0) params.set('unset', unset.join(','))
  if (state.lang === 'en') params.set('lang', 'en')
  params.set('theme', state.theme)
  return `#${EXPLORER_PATH}?${params.toString()}`
}

export interface Parsed {
  readonly state: ExplorerState
  readonly notices: readonly Notice[]
}

/** The state an explorer hash describes. What cannot be used falls back to the story's value and gives one notice. */
export function parseHash(hash: string, fallbackTheme: Theme = 'light'): Parsed {
  const [, query = ''] = hash.replace(/^#/, '').split('?', 2)
  const params = new URLSearchParams(query)
  const notices: Notice[] = []
  const rawComponent = params.get('c')
  let id: ComponentId = 'playground'
  if (rawComponent !== null) {
    if (isComponentId(rawComponent)) id = rawComponent
    else notices.push({ code: 'component', detail: rawComponent })
  }
  const def = component(id)
  let story: Story | undefined
  const rawStory = params.get('s')
  if (rawStory !== null) {
    story = getStory(rawStory)
    if (story === undefined || story.component !== id) {
      notices.push({ code: 'story', detail: rawStory })
      story = undefined
    }
  }
  const fallback = story ?? basicStory(id)
  let source = fallback.source
  let patch: DocPatch | undefined = story?.patch
  const rawSource = params.get('src')
  if (rawSource !== null && def.sources.length > 0) {
    const parsed = parseSource(rawSource)
    if (parsed === undefined || !def.sources.includes(parsed.kind)) notices.push({ code: 'model', detail: rawSource })
    else {
      source = parsed
      if (story === undefined || sourceKey(parsed) !== sourceKey(story.source)) patch = undefined
    }
  }
  const rawPatch = params.get('patch')
  if (rawPatch !== null) {
    try {
      const value: unknown = JSON.parse(rawPatch)
      if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('not an object')
      patch = value as DocPatch
    } catch {
      notices.push({ code: 'patch', detail: rawPatch })
    }
  }
  const args: Record<string, unknown> = story === undefined ? {} : clone(story.args)
  for (const name of (params.get('unset') ?? '').split(',').filter((n) => n !== '')) delete args[name]
  for (const [name, text] of params) {
    if (RESERVED.includes(name)) continue
    const prop = def.props.find((p) => p.name === name)
    if (prop === undefined) {
      notices.push({ code: 'param', detail: name })
      continue
    }
    const decoded = decodeProp(prop, text)
    if (decoded.ok) args[name] = decoded.value
    else notices.push({ code: 'value', detail: name })
  }
  const state: ExplorerState = {
    component: id,
    ...(story === undefined ? {} : { story: story.id }),
    source,
    ...(hasPatch(patch) ? { patch } : {}),
    args,
    lang: params.get('lang') === 'en' ? 'en' : 'zh-TW',
    theme: params.get('theme') === 'dark' ? 'dark' : params.get('theme') === 'light' ? 'light' : fallbackTheme,
  }
  return { state, notices }
}
