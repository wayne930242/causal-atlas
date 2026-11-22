import { describe, expect, it } from 'vitest'
import { randomScm } from '../test-models.ts'
import type { Admg, DerivationStep, DoExpr } from './index.ts'
import { compareDoExprs, derive, identify, probExprLatex, probExprText } from './index.ts'

/**
 * derive(): the steps from P(y | do(x), w) to identify()'s formula. The rules view checks each step
 * on a full model (src/components/probability/derivation.test.ts); here, the shape of the result,
 * the hedge, IDC, the rendering of do() terms, and the comparison on a model.
 */

const frontdoor: Admg = { nodes: ['X', 'Z', 'Y'], directed: [['X', 'Z'], ['Z', 'Y']], bidirected: [['X', 'Y']] }
const bow: Admg = { nodes: ['X', 'Y'], directed: [['X', 'Y']], bidirected: [['X', 'Y']] }

function outline(steps: readonly DerivationStep[], names: readonly string[]): string[] {
  const t = (e: DoExpr): string => probExprText(e, { names })
  return steps.map((s) => `${s.kind === 'rule' ? `R${s.rule}` : s.kind}: ${t(s.left)} = ${t(s.right)}`)
}

describe('derive', () => {
  it('the bow: no derivation, identify()’s hedge', () => {
    expect(derive(bow, ['Y'], ['X'])).toEqual(identify(bow, ['Y'], ['X']))
  })

  it('frontdoor: each rule step names its test, with the cuts computed from the rule', () => {
    const d = derive(frontdoor, ['Y'], ['X'])
    if (!d.identifiable) throw new Error('identifiable')
    expect(d.text).toBe("Σ_z P(z|x) Σ_x' P(y|x',z) P(x')")
    expect(d.matches).toBe(true)
    const rules = d.steps.filter((s) => s.kind === 'rule')
    expect(rules.map((s) => [s.rule, s.test])).toEqual([
      [2, { moved: ['X'], head: ['Z'], given: [], cutIn: [], cutOut: ['X'] }],
      [2, { moved: ['Z'], head: ['Y'], given: ['X'], cutIn: ['X'], cutOut: ['Z'] }],
      [3, { moved: ['X'], head: ['Y'], given: ['Z'], cutIn: ['X', 'Z'], cutOut: [] }],
      [3, { moved: ['Z'], head: ['X'], given: [], cutIn: ['Z'], cutOut: [] }],
      [2, { moved: ['Z'], head: ['Y'], given: ['X'], cutIn: [], cutOut: ['Z'] }],
    ])
  })

  it('IDC: rule 2 first moves w = Z into do(), then ID', () => {
    const d = derive(frontdoor, ['Y'], ['X'], ['Z'])
    if (!d.identifiable) throw new Error('identifiable')
    expect(d.text).toBe("Σ_x' P(y|x',z) P(x')")
    expect(outline(d.steps, frontdoor.nodes)).toEqual([
      'R2: P(y|do(x),z) = P(y|do(x,z))',
      'R3: P(y|do(x,z)) = P(y|do(z))',
      'expand: P(y|do(z)) = Σ_x P(x,y|do(z))',
      'chain: P(x,y|do(z)) = P(x|do(z)) P(y|do(z),x)',
      'R3: P(x|do(z)) = P(x)',
      'R2: P(y|do(z),x) = P(y|x,z)',
      'simplify: Σ_x P(x) P(y|x,z) = Σ_x P(y|x,z) P(x)',
    ])
  })

  it('IDC with w left observed: the conditional is a ratio of the joint and its sum over y', () => {
    const g: Admg = { nodes: ['X', 'Y', 'W'], directed: [['X', 'Y'], ['Y', 'W']], bidirected: [] }
    const d = derive(g, ['Y'], ['X'], ['W'])
    if (!d.identifiable) throw new Error('identifiable')
    expect(d.text).toBe('P(y|w,x)')
    expect(d.matches).toBe(true)
    expect(d.steps.map((s) => s.kind)).toContain('conditional')
  })

  it('writes do() first among the conditions, in text and LaTeX', () => {
    const t: DoExpr = { kind: 'p', vars: ['Y'], given: ['Z'], do: ['X'] }
    expect(probExprText(t, { names: ['X', 'Y', 'Z'] })).toBe('P(y|do(x),z)')
    expect(probExprLatex(t, { names: ['X', 'Y', 'Z'] })).toBe('P(y \\mid \\operatorname{do}(x), z)')
  })

  it('compareDoExprs puts do() beside the formula at every assignment', () => {
    const { model, prior } = randomScm(frontdoor, 3)
    const d = derive(frontdoor, ['Y'], ['X'])
    if (!d.identifiable) throw new Error('identifiable')
    const same = compareDoExprs(model, prior, d.query, d.formula, 1e-9)
    expect([same.free, same.rows, same.differsAt]).toEqual([['X', 'Y'], 4, undefined])
    const naive = compareDoExprs(model, prior, d.query, { kind: 'p', vars: ['Y'], given: ['X'] }, 1e-9)
    expect(naive.differsAt).toBeDefined()
  })
})
