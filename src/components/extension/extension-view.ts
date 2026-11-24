import { requireCase } from '../../data/case-store.ts'
import type { LoadedCase } from '../../data/load.ts'
import type { ModelDoc } from '../../data/schema.ts'
import type { Assignment, CausalVerdict, ConservativeExtensionResult, Problem, Value } from '../../engine/index.ts'
import { conservativeExtension, evaluate, getVariable, problem, valuesEqual } from '../../engine/index.ts'
import { formatValue } from '../../engine/values.ts'
import type { Messages } from '../i18n/messages.ts'
import { errorMessage } from '../i18n/messages.ts'
import { flipValue } from '../model/assignments.ts'
import { resolveDoc } from '../model/doc-case.ts'
import type { VerdictQuery } from '../model/verdict-rows.ts'
import { actualGroups } from '../model/verdict-rows.ts'
import { assignmentText, doText } from '../model/wording.ts'

/** One model of a conservative-extension figure: a bundled case id, or a model document. */
export type ExtensionModel = string | ModelDoc

export type ResolvedModels = { readonly ok: true; readonly cases: readonly LoadedCase[] } | { readonly ok: false; readonly problems: readonly Problem[] }

/** Every model as the case the graphs draw; the problems of those that do not build. */
export function resolveModels(models: readonly ExtensionModel[]): ResolvedModels {
  if (models.length < 2) throw new Error('ConservativeExtension needs at least two models')
  const cases: LoadedCase[] = []
  const problems: Problem[] = []
  for (const m of models) {
    const resolved = typeof m === 'string' ? { ok: true as const, c: requireCase(m) } : resolveDoc(m)
    if (resolved.ok) cases.push(resolved.c)
    else problems.push(...resolved.problems)
  }
  return problems.length > 0 ? { ok: false, problems } : { ok: true, cases }
}

/** The endogenous variables of `c`, in declaration order. */
export function endogenousOf(c: LoadedCase): string[] {
  return c.model.variables.filter((v) => v.kind === 'endogenous').map((v) => v.id)
}

/** The base model's endogenous variables that are also endogenous in the extension: what the reader may set. */
export function oldVariables(base: LoadedCase, extension: LoadedCase): string[] {
  return endogenousOf(base).filter((id) => extension.model.byId.get(id)?.kind === 'endogenous')
}

/** The context both graphs are solved in: the given one, else the base model's, else the extension's. */
export function startContext(cases: readonly LoadedCase[], given: Assignment | undefined): Assignment | undefined {
  return given ?? cases.find((c) => c.context !== undefined)?.context
}

/** The model solved in `context` (its own context fills in exogenous variables `context` lacks) under `interventions` it knows. */
export function solveIn(c: LoadedCase, context: Assignment, interventions: Assignment) {
  const own: Record<string, Value> = { ...(c.context ?? {}) }
  for (const id of c.model.exogenous) if (id in context) own[id] = context[id]
  const known = Object.fromEntries(Object.entries(interventions).filter(([id]) => c.model.byId.get(id)?.kind === 'endogenous'))
  const now = evaluate(c.model, own, known)
  const before = evaluate(c.model, own)
  return { values: now.values, original: before.values, removedEdges: now.removedEdges, interventions: known }
}

/**
 * The interventions after a click on `id`: set it to the other value from the one it now has, then,
 * on a multi-valued variable, through its values in turn, released when the next value is its own.
 */
export function clickDo(c: LoadedCase, context: Assignment, interventions: Assignment, id: string): Assignment {
  const rest: Record<string, Value> = { ...interventions }
  const set = rest[id]
  delete rest[id]
  const variable = getVariable(c.model, id)
  const natural = solveIn(c, context, rest).values[id]
  if (set === undefined) return { ...rest, [id]: flipValue(variable, natural) }
  const after = flipValue(variable, set)
  return valuesEqual(after, natural) ? rest : { ...rest, [id]: after }
}

/** The engine's check, or its error worded for the reader. */
export function checkPair(t: Messages, base: LoadedCase, extension: LoadedCase, context: Assignment | undefined): ConservativeExtensionResult | string {
  try {
    return conservativeExtension(base.model, extension.model, context === undefined ? {} : { context })
  } catch (error) {
    return errorMessage(error, t)
  }
}

/** The verdict line: conservative, not (with the counterexample), or not comparable (with why). */
export function verdictText(t: Messages, result: ConservativeExtensionResult, base: string, ext: string): string {
  const e = t.ext
  switch (result.kind) {
    case 'extension':
      return e.yes(base, ext, result.checked)
    case 'counterexample': {
      const x = result.counterexample
      const where = e.where(assignmentText(x.context), Object.keys(x.interventions).length === 0 ? undefined : doText(x.interventions))
      return e.no(base, ext, where, x.variable, formatValue(x.base), formatValue(x.extension))
    }
    case 'precondition': {
      const f = result.failure
      if (f.kind === 'exogenous-differ') return e.exogenousDiffer(base, ext, t.list(f.onlyBase), t.list(f.onlyExtension))
      if (f.kind === 'variable-missing') return e.variableMissing(base, ext, f.id)
      return e.domainDiffer(base, ext, f.id)
    }
  }
}

/** A verdict row of the table over all models: one standard of one query, a verdict per model. */
export interface VerdictLine {
  readonly key: string
  readonly label: string
  readonly cells: readonly (CausalVerdict | undefined)[]
}

/** Per query and standard, each model's verdict in its own actual context (undefined for a model without one). */
export function verdictLines(t: Messages, cases: readonly LoadedCase[], queries: readonly VerdictQuery[]): VerdictLine[] {
  const groups = cases.map((c) => (c.context === undefined ? undefined : actualGroups(t, c, queries)))
  const lines: VerdictLine[] = []
  const groupOf = (g: ReturnType<typeof actualGroups> | undefined, q: VerdictQuery) => g?.find((x) => x.cause === q.cause && x.effect === q.effect)
  queries.forEach((q, qi) => {
    const own = groups.map((g) => groupOf(g, q)).find((g) => g !== undefined)
    for (const row of own?.rows ?? []) {
      lines.push({
        key: `${qi}:${row.theory}`,
        label: t.ext.verdictRow(t.theory[row.theory], q.cause, q.effect),
        cells: groups.map((g) => groupOf(g, q)?.rows.find((r) => r.theory === row.theory)?.verdict),
      })
    }
  })
  return lines
}

/** The problem a figure without any actual context shows. */
export const NO_CONTEXT: Problem = problem('case-missing', { what: 'context' })
