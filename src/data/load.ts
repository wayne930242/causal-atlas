import type { Assignment, CausalModel, DecisionProblem, Expr, Normality, Prior, Value, Variable } from '../engine/index.ts'
import {
  ModelError,
  actualCause,
  buildModel,
  checkContextBudget,
  counterfactual,
  evaluateDecision,
  getVariable,
  normalizeAssignment,
  pointMass,
  probability,
  valuesEqual,
} from '../engine/index.ts'
import type { Where } from '../engine/errors.ts'
import { problem } from '../engine/errors.ts'
import type { CaseFile, CaseVerdict } from './schema.ts'
import { caseSchema } from './schema.ts'

/** A case file turned into engine objects. */
export interface LoadedCase {
  readonly data: CaseFile
  readonly model: CausalModel
  readonly context?: Assignment
  readonly prior?: Prior
  readonly normality?: Normality
  readonly decision?: DecisionProblem
}

function splitRow(row: readonly Value[], where: Where): { when: Value[]; last: Value } {
  const last = row[row.length - 1]
  if (last === undefined) throw new ModelError(problem('row-empty', {}, where))
  return { when: row.slice(0, -1), last }
}

function numberAt(value: Value, where: Where): number {
  if (typeof value !== 'number') throw new ModelError(problem('not-a-number', { value: JSON.stringify(value) }, where))
  return value
}

function toModel(data: CaseFile): CausalModel {
  const variables: Variable[] = data.model.variables.map((v) => ({
    id: v.id,
    label: v.label,
    kind: v.kind,
    domain: v.domain === 'boolean' ? { kind: 'boolean' } : { kind: 'finite', values: v.domain },
  }))
  const equations: Record<string, string | Expr> = {}
  for (const [id, eq] of Object.entries(data.model.equations)) {
    if (typeof eq === 'string') {
      equations[id] = eq
      continue
    }
    const { inputs, rows, default: fallback } = eq.table
    equations[id] = {
      op: 'lookup',
      inputs,
      rows: rows.map((row) => {
        if (row.length !== inputs.length + 1) {
          throw new ModelError(problem('table-row-length', { id, inputs: inputs.length }))
        }
        const { when, last } = splitRow(row, { kind: 'table', id })
        return { when, value: last }
      }),
      fallback,
    }
  }
  return buildModel({ variables, equations })
}

function toPrior(data: CaseFile, model: CausalModel): Prior | undefined {
  const priors = data.priors
  if (priors === undefined) return data.context === undefined ? undefined : pointMass(data.context)
  if ('independent' in priors) {
    const marginals: Record<string, { value: Value; p: number }[]> = {}
    for (const [id, marginal] of Object.entries(priors.independent)) {
      if (typeof marginal === 'number') {
        if (getVariable(model, id).domain.kind !== 'boolean') {
          throw new ModelError(problem('bare-prior-not-boolean', { id }))
        }
        marginals[id] = [
          { value: true, p: marginal },
          { value: false, p: 1 - marginal },
        ]
      } else {
        marginals[id] = marginal.map(([value, p]) => ({ value, p }))
      }
    }
    return { kind: 'independent', marginals }
  }
  const { variables, rows } = priors.joint
  return {
    kind: 'joint',
    rows: rows.map((row) => {
      if (row.length !== variables.length + 1) throw new ModelError(problem('joint-row-length', {}))
      const { when, last } = splitRow(row, { kind: 'joint-prior' })
      const context: Record<string, Value> = {}
      variables.forEach((id, i) => {
        context[id] = when[i]
      })
      return { context, p: numberAt(last, { kind: 'joint-prior' }) }
    }),
  }
}

function toDecision(data: CaseFile): DecisionProblem | undefined {
  const decision = data.decision
  if (decision === undefined) return undefined
  const { variables, rows } = decision.utility
  return {
    act: decision.variable,
    acts: decision.acts,
    utility: {
      variables,
      rows: rows.map((row) => {
        if (row.length !== variables.length + 1) throw new ModelError(problem('utility-row-length', {}))
        const { when, last } = splitRow(row, { kind: 'utility' })
        return { when, utility: numberAt(last, { kind: 'utility' }) }
      }),
    },
  }
}

/** Validate raw JSON against the schema and build the engine objects. Throws on any problem. */
export function loadCase(raw: unknown): LoadedCase {
  return buildCase(caseSchema.parse(raw))
}

/** Build the engine objects from already-validated case data (or a model document turned into one). */
export function buildCase(data: CaseFile): LoadedCase {
  const model = toModel(data)
  const prior = toPrior(data, model)
  if (prior !== undefined) checkContextBudget(model, prior)
  return {
    data,
    model,
    context: data.context === undefined ? undefined : normalizeAssignment(model, data.context),
    prior,
    normality: data.normality === undefined ? undefined : normalizeAssignment(model, data.normality),
    decision: toDecision(data),
  }
}

export interface VerdictCheck {
  readonly ok: boolean
  readonly expected: Value
  readonly actual: Value
  /** One line naming the theory and query, for test names and failure messages. */
  readonly label: string
}

const DEFAULT_TOLERANCE = 1e-9

function need<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new ModelError(problem('case-missing', { what }))
  return value
}

export function describeVerdict(verdict: CaseVerdict): string {
  const q = verdict.query
  switch (verdict.theory) {
    case 'butfor':
    case 'hp-original':
    case 'hp-updated':
    case 'hp-modified':
    case 'hp-normality':
      return `${verdict.theory}: ${verdict.query.cause} ⇒ ${verdict.query.effect}`
    case 'probability': {
      const doPart = verdict.query.do === undefined ? '' : ` do(${JSON.stringify(verdict.query.do)})`
      const given = verdict.query.given === undefined ? '' : ` | ${verdict.query.given}`
      return `probability: P(${verdict.query.event}${given}${doPart})`
    }
    case 'counterfactual':
      return `counterfactual: P(${verdict.query.event} after do(${JSON.stringify(verdict.query.do)}) | ${verdict.query.evidence ?? '⊤'})`
    case 'edt':
    case 'cdt':
      return `${verdict.theory}: ${JSON.stringify(q)}`
  }
}

/** Recompute a verdict with the engine and compare it with the expected value. */
export function checkVerdict(loaded: LoadedCase, verdict: CaseVerdict): VerdictCheck {
  const label = describeVerdict(verdict)
  const close = (actual: number, expected: number, tolerance = DEFAULT_TOLERANCE): VerdictCheck => ({
    ok: Math.abs(actual - expected) <= tolerance,
    expected,
    actual,
    label,
  })
  switch (verdict.theory) {
    case 'butfor':
    case 'hp-original':
    case 'hp-updated':
    case 'hp-modified':
    case 'hp-normality': {
      const result = actualCause(loaded.model, need(loaded.context, 'context'), verdict.query, verdict.theory, {
        normality: loaded.normality,
      })
      return { ok: result.verdict === verdict.expected, expected: verdict.expected, actual: result.verdict, label }
    }
    case 'probability': {
      const result = probability(loaded.model, need(loaded.prior, 'prior'), verdict.query)
      return close(result.value, verdict.expected, verdict.tolerance)
    }
    case 'counterfactual': {
      const result = counterfactual(loaded.model, need(loaded.prior, 'prior'), verdict.query)
      return close(need(result.probability, 'counterfactual probability'), verdict.expected, verdict.tolerance)
    }
    case 'edt':
    case 'cdt': {
      const decision = need(loaded.decision, 'decision')
      const result = evaluateDecision(loaded.model, need(loaded.prior, 'prior'), decision)
      const query = verdict.query
      if ('choice' in query) {
        const choice = verdict.theory === 'edt' ? result.edtChoice : result.cdtChoice
        const actual = choice.length === 1 ? choice[0] : `tie: ${choice.map(String).join(', ')}`
        return { ok: choice.length === 1 && valuesEqual(choice[0], verdict.expected), expected: verdict.expected, actual, label }
      }
      const act = result.acts.find((a) => valuesEqual(a.act, query.expectedUtility))
      if (act === undefined) throw new ModelError(problem('no-such-act', { act: String(query.expectedUtility) }))
      const eu = verdict.theory === 'edt' ? need(act.edt, 'EDT value (act has probability 0)').eu : act.cdt.eu
      return close(eu, numberAt(verdict.expected, { kind: 'utility' }), verdict.tolerance)
    }
  }
}
