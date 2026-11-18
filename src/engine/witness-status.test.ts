import { describe, expect, it } from 'vitest'
import type { LoadedCase } from '../data/index.ts'
import { docToCase, listCases } from '../data/index.ts'
import { LESSON_MODELS } from '../demo/lesson-models.ts'
import type { Assignment, CausalTheory, Value } from './index.ts'
import { actualCause, domainValues, evaluate, getVariable, parseCause, witnessStatus } from './index.ts'

const THEORIES: readonly CausalTheory[] = ['butfor', 'hp-original', 'hp-updated', 'hp-modified', 'hp-normality']

/** Every assignment to `ids`, each variable unset or at one of its values. */
function* settings(c: LoadedCase, ids: readonly string[], at = 0, acc: Record<string, Value> = {}): Generator<Assignment> {
  if (at === ids.length) {
    yield { ...acc }
    return
  }
  const id = ids[at]
  yield* settings(c, ids, at + 1, acc)
  for (const v of domainValues(getVariable(c.model, id).domain)) {
    acc[id] = v
    yield* settings(c, ids, at + 1, acc)
    delete acc[id]
  }
}

/** The bundled cases and lesson models with a context, each with its actual-cause queries (or one per endogenous pair). */
function subjects(): { name: string; c: LoadedCase; queries: { cause: string; effect: string }[] }[] {
  const out: { name: string; c: LoadedCase; queries: { cause: string; effect: string }[] }[] = []
  for (const c of listCases()) {
    if (c.context === undefined) continue
    const seen = new Set<string>()
    const queries: { cause: string; effect: string }[] = []
    for (const v of c.data.verdicts) {
      if (!('cause' in v.query) || !('effect' in v.query)) continue
      const key = `${v.query.cause}⇒${v.query.effect}`
      if (seen.has(key)) continue
      seen.add(key)
      queries.push({ cause: v.query.cause, effect: v.query.effect })
    }
    out.push({ name: c.data.id, c, queries })
  }
  for (const [id, doc] of Object.entries(LESSON_MODELS)) {
    if (doc.context === undefined) continue
    const c = docToCase(doc)
    const actual = evaluate(c.model, c.context ?? {}).values
    // Every endogenous variable at its actual value as a cause of every other one's.
    const queries = c.model.endogenous.flatMap((x) =>
      c.model.endogenous.filter((y) => y !== x).map((y) => ({ cause: `${x}=${String(Number(actual[x]))}`, effect: `${y}=${String(Number(actual[y]))}` })),
    )
    out.push({ name: id, c, queries })
  }
  return out
}

describe('witnessStatus', () => {
  const fire = listCases().find((c) => c.data.id === 'forest-fire-disjunctive')
  if (fire?.context === undefined) throw new Error('no forest fire')
  const q = { cause: 'L=1', effect: 'FF=1' }
  it('disjunctive forest fire, L←0 with MD held at 0: a witness for the original and updated definitions only', () => {
    const set = { L: 0, MD: 0 }
    expect(witnessStatus(fire.model, fire.context ?? {}, q, 'hp-original', set).witness).toBe(true)
    expect(witnessStatus(fire.model, fire.context ?? {}, q, 'hp-updated', set).witness).toBe(true)
    const modified = witnessStatus(fire.model, fire.context ?? {}, q, 'hp-modified', set)
    expect(modified).toMatchObject({ witness: false, failure: 'not-at-actual', ids: ['MD'], held: { MD: false } })
    expect(witnessStatus(fire.model, fire.context ?? {}, q, 'butfor', set).failure).toBe('holds-others')
    expect(witnessStatus(fire.model, fire.context ?? {}, q, 'hp-modified', { L: 0 }).failure).toBe('effect-holds')
    expect(witnessStatus(fire.model, fire.context ?? {}, q, 'hp-modified', { MD: 0 }).failure).toBe('cause-not-changed')
  })

  // Of the bundled cases only the 11 voters (14 endogenous variables, 3^14 settings) is too large to
  // enumerate; it is checked on actualCause's own witness below.
  const LIMIT = 8
  for (const { name, c, queries } of subjects()) {
    const context = c.context ?? {}
    const small = c.model.endogenous.length <= LIMIT
    it(`${name}: a world is a witness for some setting exactly when actualCause finds AC2, and its witness is one`, () => {
      for (const query of queries) {
        for (const theory of THEORIES) {
          if (theory === 'hp-normality' && c.normality === undefined) continue
          const result = actualCause(c.model, context, query, theory, { normality: c.normality })
          // For hp-*, the AC2 witness of X⃗ itself; but-for has W⃗ empty.
          const found = result.check.witness
          if (found !== undefined) {
            const set = { ...found.w, ...found.xPrime }
            expect(witnessStatus(c.model, context, query, theory, set, c.normality).witness, `${name} ${theory} ${query.cause}`).toBe(true)
          }
          if (!small) continue
          const causeIds = Object.keys(parseCause(c.model, query.cause))
          let any = false
          for (const set of settings(c, c.model.endogenous)) {
            if (!causeIds.every((id) => id in set)) continue
            if (witnessStatus(c.model, context, query, theory, set, c.normality).witness) {
              any = true
              break
            }
          }
          expect(any, `${name} ${theory} ${query.cause} ⇒ ${query.effect}`).toBe(found !== undefined)
        }
      }
    })
  }
})
