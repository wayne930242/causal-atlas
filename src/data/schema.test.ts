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

  it('requires the story, the explanation and an origin source', () => {
    const noExplanation = seed('rock-throwing')
    delete noExplanation.explanation
    expect(issues(noExplanation).join()).toMatch(/explanation/)

    const emptyStory = seed('rock-throwing')
    emptyStory.story = { 'zh-TW': '', en: 'A story.' }
    expect(issues(emptyStory).join()).toMatch(/story\.zh-TW/)

    const noOrigin = seed('rock-throwing')
    noOrigin.sources = (noOrigin.sources as { role: string }[]).map((s) => ({ ...s, role: 'treatment' }))
    expect(issues(noOrigin)).toContain('sources: needs at least one source with role origin')

    const noRole = seed('rock-throwing')
    noRole.sources = [{ citation: 'x', verified: false }]
    expect(issues(noRole).join()).toMatch(/role/)
  })

  it('rejects unknown keys and theories', () => {
    expect(issues({ ...seed('rock-throwing'), extra: 1 }).join()).toMatch(/extra/)
    const badTheory = seed('rock-throwing')
    badTheory.verdicts = [{ theory: 'lewis', query: { cause: 'ST=1', effect: 'BS=1' }, expected: 'cause' }]
    expect(issues(badTheory)).not.toEqual([])
  })

  it('checks layout variables', () => {
    const badLayout = seed('rock-throwing')
    badLayout.layout = { ST: [0, 0], XX: [1, 0] }
    expect(issues(badLayout)).toContain('layout.XX: unknown variable XX')
    const badCell = seed('rock-throwing')
    badCell.layout = { ST: [0] }
    expect(issues(badCell).join()).toMatch(/layout\.ST/)
  })

  it('checks story tags and the intuition query', () => {
    const badTag = seed('rock-throwing')
    badTag.story_tags = { 'zh-TW': [{ sentence: '不在故事裡的句子。', variables: ['ST'] }, { sentence: '瓶子', variables: ['XX'] }], en: [] }
    expect(issues(badTag)).toEqual([
      'story_tags.zh-TW.0.sentence: sentence not found in story.zh-TW',
      'story_tags.zh-TW.1.variables: unknown variable XX',
    ])
    const badIntuition = seed('rock-throwing')
    badIntuition.intuition = { query: { cause: 'SH=1', effect: 'BS=1' }, expected: 'cause', text: { 'zh-TW': 'x', en: 'x' }, agree: [] }
    expect(issues(badIntuition)).toContain('intuition.query: no verdict asks this query')
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
