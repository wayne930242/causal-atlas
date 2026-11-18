import type { LoadedCase } from '../../data/load.ts'
import type { Assignment, CausalVerdict, LocalizedText, Value } from '../../engine/index.ts'
import { actualCause, coerceToDomain, evalExpr, freeVariables, getVariable, parseExpr, valuesEqual } from '../../engine/index.ts'
import { enumerateAssignments } from '../../engine/values.ts'

/** A guided task in the editor: start from a model, change its equations to the goal, guess the verdicts first. */
export interface EditorTask {
  readonly id: string
  readonly title: string | LocalizedText
  readonly prompt: string | LocalizedText
  /** A bundled case or `extraModels` id; the card's 從它開始 loads it. */
  readonly start: string
  /** The equations to reach; each is compared with the edited one at every value of their parents together. */
  readonly goal: { readonly equations: Readonly<Record<string, string>> }
  /** The actual-cause question whose verdicts the reader guesses before checking (a graph with values). */
  readonly predict?: { readonly cause: string; readonly effect: string }
}

/** The theories a task's guess covers. */
export const TASK_THEORIES = ['butfor', 'hp-original', 'hp-updated', 'hp-modified'] as const
export type TaskTheory = (typeof TASK_THEORIES)[number]

export type TaskCheck =
  | { readonly ok: true; readonly ids: readonly string[]; readonly verdicts?: Readonly<Record<TaskTheory, CausalVerdict>> }
  /** The first setting of the parents where an equation differs: what yours gives and what the goal gives. */
  | { readonly ok: false; readonly id: string; readonly at: Assignment; readonly yours: Value; readonly goal: Value }
  /** A goal names a variable the edited model does not have, or the model does not build. */
  | { readonly ok: false; readonly missing: string }

export function checkTask(c: LoadedCase, task: EditorTask): TaskCheck {
  const ids = Object.keys(task.goal.equations)
  for (const id of ids) {
    const target = c.model.byId.get(id)
    const mine = c.model.equations.get(id)
    if (target === undefined || mine === undefined) return { ok: false, missing: id }
    const goal = parseExpr(task.goal.equations[id])
    const names = [...new Set([...freeVariables(mine), ...freeVariables(goal)])]
    const missing = names.find((n) => !c.model.byId.has(n))
    if (missing !== undefined) return { ok: false, missing }
    for (const at of enumerateAssignments(names.map((n) => getVariable(c.model, n)))) {
      const yours = coerceToDomain(target, evalExpr(mine, { values: at }))
      const want = coerceToDomain(target, evalExpr(goal, { values: at }))
      if (!valuesEqual(yours, want)) return { ok: false, id, at, yours, goal: want }
    }
  }
  if (task.predict === undefined || c.context === undefined) return { ok: true, ids }
  const context = c.context
  const query = task.predict
  const verdicts = Object.fromEntries(TASK_THEORIES.map((th) => [th, actualCause(c.model, context, query, th).verdict])) as Record<TaskTheory, CausalVerdict>
  return { ok: true, ids, verdicts }
}

/** A guess is right when it says 原因 exactly for the theories that count the cause as a cause or part of one. */
export function guessRight(verdict: CausalVerdict, guessed: boolean): boolean {
  return guessed === (verdict !== 'not-cause')
}
