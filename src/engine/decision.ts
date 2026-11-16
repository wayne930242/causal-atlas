import { problem as makeProblem } from './errors.ts'
import { evaluate } from './evaluate.ts'
import type { CausalModel } from './model.ts'
import { getVariable } from './model.ts'
import type { Prior } from './probability.ts'
import { enumerateContexts } from './probability.ts'
import type { Assignment, Value } from './types.ts'
import { ModelError, assignmentKey, coerceToDomain, domainValues, requireValue, valuesEqual } from './values.ts'

export interface UtilityRow {
  readonly when: readonly Value[]
  readonly utility: number
}

/** Utility of each joint value of the outcome variables; every combination that occurs must be listed. */
export interface UtilityTable {
  readonly variables: readonly string[]
  readonly rows: readonly UtilityRow[]
}

export interface DecisionProblem {
  /** The decision variable whose values are the acts. */
  readonly act: string
  /** Acts to compare; defaults to the decision variable's domain. */
  readonly acts?: readonly Value[]
  readonly utility: UtilityTable
}

export interface OutcomeWeight {
  readonly outcome: Assignment
  readonly p: number
  readonly utility: number
}

export interface ExpectedUtility {
  readonly eu: number
  /** P(o | a) for EDT, P(o | do(a)) for CDT, over outcome-variable values. */
  readonly outcomes: readonly OutcomeWeight[]
}

export interface ActEvaluation {
  readonly act: Value
  /** EU_EDT(a) = Σ_o P(o | a) U(o); undefined when P(a) = 0. */
  readonly edt?: ExpectedUtility
  /** EU_CDT(a) = Σ_o P(o | do(a)) U(o). */
  readonly cdt: ExpectedUtility
}

export interface DecisionResult {
  readonly acts: readonly ActEvaluation[]
  /** Acts maximizing EU_EDT (several on a tie). */
  readonly edtChoice: readonly Value[]
  /** Acts maximizing EU_CDT (several on a tie). */
  readonly cdtChoice: readonly Value[]
}

const EPSILON = 1e-9

function utilityOf(model: CausalModel, table: UtilityTable, world: Assignment): number {
  const values = table.variables.map((id) => requireValue(world, id))
  for (const row of table.rows) {
    if (row.when.length !== values.length) throw new ModelError(makeProblem('utility-row-length', {}))
    if (row.when.every((w, i) => valuesEqual(w, values[i]))) return row.utility
  }
  const shown = table.variables.map((id, i) => `${getVariable(model, id).id}=${String(values[i])}`).join(', ')
  throw new ModelError(makeProblem('utility-no-row', { values: shown }))
}

function accumulate(
  model: CausalModel,
  table: UtilityTable,
  worlds: readonly { world: Assignment; p: number }[],
): ExpectedUtility | undefined {
  const total = worlds.reduce((s, w) => s + w.p, 0)
  if (total <= 0) return undefined
  const byOutcome = new Map<string, { outcome: Record<string, Value>; p: number; utility: number }>()
  for (const { world, p } of worlds) {
    const key = assignmentKey(world, table.variables)
    const existing = byOutcome.get(key)
    if (existing !== undefined) {
      existing.p += p / total
      continue
    }
    const outcome: Record<string, Value> = {}
    for (const id of table.variables) outcome[id] = requireValue(world, id)
    byOutcome.set(key, { outcome, p: p / total, utility: utilityOf(model, table, world) })
  }
  const outcomes = [...byOutcome.values()]
  return { eu: outcomes.reduce((s, o) => s + o.p * o.utility, 0), outcomes }
}

function argmax(acts: readonly ActEvaluation[], pick: (a: ActEvaluation) => number | undefined): Value[] {
  const scored = acts.flatMap((a) => {
    const eu = pick(a)
    return eu === undefined ? [] : [{ act: a.act, eu }]
  })
  if (scored.length === 0) return []
  const best = Math.max(...scored.map((s) => s.eu))
  return scored.filter((s) => s.eu >= best - EPSILON).map((s) => s.act)
}

/** Evidential and causal expected utility of each act, by enumeration over contexts. */
export function evaluateDecision(model: CausalModel, prior: Prior, problem: DecisionProblem): DecisionResult {
  const actVar = getVariable(model, problem.act)
  for (const id of problem.utility.variables) getVariable(model, id)
  const acts = (problem.acts ?? domainValues(actVar.domain)).map((a) => coerceToDomain(actVar, a))
  const contexts = enumerateContexts(model, prior)
  const actualWorlds = contexts.map(({ context, p }) => ({ world: evaluate(model, context).values, p }))

  const evaluations: ActEvaluation[] = acts.map((act) => {
    const matching = actualWorlds.filter(({ world }) => valuesEqual(requireValue(world, problem.act), act))
    const edt = accumulate(model, problem.utility, matching)
    const intervened = contexts.map(({ context, p }) => ({
      world: evaluate(model, context, { [problem.act]: act }).values,
      p,
    }))
    const cdt = accumulate(model, problem.utility, intervened)
    if (cdt === undefined) throw new ModelError(makeProblem('prior-no-mass', {}))
    return { act, edt, cdt }
  })

  return {
    acts: evaluations,
    edtChoice: argmax(evaluations, (a) => a.edt?.eu),
    cdtChoice: argmax(evaluations, (a) => a.cdt.eu),
  }
}
