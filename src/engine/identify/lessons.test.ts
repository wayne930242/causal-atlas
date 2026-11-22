import { describe, expect, it } from 'vitest'
import { docToCase } from '../../data/model-doc.ts'
import { LESSON_MODELS } from '../../demo/lesson-models.ts'
import type { Admg } from './index.ts'
import { admgOf, checkIdentification } from './index.ts'

/**
 * Every lesson model with a probability prior: for each ordered pair (x, y) of observed variables
 * with x an ancestor of y, an identifiable P(y | do(x)) must equal the engine's do() value on every
 * assignment where both are defined. At most MAX_PAIRS pairs per model (none of the lessons reaches it).
 */

const MAX_PAIRS = 60

function ancestorPairs(g: Admg): [string, string][] {
  const parents = new Map(g.nodes.map((v) => [v, g.directed.filter(([, to]) => to === v).map(([from]) => from)]))
  const pairs: [string, string][] = []
  for (const y of g.nodes) {
    const seen = new Set<string>()
    const stack = [...(parents.get(y) ?? [])]
    while (stack.length > 0) {
      const v = stack.pop() as string
      if (seen.has(v)) continue
      seen.add(v)
      stack.push(...(parents.get(v) ?? []))
    }
    for (const x of g.nodes) if (seen.has(x)) pairs.push([x, y])
  }
  return pairs
}

const withPriors = Object.entries(LESSON_MODELS).filter(([, doc]) => doc.priors !== undefined)

describe('identify on the lesson models', () => {
  it('has lesson models with priors', () => {
    expect(withPriors.length).toBeGreaterThan(20)
  })

  const table: Record<string, string> = {}
  for (const [id, doc] of withPriors) {
    it(`${id}: every identifiable effect equals do()`, () => {
      const c = docToCase(doc)
      if (c.prior === undefined) throw new Error('no prior')
      const pairs = ancestorPairs(admgOf(c.model))
      expect(pairs.length).toBeLessThanOrEqual(MAX_PAIRS)
      let ids = 0
      let nonIds = 0
      let rows = 0
      let skipped = 0
      for (const [x, y] of pairs) {
        const check = checkIdentification(c.model, c.prior, { y: [y], x: [x] })
        if (check.result.identifiable) {
          ids++
          expect(check.maxError, `${id}: P(${y}|do(${x})) = ${check.result.text}`).toBeLessThan(1e-9)
        } else nonIds++
        rows += check.rows.length
        skipped += check.skipped.length
      }
      table[id] = `pairs ${pairs.length}, id ${ids}, non-id ${nonIds}, rows ${rows}, skipped ${skipped}`
    })
  }

  it('records the id / non-id counts', () => {
    expect(table).toMatchInlineSnapshot(`
      {
        "m00-firing-squad-nervous": "pairs 5, id 5, non-id 0, rows 16, skipped 4",
        "m01-burglary": "pairs 1, id 1, non-id 0, rows 4, skipped 0",
        "m01-dice": "pairs 0, id 0, non-id 0, rows 0, skipped 0",
        "m01-fork": "pairs 2, id 2, non-id 0, rows 8, skipped 0",
        "m01-lesion-naive": "pairs 1, id 1, non-id 0, rows 4, skipped 0",
        "m02-chain": "pairs 3, id 3, non-id 0, rows 12, skipped 0",
        "m02-collider": "pairs 2, id 2, non-id 0, rows 8, skipped 0",
        "m02-pearl-model1": "pairs 0, id 0, non-id 0, rows 0, skipped 0",
        "m02-pearl-model2": "pairs 1, id 1, non-id 0, rows 4, skipped 0",
        "m02-x-to-y": "pairs 1, id 1, non-id 0, rows 4, skipped 0",
        "m02-y-to-x": "pairs 1, id 1, non-id 0, rows 4, skipped 0",
        "m03-sprinkler": "pairs 3, id 3, non-id 0, rows 12, skipped 0",
        "m04-admission": "pairs 5, id 5, non-id 0, rows 20, skipped 0",
        "m04-gardener": "pairs 10, id 10, non-id 0, rows 40, skipped 0",
        "m04-sprinkler-cpt": "pairs 9, id 9, non-id 0, rows 36, skipped 0",
        "m04-tuned": "pairs 1, id 1, non-id 0, rows 4, skipped 0",
        "m05-backdoor": "pairs 6, id 6, non-id 0, rows 24, skipped 0",
        "m05-frontdoor": "pairs 3, id 3, non-id 0, rows 12, skipped 0",
        "m05-pearl-table31": "pairs 3, id 3, non-id 0, rows 12, skipped 0",
        "m06-bow-a": "pairs 1, id 0, non-id 1, rows 0, skipped 0",
        "m06-bow-b": "pairs 1, id 0, non-id 1, rows 0, skipped 0",
        "m06-rule1": "pairs 3, id 3, non-id 0, rows 12, skipped 0",
        "m06-rule3-exception": "pairs 1, id 1, non-id 0, rows 4, skipped 0",
        "m08-mediator-conditioning": "pairs 3, id 2, non-id 1, rows 8, skipped 0",
        "m08-pill": "pairs 3, id 3, non-id 0, rows 12, skipped 0",
        "m08-sex-department": "pairs 3, id 2, non-id 1, rows 8, skipped 0",
        "m08-sex-department-clean": "pairs 3, id 3, non-id 0, rows 12, skipped 0",
        "m10-doctor": "pairs 1, id 1, non-id 0, rows 2, skipped 2",
        "m10-faulkner": "pairs 20, id 20, non-id 0, rows 80, skipped 0",
        "m10-suzy-blame": "pairs 8, id 3, non-id 5, rows 6, skipped 6",
        "m11-murder-lesion": "pairs 1, id 0, non-id 1, rows 0, skipped 0",
      }
    `)
  })
})
