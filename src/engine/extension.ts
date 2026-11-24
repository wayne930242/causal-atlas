import { problem } from './errors.ts'
import { evaluate } from './evaluate.ts'
import type { CausalModel } from './model.ts'
import type { Assignment, Domain, Value, Variable } from './types.ts'
import { ModelError, coerceToDomain, domainValues, enumerateAssignments, subsetsBySize, valuesEqual } from './values.ts'

/**
 * Conservative extensions (Halpern 2016, Actual Causality, Def. 4.2.1): M′ conservatively extends M
 * when both have the same exogenous variables (with the same ranges), M′ has every endogenous
 * variable of M (with the same range) and maybe more, and in every context, under every intervention
 * on a subset of M's endogenous variables, every endogenous variable of M takes the same value in M′
 * as in M.
 */

/** The most (context, intervention) pairs one check may solve; each solves both models once. */
export const MAX_EXTENSION_CHECKS = 100_000

/** Why two models cannot be compared at all. */
export type ExtensionFailure =
  /** The exogenous variables differ: those only in the base model, those only in the extension. */
  | { readonly kind: 'exogenous-differ'; readonly onlyBase: readonly string[]; readonly onlyExtension: readonly string[] }
  /** An endogenous variable of the base model is not an endogenous variable of the extension. */
  | { readonly kind: 'variable-missing'; readonly id: string }
  /** A shared variable has a different range in the two models. */
  | { readonly kind: 'domain-differ'; readonly id: string }

/** A context and an intervention on old variables under which an old variable takes different values. */
export interface ExtensionCounterexample {
  readonly context: Assignment
  /** do() on endogenous variables of the base model; may be empty. */
  readonly interventions: Assignment
  readonly variable: string
  /** Its value in the base model. */
  readonly base: Value
  /** Its value in the extension. */
  readonly extension: Value
}

export type ConservativeExtensionResult =
  | {
      readonly kind: 'extension'
      readonly conservative: true
      /** Endogenous variables only in the extension, in its declaration order. */
      readonly added: readonly string[]
      /** (context, intervention) pairs checked. */
      readonly checked: number
    }
  | {
      readonly kind: 'counterexample'
      readonly conservative: false
      readonly added: readonly string[]
      readonly checked: number
      readonly counterexample: ExtensionCounterexample
    }
  | { readonly kind: 'precondition'; readonly conservative: false; readonly failure: ExtensionFailure }

export interface ConservativeExtensionOptions {
  /** A context checked first, so a counterexample is found there when it has one (e.g. the actual context). */
  readonly context?: Assignment
}

function sameDomain(a: Domain, b: Domain): boolean {
  if (a.kind === 'boolean' || b.kind === 'boolean') return a.kind === b.kind
  return a.values.length === b.values.length && a.values.every((v) => b.values.some((w) => valuesEqual(v, w)))
}

function size(variable: Variable): number {
  return domainValues(variable.domain).length
}

function precondition(base: CausalModel, extension: CausalModel): ExtensionFailure | undefined {
  const onlyBase = base.exogenous.filter((id) => !extension.exogenous.includes(id))
  const onlyExtension = extension.exogenous.filter((id) => !base.exogenous.includes(id))
  if (onlyBase.length > 0 || onlyExtension.length > 0) return { kind: 'exogenous-differ', onlyBase, onlyExtension }
  for (const v of base.variables) {
    const other = extension.byId.get(v.id)
    if (v.kind === 'endogenous' && other?.kind !== 'endogenous') return { kind: 'variable-missing', id: v.id }
    if (other !== undefined && !sameDomain(v.domain, other.domain)) return { kind: 'domain-differ', id: v.id }
  }
  return undefined
}

/**
 * Whether `extension` is a conservative extension of `base`, checked exhaustively: every context
 * (every combination of the exogenous ranges) and every intervention on a subset of `base`'s
 * endogenous variables, smallest interventions first. A failed precondition comes back as a
 * `failure`, a differing value as a `counterexample`. Throws a ModelError (`extension-budget`) past
 * {@link MAX_EXTENSION_CHECKS} pairs, before solving any.
 */
export function conservativeExtension(
  base: CausalModel,
  extension: CausalModel,
  options: ConservativeExtensionOptions = {},
): ConservativeExtensionResult {
  const failure = precondition(base, extension)
  if (failure !== undefined) return { kind: 'precondition', conservative: false, failure }
  const exogenous = base.exogenous.map((id) => base.byId.get(id) as Variable)
  const old = base.variables.filter((v) => v.kind === 'endogenous')
  const contexts = exogenous.reduce((n, v) => n * size(v), 1)
  const count = old.reduce((n, v) => n * (size(v) + 1), contexts)
  if (count > MAX_EXTENSION_CHECKS) throw new ModelError(problem('extension-budget', { count, limit: MAX_EXTENSION_CHECKS }))
  const added = extension.variables.filter((v) => v.kind === 'endogenous' && !base.byId.has(v.id)).map((v) => v.id)

  const all = [...enumerateAssignments(exogenous)]
  const first = options.context
  const ordered =
    first === undefined
      ? all
      : (() => {
          const own = Object.fromEntries(exogenous.map((v) => [v.id, coerceToDomain(v, first[v.id] ?? domainValues(v.domain)[0])]))
          const same = (c: Assignment): boolean => exogenous.every((v) => valuesEqual(c[v.id], own[v.id]))
          return [own, ...all.filter((c) => !same(c))]
        })()

  let checked = 0
  for (const subset of subsetsBySize(old)) {
    for (const interventions of enumerateAssignments(subset)) {
      for (const context of ordered) {
        checked += 1
        const a = evaluate(base, context, interventions).values
        const b = evaluate(extension, context, interventions).values
        for (const v of old) {
          if (!valuesEqual(a[v.id], b[v.id])) {
            return {
              kind: 'counterexample',
              conservative: false,
              added,
              checked,
              counterexample: { context, interventions, variable: v.id, base: a[v.id], extension: b[v.id] },
            }
          }
        }
      }
    }
  }
  return { kind: 'extension', conservative: true, added, checked }
}
