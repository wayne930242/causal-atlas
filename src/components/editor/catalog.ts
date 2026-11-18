import { caseIds, getCase } from '../../data/index.ts'
import type { CaseFamily, ModelDoc } from '../../data/schema.ts'
import { familySchema } from '../../data/schema.ts'
import type { Locale, LocalizedText } from '../../engine/index.ts'
import type { Messages } from '../i18n/messages.ts'

/** A link the host gives for a case or model, e.g. a lesson that uses it. */
export interface LessonLink {
  readonly title: string
  readonly href: string
}

/** A model the host lists in the editor's model list beside the bundled cases, e.g. a lesson's model. */
export interface ExtraModel {
  /** Unique among the extra models; `initial` may name it. */
  readonly id: string
  readonly title: string | LocalizedText
  /** The heading it is listed under. Default 講義模型 / Lesson models. */
  readonly group?: string | LocalizedText
  /** The model, as `CausalPlayground`'s `doc` takes it; validated when chosen. */
  readonly doc: ModelDoc
  /** Shown in the panel above the model, e.g. the lessons that use it. */
  readonly links?: readonly LessonLink[]
}

/** The select value of an extra model; case ids are kebab-case, so the prefix cannot clash with one. */
export const modelKey = (id: string): string => `model:${id}`

export interface CatalogEntry {
  /** The list value: a case id, or `model:<id>`. */
  readonly key: string
  readonly label: string
  /** A case's subtitle in the interface language; host models have none. */
  readonly subtitle?: string
  /** Lower-cased text the filter matches: titles in both languages, id, group. */
  readonly search: string
}

export interface CatalogGroup {
  /** Stable among the groups: `family:<family>` for bundled cases, `group:<label>` for host models. */
  readonly id: string
  readonly label: string
  readonly entries: readonly CatalogEntry[]
}

export const textIn = (text: string | LocalizedText, locale: Locale): string => (typeof text === 'string' ? text : text[locale])

const allText = (text: string | LocalizedText): string[] => (typeof text === 'string' ? [text] : Object.values(text))

/** Bundled cases by family (in the schema's order, titles sorted), then the host's models by group. */
export function catalog(t: Messages, extras: readonly ExtraModel[]): CatalogGroup[] {
  const byFamily = new Map<CaseFamily, CatalogEntry[]>()
  for (const id of caseIds) {
    const data = getCase(id).data
    const familyLabel = t.family[data.family]
    const entry: CatalogEntry = {
      key: id,
      label: data.title[t.locale],
      subtitle: data.subtitle?.[t.locale],
      search: [id, ...Object.values(data.title), ...Object.values(data.subtitle ?? {}), familyLabel].join(' ').toLowerCase(),
    }
    byFamily.set(data.family, [...(byFamily.get(data.family) ?? []), entry])
  }
  const groups: CatalogGroup[] = familySchema.options
    .filter((f) => byFamily.has(f))
    .map((f) => ({
      id: `family:${f}`,
      label: t.family[f],
      entries: [...(byFamily.get(f) ?? [])].sort((a, b) => a.label.localeCompare(b.label, t.locale)),
    }))
  const byGroup = new Map<string, CatalogEntry[]>()
  const seen = new Set<string>()
  for (const m of extras) {
    if (seen.has(m.id)) continue
    seen.add(m.id)
    const label = m.group === undefined ? t.editor.lessonModels : textIn(m.group, t.locale)
    const entry = {
      key: modelKey(m.id),
      label: textIn(m.title, t.locale),
      search: [m.id, ...allText(m.title), ...(m.group === undefined ? [label] : allText(m.group))].join(' ').toLowerCase(),
    }
    byGroup.set(label, [...(byGroup.get(label) ?? []), entry])
  }
  for (const [label, entries] of byGroup) groups.push({ id: `group:${label}`, label, entries })
  return groups
}

/** The chip id that stands for every host model group at once. */
export const HOST_CHIP = 'host'

/** True when the entry's text holds every word of `query`; an empty query matches everything. */
export function matches(entry: CatalogEntry, query: string): boolean {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w !== '')
    .every((w) => entry.search.includes(w))
}

/** The groups (all, or only the one with id `only`, or all host groups for HOST_CHIP) with just the entries matching `query`; empty groups drop out. */
export function filterCatalog(groups: readonly CatalogGroup[], query: string, only?: string): CatalogGroup[] {
  return groups
    .filter((g) => only === undefined || (only === HOST_CHIP ? g.id.startsWith('group:') : g.id === only))
    .map((g) => ({ ...g, entries: g.entries.filter((e) => matches(e, query)) }))
    .filter((g) => g.entries.length > 0)
}
