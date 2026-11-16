import type { LoadedCase } from '../../data/load.ts'
import { caseToDoc, docToCase } from '../../data/model-doc.ts'
import type { ModelDoc } from '../../data/schema.ts'
import { MODEL_DOC_FORMAT, modelDocSchema } from '../../data/schema.ts'
import type { Value, Variable } from '../../engine/index.ts'
import { CyclicModelError, ParseError, parseExpr } from '../../engine/index.ts'
import { checkExpr } from '../../engine/model.ts'
import { gridLayout, shownVariables } from '../view-model.ts'

/**
 * The editor's working state. Variables carry a stable `key` so renaming an id keeps its
 * equation, values and position; text fields hold what the user typed until it parses.
 */

export interface DraftVariable {
  readonly key: string
  readonly id: string
  readonly label: string
  /** Kept from a loaded case; new variables reuse the Chinese label. */
  readonly en?: string
  readonly kind: 'exogenous' | 'endogenous'
  readonly domain: 'boolean' | 'list'
  /** For a list domain: the values as typed, separated by commas. */
  readonly values: string
  readonly shown: boolean
}

export type DraftMode = 'value' | 'probability'

export interface Draft {
  readonly title: string
  readonly from?: string
  readonly variables: readonly DraftVariable[]
  /** By variable key. */
  readonly equations: Readonly<Record<string, string>>
  readonly mode: DraftMode
  /** Actual value per exogenous variable, as its text (`1`, `0`, `one`). */
  readonly context: Readonly<Record<string, string>>
  /** Probability per domain value (booleans: one number, P(=1)). */
  readonly priors: Readonly<Record<string, readonly number[]>>
  /** Default value per variable, as text; absent means none. */
  readonly normality: Readonly<Record<string, string>>
  readonly layout: Readonly<Record<string, readonly [number, number]>>
}

export const RESERVED = new Set(['and', 'or', 'not', 'if', 'then', 'else', 'true', 'false', 'iff', 'implies'])
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/

let counter = 0
export function newKey(): string {
  counter += 1
  return `v${Date.now().toString(36)}${counter}`
}

export function blankDraft(): Draft {
  return { title: '我的模型', variables: [], equations: {}, mode: 'value', context: {}, priors: {}, normality: {}, layout: {} }
}

/** Domain values typed as `a, b，c`: numbers become numbers. */
export function parseValues(text: string): (string | number)[] {
  return text
    .split(/[,，、\s]+/)
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .map((s) => (/^-?\d+(\.\d+)?$/.test(s) ? Number(s) : s))
}

/** The values a variable can take, as the text the selects use. */
export function valueTexts(v: DraftVariable): string[] {
  return v.domain === 'boolean' ? ['1', '0'] : parseValues(v.values).map(String)
}

function valueOf(v: DraftVariable, text: string): Value {
  if (v.domain === 'boolean') return text === '1'
  return parseValues(v.values).find((x) => String(x) === text) ?? text
}

export function draftFromDoc(doc: ModelDoc, layoutFrom?: LoadedCase): Draft {
  const keys = new Map(doc.model.variables.map((v) => [v.id, newKey()]))
  const key = (id: string): string => keys.get(id) ?? id
  const loaded = layoutFrom ?? docToCase(doc)
  const shown = doc.layout !== undefined ? Object.keys(doc.layout) : shownVariables(loaded)
  const grid = gridLayout(loaded, shown)
  const variables: DraftVariable[] = doc.model.variables.map((v) => ({
    key: key(v.id),
    id: v.id,
    label: v.label.zh,
    en: v.label.en,
    kind: v.kind,
    domain: v.domain === 'boolean' ? 'boolean' : 'list',
    values: v.domain === 'boolean' ? '' : v.domain.join(', '),
    shown: shown.includes(v.id),
  }))
  const byId = new Map(variables.map((v) => [v.id, v]))
  const text = (_id: string, value: Value): string => (typeof value === 'boolean' ? (value ? '1' : '0') : String(value))
  const equations: Record<string, string> = {}
  for (const [id, eq] of Object.entries(doc.model.equations)) equations[key(id)] = typeof eq === 'string' ? eq : ''
  const context: Record<string, string> = {}
  for (const id of loaded.model.exogenous) {
    const v = byId.get(id)
    const value = loaded.context?.[id] ?? doc.context?.[id]
    if (v !== undefined) context[v.key] = value === undefined ? (valueTexts(v)[0] ?? '') : text(id, value)
  }
  const priors: Record<string, number[]> = {}
  const prior = doc.priors
  for (const id of loaded.model.exogenous) {
    const v = byId.get(id)
    if (v === undefined) continue
    const values = valueTexts(v)
    const raw = prior !== undefined && 'independent' in prior ? prior.independent[id] : undefined
    if (typeof raw === 'number') priors[v.key] = [raw]
    else if (raw !== undefined) {
      const ps = values.map((t) => raw.filter(([x]) => text(id, x) === t).reduce((s, [, p]) => s + p, 0))
      priors[v.key] = v.domain === 'boolean' ? [ps[0]] : ps
    } else {
      priors[v.key] = v.domain === 'boolean' ? [0.5] : values.map(() => 1 / Math.max(values.length, 1))
    }
  }
  const normality: Record<string, string> = {}
  for (const [id, value] of Object.entries(doc.normality ?? {})) normality[key(id)] = text(id, value)
  const layout: Record<string, [number, number]> = {}
  for (const [id, p] of grid) layout[key(id)] = [p.col, p.row]
  return {
    title: doc.title,
    from: doc.from,
    variables,
    equations,
    mode: doc.context !== undefined ? 'value' : 'probability',
    context,
    priors,
    normality,
    layout,
  }
}

export function draftFromCase(c: LoadedCase): Draft {
  return draftFromDoc(caseToDoc(c), c)
}

export interface DraftErrors {
  /** By variable key. */
  readonly variables: Readonly<Record<string, string>>
  /** By variable key. */
  readonly equations: Readonly<Record<string, string>>
  /** By variable key: context, priors or normality problems. */
  readonly values: Readonly<Record<string, string>>
  readonly cycle?: readonly string[]
  readonly model?: string
}

export interface Compiled {
  readonly doc?: ModelDoc
  readonly loaded?: LoadedCase
  readonly errors: DraftErrors
  readonly count: number
}

function domainOf(v: DraftVariable): Variable['domain'] {
  return v.domain === 'boolean' ? { kind: 'boolean' } : { kind: 'finite', values: parseValues(v.values) }
}

/** Check the draft and build the model; every problem is reported where the user typed it. */
export function compileDraft(draft: Draft): Compiled {
  const variableErrors: Record<string, string> = {}
  const equationErrors: Record<string, string> = {}
  const valueErrors: Record<string, string> = {}
  const seen = new Map<string, number>()
  for (const v of draft.variables) seen.set(v.id, (seen.get(v.id) ?? 0) + 1)
  for (const v of draft.variables) {
    if (!IDENT.test(v.id)) variableErrors[v.key] = '代號要用英文字母開頭，只能有英文字母、數字和底線'
    else if (RESERVED.has(v.id)) variableErrors[v.key] = `${v.id} 是式子裡的保留字`
    else if ((seen.get(v.id) ?? 0) > 1) variableErrors[v.key] = `代號 ${v.id} 重複了`
    else if (v.domain === 'list') {
      const values = parseValues(v.values)
      if (values.length < 2) variableErrors[v.key] = '列舉的值至少要兩個'
      else if (new Set(values.map(String)).size !== values.length) variableErrors[v.key] = '列舉的值有重複'
    }
  }
  const ok = Object.keys(variableErrors).length === 0
  const byId = new Map<string, Variable>(
    ok ? draft.variables.map((v) => [v.id, { id: v.id, label: { zh: v.label || v.id, en: v.en ?? (v.label || v.id) }, kind: v.kind, domain: domainOf(v) }]) : [],
  )
  if (ok) {
    for (const v of draft.variables) {
      if (v.kind !== 'endogenous') continue
      const source = (draft.equations[v.key] ?? '').trim()
      if (source === '') {
        equationErrors[v.key] = '還沒寫式子'
        continue
      }
      try {
        const owner = byId.get(v.id)
        checkExpr(parseExpr(source), byId, v.id, owner)
      } catch (error) {
        equationErrors[v.key] = error instanceof ParseError ? `看不懂這條式子：${error.message}` : `式子有誤：${(error as Error).message}`
      }
    }
  }
  // Context, priors and defaults.
  const context: Record<string, Value> = {}
  const independent: Record<string, number | [Value, number][]> = {}
  const normality: Record<string, Value> = {}
  if (ok) {
    for (const v of draft.variables) {
      const texts = valueTexts(v)
      if (v.kind === 'exogenous') {
        const t = draft.context[v.key] ?? texts[0]
        if (!texts.includes(t)) valueErrors[v.key] = `${v.id} 的值 ${t} 不在值域裡`
        else context[v.id] = valueOf(v, t)
        const ps = draft.priors[v.key] ?? []
        if (v.domain === 'boolean') {
          const p = ps[0] ?? 0.5
          if (!(p >= 0 && p <= 1)) valueErrors[v.key] = `P(${v.id}=1) 要在 0 到 1 之間`
          independent[v.id] = p
        } else {
          const weights = texts.map((_, i) => ps[i] ?? 0)
          const total = weights.reduce((s, w) => s + w, 0)
          if (weights.some((w) => !(w >= 0)) || !(total > 0)) valueErrors[v.key] = `${v.id} 的機率要是非負數，加起來大於 0`
          else independent[v.id] = texts.map((t, i) => [valueOf(v, t), weights[i] / total])
        }
      }
      const n = draft.normality[v.key]
      if (n !== undefined && n !== '') {
        if (!texts.includes(n)) valueErrors[v.key] = `${v.id} 的常態值 ${n} 不在值域裡`
        else normality[v.id] = valueOf(v, n)
      }
    }
  }
  const count = Object.keys(variableErrors).length + Object.keys(equationErrors).length + Object.keys(valueErrors).length
  const errors = { variables: variableErrors, equations: equationErrors, values: valueErrors }
  if (count > 0 || draft.variables.length === 0) return { errors, count }

  const layout: Record<string, [number, number]> = {}
  for (const v of draft.variables) {
    const p = draft.layout[v.key]
    if (v.shown && p !== undefined) layout[v.id] = [p[0], p[1]]
  }
  const equations: Record<string, string> = {}
  for (const v of draft.variables) if (v.kind === 'endogenous') equations[v.id] = (draft.equations[v.key] ?? '').trim()
  const raw = {
    format: MODEL_DOC_FORMAT,
    version: 1,
    title: draft.title.trim() || '我的模型',
    from: draft.from,
    model: {
      variables: draft.variables.map((v) => ({
        id: v.id,
        label: { zh: v.label || v.id, en: v.en ?? (v.label || v.id) },
        kind: v.kind,
        domain: v.domain === 'boolean' ? 'boolean' : parseValues(v.values),
      })),
      equations,
    },
    context: draft.mode === 'value' ? context : undefined,
    priors: draft.mode === 'probability' ? { independent } : undefined,
    normality: Object.keys(normality).length > 0 ? normality : undefined,
    layout,
  }
  const parsed = modelDocSchema.safeParse(raw)
  if (!parsed.success) {
    return { errors: { ...errors, model: parsed.error.issues.map((i) => `${i.path.join('.')}：${i.message}`).join('；') }, count: 1 }
  }
  try {
    return { doc: parsed.data, loaded: docToCase(parsed.data), errors, count: 0 }
  } catch (error) {
    if (error instanceof CyclicModelError) {
      return { errors: { ...errors, cycle: error.cycle, model: `式子繞成一圈：${error.cycle.join(' → ')}` }, count: 1 }
    }
    return { errors: { ...errors, model: (error as Error).message }, count: 1 }
  }
}

/** A free grid cell for a newly shown variable: the first gap, row by row. */
export function freeCell(layout: Readonly<Record<string, readonly [number, number]>>): [number, number] {
  const taken = new Set(Object.values(layout).map(([c, r]) => `${Math.round(c)},${Math.round(r)}`))
  const cols = Math.max(2, ...Object.values(layout).map(([c]) => Math.round(c) + 2))
  for (let row = 0; ; row += 1) {
    for (let col = 0; col < cols; col += 1) if (!taken.has(`${col},${row}`)) return [col, row]
  }
}
