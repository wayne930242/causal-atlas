import type { LoadedCase } from '../../data/load.ts'
import type { Assignment, Edge, MediationResult, MediationWorld, Prior, Value } from '../../engine/index.ts'
import { coerceToDomain, evaluate, getVariable, holdsIn, mediation, renderIdent, toFormula } from '../../engine/index.ts'
import { formatValue, valuesEqual } from '../../engine/values.ts'
import { shownEdges } from '../graph/graph-layout.ts'
import { targetValue } from '../model/probability-view.ts'
import { textToLatex } from '../text/typeset-text.ts'
import type { CfGraph } from './cf-steps.ts'
import { cfText } from './cf-steps.ts'

/** Pure helpers for the mediation stepper: Pearl's direct and indirect effects drawn on one graph, with the tables the lesson reads. */

/** A mediation question: the treatment, its mediators, the outcome event and the transition `from` → `to`. */
export interface MediationSpec {
  /** The treatment X, an endogenous variable. */
  readonly treatment: string
  /** The mediators Z⃗, endogenous variables other than X; Pearl takes all parents of Y other than X. */
  readonly mediators: readonly string[]
  /** The outcome event, e.g. `Y=1`. */
  readonly outcome: string
  /** The transition from x (`from`) to x* (`to`). */
  readonly from: Value
  readonly to: Value
  /** Also show the mediation formula (4.17)/(4.18) from the observational distribution. */
  readonly formula?: boolean
}

export type MediationStepNumber = 1 | 2 | 3 | 4

const EVENT = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(\S+)\s*$/

/** A potential outcome's probability as text and LaTeX: `P(Y_{X=1, Z_{X=0}}=1)`. */
export interface Term {
  readonly text: string
  readonly latex: string
}

/** One probability the step draws or subtracts: the term and its value. */
export interface Reading {
  readonly term: Term
  readonly value: number
}

export interface MediationStepView {
  /** The world the graph draws. */
  readonly graph: CfGraph
  /** Mediators held at the value they take under another treatment value, with their tag text (`Z←Z(X=0)`). */
  readonly natural: Readonly<Record<string, string>>
  /** The probability on the left of the minus sign: the world the graph draws. */
  readonly drawn: Reading
  /** The probability it is compared with. */
  readonly reference: Reading
  /** The effect: drawn minus reference. */
  readonly effect: number
}

export interface MediationView {
  readonly result: MediationResult
  /** Steps 1, 3 and 4. */
  readonly steps: Readonly<Record<1 | 3 | 4, MediationStepView>>
  /** Step 2, one view per setting of the mediators, in `result.controlled` order. */
  readonly controlled: readonly (MediationStepView & { readonly z: Assignment })[]
  /** `X=0 → X=1`. */
  readonly transition: string
  /** The two treatment values as text, `0` and `1`. */
  readonly fromText: string
  readonly toText: string
  /** The outcome's variable, when the outcome is `V=v`. */
  readonly outcomeVariable?: string
}

/** The effects tab's checks: whether TE = NDE − IE(reverse), and the mediation formula against NDE and NIE. */
export interface MediationChecks {
  readonly decomposes: boolean
  readonly formulaDirect?: 'equal' | 'differ' | 'undefined'
  readonly formulaIndirect?: 'equal' | 'differ' | 'undefined'
}

export function mediationChecks(result: MediationResult): MediationChecks {
  const decomposes = Math.abs(result.total - (result.naturalDirect - result.reverseIndirect)) <= 1e-9
  const f = result.formula
  if (f === undefined) return { decomposes }
  const against = (a: number | undefined, b: number): 'equal' | 'differ' | 'undefined' =>
    a === undefined ? 'undefined' : Math.abs(a - b) <= 1e-7 ? 'equal' : 'differ'
  return {
    decomposes,
    formulaDirect: against(f.direct, result.naturalDirect),
    formulaIndirect: against(f.indirect, result.naturalIndirect),
  }
}

/** A signed effect with a real minus sign: `+0.15`, `−0.1875`, `0.00`. */
export function effectText(x: number): string {
  if (Number.isNaN(x)) return '—'
  const body = cfText(Math.abs(x))
  return Math.abs(x) < 0.5e-4 ? '0.00' : `${x < 0 ? '−' : '+'}${body}`
}

const latexOf = (id: string): string => `{${renderIdent(id, 'latex')}}`

/** What a world sets besides the treatment: constants for the mediators, or each held at its value under treatment `at`. */
type Held = { readonly z: Assignment } | { readonly at: Value }

/** `Y_{X=1, Z_{X=0}}`-style probability `P(Y_{…}=1)`; an outcome that is not `V=v` keeps the bracket form `P([X←1, Z←Z(X=0)](φ))`. */
function probabilityTerm(spec: MediationSpec, x: Value, held: Held | undefined): Term {
  const treatment = `${spec.treatment}=${formatValue(x)}`
  const setters: { text: string; latex: string; bracket: string }[] = [
    { text: treatment, latex: textToLatex(treatment), bracket: `${spec.treatment}←${formatValue(x)}` },
  ]
  if (held !== undefined && 'z' in held) {
    for (const [id, v] of Object.entries(held.z)) {
      const eq = `${id}=${formatValue(v)}`
      setters.push({ text: eq, latex: textToLatex(eq), bracket: `${id}←${formatValue(v)}` })
    }
  } else if (held !== undefined) {
    const at = `${spec.treatment}=${formatValue(held.at)}`
    for (const id of spec.mediators)
      setters.push({ text: `${id}_{${at}}`, latex: `${latexOf(id)}_{${textToLatex(at)}}`, bracket: naturalTag(spec, id, held.at) })
  }
  const m = EVENT.exec(spec.outcome)
  if (m !== null) {
    return {
      text: `P(${m[1]}_{${setters.map((s) => s.text).join(', ')}}=${m[2]})`,
      latex: `P(${latexOf(m[1])}_{${setters.map((s) => s.latex).join(',\\ ')}}=${textToLatex(m[2])})`,
    }
  }
  const text = `P([${setters.map((s) => s.bracket).join(', ')}](${spec.outcome}))`
  return { text, latex: textToLatex(text) }
}

/** The tag beside a mediator held at its natural value: `Z←Z(X=0)`. */
export function naturalTag(spec: MediationSpec, id: string, at: Value): string {
  return `${id}←${id}(${spec.treatment}=${formatValue(at)})`
}

/** Each variable's distribution over weighted worlds, in the form the signal graph draws. */
function marginalsOf(
  c: LoadedCase,
  worlds: readonly { readonly values: Assignment; readonly p: number }[],
): Pick<CfGraph, 'probs' | 'dists'> {
  const probs: Record<string, number> = {}
  const dists: Record<string, number[]> = {}
  for (const v of c.model.variables) {
    probs[v.id] = 0
    if (v.domain.kind === 'finite') dists[v.id] = v.domain.values.map(() => 0)
  }
  for (const w of worlds) {
    for (const v of c.model.variables) {
      const value = w.values[v.id]
      if (value === undefined) continue
      if (valuesEqual(value, targetValue(v))) probs[v.id] += w.p
      if (v.domain.kind === 'finite') {
        const at = v.domain.values.findIndex((o) => valuesEqual(o, value))
        if (at >= 0) dists[v.id][at] += w.p
      }
    }
  }
  // Sums of many weights miss 1 and 0 by rounding error; a variable the world sets must read exactly 1 or 0.
  const clean = (x: number): number => (Math.abs(x) < 1e-9 ? 0 : Math.abs(x - 1) < 1e-9 ? 1 : x)
  for (const id of Object.keys(probs)) probs[id] = clean(probs[id])
  for (const id of Object.keys(dists)) dists[id] = dists[id].map(clean)
  return { probs, dists }
}

/**
 * The mediation question on a loaded case: the engine's result, and for each step the world it
 * draws (the marginals of every variable in that world, the do() tags, the arrows cut), the two
 * probabilities it subtracts and their difference. Step 2 has one view per setting of the mediators.
 */
export function mediationView(c: LoadedCase, prior: Prior, spec: MediationSpec, shown: readonly string[]): MediationView {
  const { model } = c
  const result = mediation(model, prior, spec)
  const outcome = toFormula(model, spec.outcome)
  const treatment = getVariable(model, spec.treatment)
  const from = coerceToDomain(treatment, spec.from)
  const to = coerceToDomain(treatment, spec.to)
  const edges = shownEdges(model.edges, shown)

  /** The world `settings` sets in every background: its marginals, its do() clamps, and P(outcome). */
  const world = (settings: (w: MediationWorld) => Assignment): { graph: CfGraph; p: number } => {
    const worlds = result.worlds.map((w) => ({ values: evaluate(model, w.context, settings(w)).values, p: w.p }))
    const first = settings(result.worlds[0])
    const cut = new Set(Object.keys(first))
    const removedEdges: Edge[] = edges.filter((e) => cut.has(e.to))
    const p = worlds.reduce((sum, w) => sum + (holdsIn(w.values, outcome) ? w.p : 0), 0)
    // A mediator held at a natural value differs by background; the graph draws any one of them as its clamp, the tag says what it is.
    return { graph: { ...marginalsOf(c, worlds), observed: {}, interventions: first, removedEdges, notes: {} }, p }
  }
  const reading = (term: Term, value: number): Reading => ({ term, value })
  const step = (
    drawn: { graph: CfGraph; p: number },
    term: Term,
    reference: Reading,
    effect: number,
    natural: Readonly<Record<string, string>> = {},
  ): MediationStepView => ({ graph: drawn.graph, natural, drawn: reading(term, drawn.p), reference, effect })

  const naturalTags = (at: Value): Record<string, string> => Object.fromEntries(spec.mediators.map((id) => [id, naturalTag(spec, id, at)]))
  const atFrom = world(() => ({ [spec.treatment]: from }))
  const refFrom = reading(probabilityTerm(spec, from, undefined), atFrom.p)

  const steps = {
    1: step(
      world(() => ({ [spec.treatment]: to })),
      probabilityTerm(spec, to, undefined),
      refFrom,
      result.total,
    ),
    3: step(
      world((w) => ({ [spec.treatment]: to, ...w.zFrom })),
      probabilityTerm(spec, to, { at: from }),
      refFrom,
      result.naturalDirect,
      naturalTags(from),
    ),
    4: step(
      world((w) => ({ [spec.treatment]: from, ...w.zTo })),
      probabilityTerm(spec, from, { at: to }),
      refFrom,
      result.naturalIndirect,
      naturalTags(to),
    ),
  } as const

  const controlled = result.controlled.map((entry) => {
    const held = world(() => ({ [spec.treatment]: from, ...entry.z }))
    const drawn = world(() => ({ [spec.treatment]: to, ...entry.z }))
    return {
      z: entry.z,
      ...step(drawn, probabilityTerm(spec, to, { z: entry.z }), reading(probabilityTerm(spec, from, { z: entry.z }), held.p), entry.value),
    }
  })

  const event = EVENT.exec(spec.outcome)
  return {
    result,
    steps,
    controlled,
    transition: `${spec.treatment}=${formatValue(from)} → ${spec.treatment}=${formatValue(to)}`,
    fromText: formatValue(from),
    toText: formatValue(to),
    outcomeVariable: event !== null && model.byId.has(event[1]) ? event[1] : undefined,
  }
}
