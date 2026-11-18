import type { Draft, DraftVariable } from './draft.ts'
import { freeCell, newKey, valueTexts } from './draft.ts'

/** The editor's edits of a draft, each a new draft (or the same one when it changes nothing). */

/** Default priors of a variable: P(=1) = 0.5 for a boolean one, uniform over a list. */
export function priorsFor(v: DraftVariable): number[] {
  const n = valueTexts(v).length
  return v.domain === 'boolean' ? [0.5] : Array.from({ length: n }, () => 1 / Math.max(n, 1))
}

/** The draft with variable `key` patched; its context value, priors and layout cell follow its new kind, values and visibility. */
export function withVariable(d: Draft, key: string, patch: Partial<DraftVariable>): Draft {
  const variables = d.variables.map((v) => (v.key === key ? { ...v, ...patch } : v))
  const v = variables.find((x) => x.key === key)
  if (v === undefined) return d
  const texts = valueTexts(v)
  const context = { ...d.context }
  if (v.kind === 'exogenous' && !texts.includes(context[key] ?? '')) context[key] = texts[0] ?? ''
  const priors = { ...d.priors }
  const want = v.domain === 'boolean' ? 1 : texts.length
  if ((priors[key]?.length ?? 0) !== want) priors[key] = priorsFor(v)
  const layout = { ...d.layout }
  if (v.shown && layout[key] === undefined) layout[key] = freeCell(layout)
  return { ...d, variables, context, priors, layout }
}

/** The draft with a new boolean endogenous variable V<n>, an empty equation and a free cell. */
export function withNewVariable(d: Draft): Draft {
  const ids = new Set(d.variables.map((v) => v.id))
  let n = d.variables.length + 1
  while (ids.has(`V${n}`)) n += 1
  const key = newKey()
  const v: DraftVariable = { key, id: `V${n}`, label: '', en: '', kind: 'endogenous', domain: 'boolean', values: '', shown: true }
  return {
    ...d,
    variables: [...d.variables, v],
    equations: { ...d.equations, [key]: '' },
    context: { ...d.context, [key]: '1' },
    priors: { ...d.priors, [key]: [0.5] },
    layout: { ...d.layout, [key]: freeCell(d.layout) },
  }
}

/** The draft without variable `key` and everything stored under it. */
export function withoutVariable(d: Draft, key: string): Draft {
  const drop = <T,>(r: Readonly<Record<string, T>>): Record<string, T> => {
    const out = { ...r }
    delete out[key]
    return out
  }
  return {
    ...d,
    variables: d.variables.filter((v) => v.key !== key),
    equations: drop(d.equations),
    context: drop(d.context),
    priors: drop(d.priors),
    normality: drop(d.normality),
    layout: drop(d.layout),
  }
}

/** The draft with variable `id` moved by (`dCol`, `dRow`) grid steps. */
export function withMove(d: Draft, id: string, dCol: number, dRow: number): Draft {
  const v = d.variables.find((x) => x.id === id)
  const at = v === undefined ? undefined : d.layout[v.key]
  if (v === undefined || at === undefined) return d
  return { ...d, layout: { ...d.layout, [v.key]: [at[0] + dCol, at[1] + dRow] } }
}
