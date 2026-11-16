import { describe, expect, it } from 'vitest'
import { caseFiles } from './cases.ts'
import { loadCase } from './load.ts'
import { caseSchema } from './schema.ts'

function seed(id: string): Record<string, unknown> {
  const raw = caseFiles[`./cases/${id}.json`]
  if (typeof raw !== 'object' || raw === null) throw new Error(`missing seed ${id}`)
  return structuredClone(raw) as Record<string, unknown>
}

function issues(raw: unknown): string[] {
  const result = caseSchema.safeParse(raw)
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
}

describe('case schema', () => {
  it('accepts the seeds', () => {
    expect(issues(seed('rock-throwing'))).toEqual([])
  })

  it('requires what each theory needs', () => {
    const noNormality = seed('gardener-queen')
    delete noNormality.normality
    expect(issues(noNormality)).toContain('verdicts.4: hp-normality needs normality defaults')

    const noDecision = seed('newcomb')
    delete noDecision.decision
    expect(issues(noDecision)).toContain('verdicts.2: edt needs a decision')

    const badChoice = seed('newcomb')
    badChoice.verdicts = [{ theory: 'edt', query: { choice: 'M' }, expected: 'one' }]
    expect(issues(badChoice)).toContain('verdicts.0: choice must name the decision variable')

    const badEu = seed('newcomb')
    badEu.verdicts = [{ theory: 'cdt', query: { expectedUtility: 'one' }, expected: 'lots' }]
    expect(issues(badEu)).toContain('verdicts.0: expectedUtility expects a number')

    const noContext = seed('rock-throwing')
    delete noContext.context
    expect(issues(noContext)).toContain('verdicts.0: butfor needs a context')
  })

  it('rejects unknown keys and theories', () => {
    expect(issues({ ...seed('rock-throwing'), extra: 1 }).join()).toMatch(/extra/)
    const badTheory = seed('rock-throwing')
    badTheory.verdicts = [{ theory: 'lewis', query: { cause: 'ST=1', effect: 'BS=1' }, expected: 'cause' }]
    expect(issues(badTheory)).not.toEqual([])
  })

  it('loader rejects bad tables and priors', () => {
    const badRow = seed('newcomb')
    const model = badRow.model as { equations: Record<string, unknown> }
    model.equations.P = { table: { inputs: ['D', 'E'], rows: [['one', 'one']] } }
    expect(() => loadCase(badRow)).toThrow(/each row needs 2 inputs and an output/)

    const badPrior = seed('newcomb')
    badPrior.priors = { independent: { D: 0.5, E: 0.01 } }
    expect(() => loadCase(badPrior)).toThrow(/only allowed for boolean variables/)
  })
})
