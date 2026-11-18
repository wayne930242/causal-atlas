import { problem } from './errors.ts'
import type { Expr } from './expr.ts'
import { containsDo } from './expr.ts'
import { evaluate } from './evaluate.ts'
import { holdsIn, toFormula } from './formula.ts'
import type { CausalModel } from './model.ts'
import { getVariable } from './model.ts'
import type { Prior } from './probability.ts'
import { enumerateContexts } from './probability.ts'
import type { Assignment, Value } from './types.ts'
import { ModelError, assignmentKey, coerceToDomain, enumerateAssignments, formatValue, requireValue, valuesEqual } from './values.ts'

export interface MediationQuery {
  /** The treatment X, an endogenous variable. */
  readonly treatment: string
  /** The mediators Z⃗ (endogenous, not X); Pearl takes all parents of Y other than X. */
  readonly mediators: readonly string[]
  /** The outcome event, e.g. `Y=1`; its probability plays E(Y). No `[X←x]`. */
  readonly outcome: Expr | string
  /** The transition from x (`from`) to x* (`to`). */
  readonly from: Value
  readonly to: Value
  /** Also compute the mediation formula (4.17)/(4.18) from the observational distribution. */
  readonly formula?: boolean
}

export interface ControlledEffect {
  /** The mediators' setting z⃗. */
  readonly z: Assignment
  /** P(Y_{to, z}) − P(Y_{from, z}). */
  readonly value: number
}

export interface MediationFormula {
  /** Σ_z [E(Y | to, z) − E(Y | from, z)] P(z | from) (4.17); undefined when a needed term has no data. */
  readonly direct?: number
  /** Σ_z E(Y | from, z) [P(z | to) − P(z | from)] (4.18); undefined when a needed term has no data. */
  readonly indirect?: number
  /** Settings of X (and Z⃗) a needed conditional probability conditions on, with probability 0. */
  readonly missing: readonly Assignment[]
}

/** One context with the four counterfactual worlds the natural effects read. */
export interface MediationWorld {
  readonly context: Assignment
  readonly p: number
  /** Z⃗(from), Z⃗(to). */
  readonly zFrom: Assignment
  readonly zTo: Assignment
  /** Whether the outcome holds in Y(from), Y(to), Y(to, Z⃗(from)), Y(from, Z⃗(to)). */
  readonly yFrom: boolean
  readonly yTo: boolean
  readonly yToZFrom: boolean
  readonly yFromZTo: boolean
}

export interface MediationResult {
  /** TE = P(Y_to) − P(Y_from). */
  readonly total: number
  /** Controlled direct effects, one per setting of the mediators. */
  readonly controlled: readonly ControlledEffect[]
  /** DE = P(Y_{to, Z_from}) − P(Y_from) (4.11). */
  readonly naturalDirect: number
  /** IE = P(Y_{from, Z_to}) − P(Y_from) (4.14). */
  readonly naturalIndirect: number
  /** IE of the reverse transition, P(Y_{to, Z_from}) − P(Y_to); total = naturalDirect − reverseIndirect (4.15). */
  readonly reverseIndirect: number
  readonly formula?: MediationFormula
  readonly worlds: readonly MediationWorld[]
}

function restrict(values: Assignment, ids: readonly string[]): Record<string, Value> {
  const out: Record<string, Value> = {}
  for (const id of ids) out[id] = requireValue(values, id)
  return out
}

/**
 * Direct and indirect effects of X on an outcome through mediators Z⃗ (Pearl, Causality, 2nd ed.
 * 2009, §4.5): controlled direct effects P(y | do(x*, z)) − P(y | do(x, z)) (§4.5.3), the natural
 * direct effect (4.11), the natural indirect effect (4.14) and the decomposition (4.15), computed
 * from the full model by evaluating, per context, Z⃗ under do(x) and do(x*) and Y under do(x),
 * do(x*), do(x*, Z⃗(x)) and do(x, Z⃗(x*)). With `formula`, also the mediation formula (4.17)/(4.18)
 * from the observational distribution; it equals the natural effects when the mediators are
 * unconfounded (Pearl p. 131 n. 9) and is undefined where a conditional it needs has no data.
 */
export function mediation(model: CausalModel, prior: Prior, query: MediationQuery): MediationResult {
  const endogenous = (id: string) => {
    const variable = getVariable(model, id)
    if (variable.kind !== 'endogenous') throw new ModelError(problem('mediation-not-endogenous', { id }))
    return variable
  }
  const treatment = endogenous(query.treatment)
  const X = treatment.id
  if (query.mediators.length === 0) throw new ModelError(problem('mediation-no-mediators', {}))
  const seen = new Set<string>()
  for (const id of query.mediators) {
    if (id === X) throw new ModelError(problem('mediation-treatment-is-mediator', { id }))
    endogenous(id)
    if (seen.has(id)) throw new ModelError(problem('mediation-mediator-repeats', { id }))
    seen.add(id)
  }
  const Z = [...query.mediators]
  const from = coerceToDomain(treatment, query.from)
  const to = coerceToDomain(treatment, query.to)
  if (valuesEqual(from, to)) throw new ModelError(problem('mediation-same-values', { value: formatValue(from) }))
  const outcome = toFormula(model, query.outcome)
  if (containsDo(outcome)) throw new ModelError(problem('effect-has-intervention', {}))

  const contexts = enumerateContexts(model, prior)
  const zSettings = [...enumerateAssignments(Z.map((id) => getVariable(model, id)))]
  const y = (context: Assignment, interventions: Assignment): boolean => holdsIn(evaluate(model, context, interventions).values, outcome)

  let pFrom = 0
  let pTo = 0
  let pToZFrom = 0
  let pFromZTo = 0
  const controlledTo = zSettings.map(() => 0)
  const controlledFrom = zSettings.map(() => 0)
  // Observational: P(X=x, Z⃗=z) and P(X=x, Z⃗=z, Y) keyed by x|z.
  const joint = new Map<string, number>()
  const jointY = new Map<string, number>()
  const worlds: MediationWorld[] = contexts.map(({ context, p }) => {
    const wFrom = evaluate(model, context, { [X]: from }).values
    const wTo = evaluate(model, context, { [X]: to }).values
    const zFrom = restrict(wFrom, Z)
    const zTo = restrict(wTo, Z)
    const world: MediationWorld = {
      context,
      p,
      zFrom,
      zTo,
      yFrom: holdsIn(wFrom, outcome),
      yTo: holdsIn(wTo, outcome),
      yToZFrom: y(context, { ...zFrom, [X]: to }),
      yFromZTo: y(context, { ...zTo, [X]: from }),
    }
    if (world.yFrom) pFrom += p
    if (world.yTo) pTo += p
    if (world.yToZFrom) pToZFrom += p
    if (world.yFromZTo) pFromZTo += p
    zSettings.forEach((z, i) => {
      if (y(context, { ...z, [X]: to })) controlledTo[i] += p
      if (y(context, { ...z, [X]: from })) controlledFrom[i] += p
    })
    if (query.formula === true) {
      const actual = evaluate(model, context).values
      const key = `${formatValue(requireValue(actual, X))}|${assignmentKey(actual, Z)}`
      joint.set(key, (joint.get(key) ?? 0) + p)
      if (holdsIn(actual, outcome)) jointY.set(key, (jointY.get(key) ?? 0) + p)
    }
    return world
  })

  const result: MediationResult = {
    total: pTo - pFrom,
    controlled: zSettings.map((z, i) => ({ z, value: controlledTo[i] - controlledFrom[i] })),
    naturalDirect: pToZFrom - pFrom,
    naturalIndirect: pFromZTo - pFrom,
    reverseIndirect: pToZFrom - pTo,
    worlds,
  }
  if (query.formula !== true) return result
  return { ...result, formula: mediationFormula(X, Z, from, to, zSettings, joint, jointY) }
}

function mediationFormula(
  X: string,
  Z: readonly string[],
  from: Value,
  to: Value,
  zSettings: readonly Assignment[],
  joint: ReadonlyMap<string, number>,
  jointY: ReadonlyMap<string, number>,
): MediationFormula {
  const key = (x: Value, z: Assignment) => `${formatValue(x)}|${assignmentKey(z, Z)}`
  const pX = (x: Value) => zSettings.reduce((sum, z) => sum + (joint.get(key(x, z)) ?? 0), 0)
  const missing: Assignment[] = []
  const missingKeys = new Set<string>()
  const miss = (assignment: Assignment, k: string) => {
    if (missingKeys.has(k)) return
    missingKeys.add(k)
    missing.push(assignment)
  }
  const marginalFrom = pX(from)
  const marginalTo = pX(to)
  if (marginalFrom <= 0) miss({ [X]: from }, formatValue(from))
  if (marginalTo <= 0) miss({ [X]: to }, formatValue(to))
  // E(Y | x, z), recording the cell as missing when P(x, z) = 0.
  const eY = (x: Value, z: Assignment): number | undefined => {
    const mass = joint.get(key(x, z)) ?? 0
    if (mass <= 0) {
      miss({ [X]: x, ...z }, key(x, z))
      return undefined
    }
    return (jointY.get(key(x, z)) ?? 0) / mass
  }
  const pZ = (z: Assignment, x: Value, marginal: number) => (joint.get(key(x, z)) ?? 0) / marginal

  let direct: number | undefined
  if (marginalFrom > 0) {
    let sum: number | undefined = 0
    for (const z of zSettings) {
      const weight = pZ(z, from, marginalFrom)
      if (weight <= 0) continue
      const a = eY(to, z)
      const b = eY(from, z)
      sum = a === undefined || b === undefined || sum === undefined ? undefined : sum + (a - b) * weight
    }
    direct = sum
  }
  let indirect: number | undefined
  if (marginalFrom > 0 && marginalTo > 0) {
    let sum: number | undefined = 0
    for (const z of zSettings) {
      const weight = pZ(z, to, marginalTo) - pZ(z, from, marginalFrom)
      if (weight === 0) continue
      const a = eY(from, z)
      sum = a === undefined || sum === undefined ? undefined : sum + a * weight
    }
    indirect = sum
  }
  return { direct, indirect, missing }
}
