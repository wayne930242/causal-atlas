import type { LoadedCase } from '../../data/load.ts'
import type { Arith } from '../../engine/arithmetic.ts'
import { evalArith, toArith } from '../../engine/arithmetic.ts'
import type { Assignment, CausalModel, Notation } from '../../engine/index.ts'
import { renderArith, renderEquation, renderIdent, renderValue } from '../../engine/index.ts'
import { freeVariables } from '../../engine/expr.ts'
import { formatValue } from '../../engine/values.ts'
import type { Messages } from '../i18n/messages.ts'
import type { Stochastic } from '../model/assignments.ts'
import { label, probText } from '../model/wording.ts'

/** The rows of the equation list: which variables have one, each equation as written and with the values put in. */

/**
 * Endogenous variables whose equation is shown: every one, also when none of its parents is drawn
 * (`Y = U2`). An intervened one's replaced equation is shown struck through.
 */
export function equationIds(c: LoadedCase): string[] {
  return [...c.model.endogenous]
}

function substitute(a: Arith, values: Assignment): Arith {
  switch (a.op) {
    case 'num':
      return a
    case 'var': {
      const v = values[a.name]
      if (v === undefined) return a
      return { op: 'num', value: typeof v === 'boolean' ? (v ? 1 : 0) : v }
    }
    case 'sub':
      return { op: 'sub', left: substitute(a.left, values), right: substitute(a.right, values) }
    case 'add':
    case 'mul':
    case 'max':
      return { op: a.op, args: a.args.map((x) => substitute(x, values)) }
    case 'abs':
      return { op: 'abs', arg: substitute(a.arg, values) }
    case 'ind':
      return { op: 'ind', left: substitute(a.left, values), right: substitute(a.right, values) }
    case 'cases':
      return {
        op: 'cases',
        rows: a.rows.map((r) => ({
          value: substitute(r.value, values),
          when: r.when.map((w) => ({ left: substitute(w.left, values), right: substitute(w.right, values) })),
        })),
        otherwise: a.otherwise === undefined ? undefined : substitute(a.otherwise, values),
      }
  }
}

/** The drawn variables the equation of `id` mentions, in the order it mentions them (`A = C or W`: C, W). */
function drawnParents(model: CausalModel, id: string, shown: ReadonlySet<string>): string[] {
  const expr = model.equations.get(id)
  return expr === undefined ? [] : [...freeVariables(expr)].filter((p) => shown.has(p))
}

export interface EquationRow {
  readonly id: string
  /** The equation as written in the chosen notation. */
  readonly text: string
  /** Under do(): the replaced equation, shown struck through. */
  readonly struck?: string
  /** Arithmetic notation: the equation with the current values filled in. */
  readonly worked?: string
  /** LaTeX forms of `text`, `struck` and `worked`, for typesetting. */
  readonly latex: string
  readonly struckLatex?: string
  readonly workedLatex?: string
  readonly intervened: boolean
  readonly note: string
}

export function equationRows(
  t: Messages,
  c: LoadedCase,
  ids: readonly string[],
  notation: Exclude<Notation, 'causal'>,
  values: Assignment | undefined,
  interventions: Assignment,
  shown: readonly string[],
  stochastic: Stochastic = {},
): EquationRow[] {
  const { model } = c
  const set = new Set(shown)
  return ids.map((id) => {
    const text = renderEquation(model, id, notation, 'text')
    const latex = renderEquation(model, id, notation, 'latex')
    const forced = interventions[id]
    const soft = stochastic[id]
    if (soft !== undefined) {
      // A stochastic do(): the equation gives way to a coin with P(X=1) = p.
      const parents = drawnParents(model, id, set)
      return {
        id,
        text: `${id} ~ Bernoulli(${probText(soft)})`,
        latex: `${renderIdent(id, 'latex')} \\sim \\mathrm{Bernoulli}(${probText(soft)})`,
        struck: text,
        struckLatex: latex,
        intervened: true,
        note: t.setByChance(parents, probText(soft)),
      }
    }
    if (forced !== undefined) {
      const parents = drawnParents(model, id, set)
      return {
        id,
        text: `${id} = ${formatValue(forced)}`,
        latex: `${renderIdent(id, 'latex')} = ${renderValue(forced, 'latex')}`,
        struck: text,
        struckLatex: latex,
        intervened: true,
        note: t.setDirectly(parents, formatValue(forced)),
      }
    }
    let worked: string | undefined
    let workedLatex: string | undefined
    if (notation === 'arithmetic' && values !== undefined) {
      const expr = model.equations.get(id)
      if (expr !== undefined) {
        const arith = toArith(model, expr)
        const result = evalArith(arith, values)
        const plugged = renderArith(substitute(arith, values), 'text')
        // A bare parent (C = U) substitutes straight to the result; skip the repeat.
        worked = plugged === String(result) ? `= ${plugged}` : `= ${plugged} = ${String(result)}`
        const pluggedLatex = renderArith(substitute(arith, values), 'latex')
        workedLatex = plugged === String(result) ? `= ${pluggedLatex}` : `= ${pluggedLatex} = ${String(result)}`
      }
    }
    return { id, text, latex, worked, workedLatex, intervened: false, note: label(model, id, t.locale) }
  })
}

/** The variable whose value the case asks about: the first verdict's effect, else the last sink. */
export function outcomeVariable(c: LoadedCase): string {
  for (const v of c.data.verdicts) {
    if ('effect' in v.query) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)/.exec(v.query.effect)
      if (m !== null && c.model.byId.has(m[1])) return m[1]
    }
    if ('event' in v.query) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)/.exec(v.query.event)
      if (m !== null && c.model.byId.has(m[1])) return m[1]
    }
  }
  const hasChild = new Set(c.model.edges.map((e) => e.from))
  const sinks = c.model.endogenous.filter((id) => !hasChild.has(id))
  return sinks[sinks.length - 1] ?? c.model.endogenous[c.model.endogenous.length - 1]
}
