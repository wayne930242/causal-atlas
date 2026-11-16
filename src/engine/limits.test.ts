import { describe, expect, it } from 'vitest'
import { actualCause } from './actual.ts'
import { MAX_CONTEXTS, contextCount, enumerateContexts, probability } from './probability.ts'
import type { Prior } from './probability.ts'
import { buildModel } from './model.ts'
import { ModelError } from './values.ts'
import { variable } from './test-models.ts'

/** n independent exogenous booleans U0..U(n-1) and Y = U0 or … or U(n-1). */
function wide(n: number) {
  const ids = Array.from({ length: n }, (_, i) => `U${i}`)
  const model = buildModel({
    variables: [...ids.map((id) => variable(id, 'exogenous')), variable('Y', 'endogenous')],
    equations: { Y: ids.join(' or ') },
  })
  const prior: Prior = {
    kind: 'independent',
    marginals: Object.fromEntries(
      ids.map((id) => [id, [{ value: true, p: 0.5 }, { value: false, p: 0.5 }]]),
    ),
  }
  return { model, prior }
}

/** A → A0 → A1 … → Y with U feeding every link: a long preemption-style chain. */
function chain(n: number) {
  const variables = [variable('U', 'exogenous')]
  const equations: Record<string, string> = {}
  for (let i = 0; i < n; i += 1) {
    variables.push(variable(`A${i}`, 'endogenous'))
    equations[`A${i}`] = i === 0 ? 'U' : `A${i - 1} or U`
  }
  variables.push(variable('Y', 'endogenous'))
  equations.Y = `A${n - 1}`
  return buildModel({ variables, equations })
}

describe('REV-F001: context enumeration budget', () => {
  it('counts the product of the supports', () => {
    const { model, prior } = wide(5)
    expect(contextCount(model, prior)).toBe(32)
    expect(MAX_CONTEXTS).toBeGreaterThanOrEqual(1024)
  })

  it('refuses to enumerate more contexts than the budget, without enumerating', () => {
    const { model, prior } = wide(24)
    expect(contextCount(model, prior)).toBe(2 ** 24)
    expect(() => enumerateContexts(model, prior)).toThrow(ModelError)
    expect(() => probability(model, prior, { event: 'Y=1' })).toThrow(/too many contexts|上限|exceeds/i)
  })

  it('still enumerates models inside the budget', () => {
    const { model, prior } = wide(10)
    expect(probability(model, prior, { event: 'Y=1' }).value).toBeCloseTo(1 - 1 / 1024)
  })
})

describe('REV-F002: actualCause work budget', () => {
  it('stops a hp-updated search that would take seconds, with a clear error', () => {
    const model = chain(6)
    const started = Date.now()
    expect(() => actualCause(model, { U: true }, { cause: 'A0=1', effect: 'Y=1' }, 'hp-updated')).toThrow(/evaluations/)
    expect(Date.now() - started).toBeLessThan(2000)
  })

  it('stops hp-original on a wider model too', () => {
    const model = chain(8)
    expect(() => actualCause(model, { U: true }, { cause: 'A0=1', effect: 'Y=1' }, 'hp-original')).toThrow(ModelError)
  })

  it('leaves hp-modified and small searches alone', () => {
    expect(actualCause(chain(8), { U: true }, { cause: 'A0=1', effect: 'Y=1' }, 'hp-modified').verdict).toBe('not-cause')
    expect(actualCause(chain(3), { U: true }, { cause: 'A0=1', effect: 'Y=1' }, 'hp-updated').verdict).toBe('not-cause')
  })
})

describe('REV-F005: names that exist on Object.prototype', () => {
  it.each(['toString', 'constructor', '__proto__', 'hasOwnProperty', 'valueOf'])('%s is rejected as a variable id', (id) => {
    expect(() =>
      buildModel({
        variables: [variable('U', 'exogenous'), variable(id, 'endogenous'), variable('Y', 'endogenous')],
        equations: { [id]: 'U', Y: id },
      }),
    ).toThrow(/reserved/)
  })
})
