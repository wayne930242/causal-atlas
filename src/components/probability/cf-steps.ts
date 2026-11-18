import type { LoadedCase } from '../../data/load.ts'
import type { Assignment, Edge, Prior, Value } from '../../engine/index.ts'
import { counterfactual, enumerateContexts, getVariable, renderIdent, toFormula } from '../../engine/index.ts'
import { formatValue, valuesEqual } from '../../engine/values.ts'
import type { Messages } from '../i18n/messages.ts'
import { textToLatex } from '../text/typeset-text.ts'
import type { Marginals } from '../model/probability-view.ts'
import { shownEdges } from '../graph/graph-layout.ts'
import { marginals, targetValue } from '../model/probability-view.ts'
import { assignmentText, changeNotes, fixed, probText, SAME_PROBABILITY } from '../model/wording.ts'

/** Pure helpers for the counterfactual stepper: Pearl's three steps drawn on one graph and a background table. */

/** A counterfactual question: the evidence in the actual world, the antecedent as do(), the event in the changed world. */
export interface CounterfactualSpec {
  /** What was observed, e.g. `D=1` or `X=1 and Y=1`. */
  readonly evidence: string
  readonly do: Assignment
  /** The event scored in the changed world, e.g. `D=0`. */
  readonly event: string
}

export type CfStepNumber = 1 | 2 | 3

/** What one step draws on the graph. */
export interface CfGraph {
  readonly probs: Readonly<Record<string, number>>
  readonly dists: Readonly<Record<string, readonly number[]>>
  readonly observed: Assignment
  readonly interventions: Assignment
  readonly removedEdges: readonly Edge[]
  readonly notes: Readonly<Record<string, string>>
}

/** One background (a setting of the exogenous variables) and what each step does to it. */
export interface BackgroundRow {
  readonly context: Assignment
  readonly prior: number
  /** P(u | evidence); 0 for a background the evidence rules out. */
  readonly posterior: number
  /** The event variable's value in the changed world, for a background the evidence keeps. */
  readonly after?: Value
  /** Whether the event holds in the changed world (kept backgrounds only). */
  readonly eventHolds?: boolean
}

export interface CfView {
  readonly graphs: Readonly<Record<CfStepNumber, CfGraph>>
  readonly rows: readonly BackgroundRow[]
  /** Backgrounds the evidence rules out, folded into one line (more than MAX_ROWS rows). */
  readonly hiddenZero: number
  readonly probability: number
  /** The event's variable, when the event is `X=v`. */
  readonly eventVariable?: string
  /** `P(D_{A=0}=0 | D=1)` as text and as LaTeX. */
  readonly expression: { readonly text: string; readonly latex: string }
}

/** Past this many backgrounds, the ones the evidence rules out fold into one line. */
const MAX_ROWS = 8

const EVENT = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(\S+)\s*$/

/** The evidence as an assignment when it is a conjunction of `X=v`; otherwise nothing is ringed. */
function evidenceAssignment(c: LoadedCase, evidence: string): Assignment {
  const out: Record<string, Value> = {}
  for (const part of evidence.split(/\s+and\s+/)) {
    const m = EVENT.exec(part)
    if (m === null || !c.model.byId.has(m[1])) return {}
    const variable = getVariable(c.model, m[1])
    const raw = m[2].replace(/^['"]|['"]$/g, '')
    const value = variable.domain.kind === 'boolean' ? raw === '1' || raw === 'true' : (variable.domain.values.find((v) => String(v) === raw) ?? raw)
    out[m[1]] = value
  }
  return out
}

/** A probability with up to four decimals, at least two: 0.0789, 0.50, 1.00. */
export function cfText(p: number): string {
  if (Number.isNaN(p)) return '—'
  return fixed(p, 4).replace(/(\.\d\d\d*?)0+$/, '$1')
}

/** `P(D_{A=0}=0 | D=1)`; an event that is not `X=v` keeps the bracket form `P([A←0](φ) | e)`. */
function expressionOf(spec: CounterfactualSpec): { text: string; latex: string } {
  const sub = assignmentText(spec.do)
  const m = EVENT.exec(spec.event)
  if (m !== null) {
    return {
      text: `P(${m[1]}_{${sub}}=${m[2]} | ${spec.evidence})`,
      latex: `P({${renderIdent(m[1], 'latex')}}_{${textToLatex(sub)}}=${textToLatex(m[2])} \\mid ${textToLatex(spec.evidence)})`,
    }
  }
  const bracket = `[${Object.entries(spec.do)
    .map(([id, v]) => `${id}←${formatValue(v)}`)
    .join(', ')}](${spec.event})`
  const text = `P(${bracket} | ${spec.evidence})`
  return { text, latex: textToLatex(text) }
}

/** Descendants of `ids` along the model's edges (not `ids` themselves). */
function descendants(edges: readonly Edge[], ids: readonly string[]): Set<string> {
  const out = new Set<string>()
  const queue = [...ids]
  while (queue.length > 0) {
    const id = queue.shift() as string
    for (const e of edges) {
      if (e.from === id && !out.has(e.to) && !ids.includes(e.to)) {
        out.add(e.to)
        queue.push(e.to)
      }
    }
  }
  return out
}

/**
 * The three steps (Pearl, Causality §7.1) for `spec` under `prior`: 1 abduction, P(· | evidence)
 * with the evidence ringed; 2 action, do() set and the arrows into it cut, the variables below it
 * not yet recomputed; 3 prediction, P(V in the changed world | evidence). The table lists every
 * background with its prior, its posterior and, for the kept ones, the event variable afterwards.
 */
export function cfView(t: Messages, c: LoadedCase, prior: Prior, spec: CounterfactualSpec, shown: readonly string[], digits = 2): CfView {
  const { model } = c
  const result = counterfactual(model, prior, spec)
  const base = marginals(model, prior)
  const abduced = marginals(model, prior, { given: spec.evidence })
  const twoValued = shown.filter((id) => getVariable(model, id).domain.kind === 'boolean')

  // Prediction: each variable's value in the changed world, weighted by the posterior.
  const p: Record<string, number> = {}
  const dist: Record<string, number[]> = {}
  for (const v of model.variables) {
    p[v.id] = 0
    if (v.domain.kind === 'finite') dist[v.id] = v.domain.values.map(() => 0)
  }
  for (const w of result.worlds) {
    for (const v of model.variables) {
      const value = w.counterfactual[v.id]
      if (value === undefined) continue
      if (valuesEqual(value, targetValue(v))) p[v.id] += w.posterior
      if (v.domain.kind === 'finite') {
        const at = v.domain.values.findIndex((o) => valuesEqual(o, value))
        if (at >= 0) dist[v.id][at] += w.posterior
      }
    }
  }
  const predicted: Marginals = { p, dist, evidence: result.evidenceProbability }

  const cutInto = new Set(Object.keys(spec.do))
  const removedEdges = shownEdges(model.edges, shown).filter((e) => cutInto.has(e.to))
  // Action: do() set, the variables it reaches still at their abduced numbers.
  const later = descendants(model.edges, Object.keys(spec.do))
  const acted: Record<string, number> = { ...abduced.p }
  for (const [id, value] of Object.entries(spec.do)) acted[id] = valuesEqual(value, targetValue(getVariable(model, id))) ? 1 : 0
  const pending: Record<string, string> = {}
  for (const id of shown) if (later.has(id)) pending[id] = t.notRecomputed

  // Prediction notes: 實際 v where the changed world moved away from the abduced one.
  const actually: Record<string, string> = {}
  for (const id of twoValued) {
    const a = abduced.p[id]
    const b = predicted.p[id]
    if (a !== undefined && b !== undefined && Math.abs(a - b) >= SAME_PROBABILITY) actually[id] = t.actually(probText(a, digits))
  }

  const observed = evidenceAssignment(c, spec.evidence)
  const graphs: Record<CfStepNumber, CfGraph> = {
    1: { probs: abduced.p, dists: abduced.dist, observed, interventions: {}, removedEdges: [], notes: changeNotes(t, base.p, abduced.p, twoValued, undefined, digits) },
    2: { probs: acted, dists: abduced.dist, observed: {}, interventions: spec.do, removedEdges, notes: pending },
    3: { probs: predicted.p, dists: predicted.dist, observed: {}, interventions: spec.do, removedEdges, notes: actually },
  }

  const event = EVENT.exec(spec.event)
  const eventVariable = event !== null && model.byId.has(event[1]) ? event[1] : undefined
  const key = (a: Assignment): string => model.exogenous.map((id) => `${id}=${formatValue(a[id] ?? '')}`).join(',')
  const kept = new Map(result.worlds.map((w) => [key(w.context), w]))
  // The formula parses once here, so a bad event fails before any row is drawn.
  toFormula(model, spec.event)
  let rows: BackgroundRow[] = enumerateContexts(model, prior).map(({ context, p: weight }) => {
    const w = kept.get(key(context))
    return w === undefined
      ? { context, prior: weight, posterior: 0 }
      : { context, prior: weight, posterior: w.posterior, after: eventVariable === undefined ? undefined : w.counterfactual[eventVariable], eventHolds: w.eventHolds }
  })
  let hiddenZero = 0
  if (rows.length > MAX_ROWS) {
    hiddenZero = rows.filter((r) => r.posterior === 0).length
    rows = rows.filter((r) => r.posterior > 0)
  }
  return { graphs, rows, hiddenZero, probability: result.probability ?? Number.NaN, eventVariable, expression: expressionOf(spec) }
}
