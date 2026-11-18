import { describe, expect, it } from 'vitest'
import type { Problem } from '../../engine/index.ts'
import { NO_DO, NO_OBSERVATION } from './do-state.ts'
import { blankDraft } from './draft.ts'
import type { Session } from './session.ts'
import { sessionReducer, startSession } from './session.ts'

const problem: Problem = { code: 'too-large', params: {} }

function busy(): Session {
  const draft = blankDraft('a')
  return {
    ...startSession({ draft, problems: [problem], picked: 'm1', named: 'm1' }),
    doState: { interventions: { X: true }, stochastic: {} },
    observed: { Y: true },
    loadErrors: ['bad link'],
  }
}

describe('sessionReducer', () => {
  it('starts with nothing set, and names the draft when the start has an id', () => {
    const draft = blankDraft('a')
    const s = startSession({ draft, problems: [], named: 'blank' })
    expect(s).toEqual({ draft, picked: undefined, docProblems: [], doState: NO_DO, observed: NO_OBSERVATION, base: { draft, id: 'blank' }, loadErrors: [] })
    expect(startSession({ draft, problems: [] }).base).toBeUndefined()
  })

  it('shows a model from the address with its do(), clearing what went wrong reading an earlier one', () => {
    const draft = blankDraft('b')
    const doState = { interventions: { A: 1 }, stochastic: {} }
    const s = sessionReducer(busy(), { type: 'show', start: { draft, problems: [], named: 'rock-throwing' }, doState })
    expect(s).toEqual({ draft, picked: undefined, docProblems: [], doState, observed: NO_OBSERVATION, base: { draft, id: 'rock-throwing' }, loadErrors: [] })
  })

  it('picks a model from the list with nothing set, keeping the reading errors', () => {
    const draft = blankDraft('c')
    const s = sessionReducer(busy(), { type: 'pick', start: { draft, problems: [problem], picked: 'm2', named: 'm2' } })
    expect(s).toEqual({ draft, picked: 'm2', docProblems: [problem], doState: NO_DO, observed: NO_OBSERVATION, base: { draft, id: 'm2' }, loadErrors: ['bad link'] })
  })

  it('replaces the draft with an import: no extra model, no problems, no name', () => {
    const draft = blankDraft('d')
    const s = sessionReducer(busy(), { type: 'replace', draft })
    expect(s).toEqual({ draft, picked: undefined, docProblems: [], doState: NO_DO, observed: NO_OBSERVATION, base: undefined, loadErrors: ['bad link'] })
  })

  it('changes nothing for an edit that returns the same draft, or the same do() or observations', () => {
    const s = busy()
    expect(sessionReducer(s, { type: 'edit', edit: (d) => d })).toBe(s)
    expect(sessionReducer(s, { type: 'setDo', doState: s.doState })).toBe(s)
    expect(sessionReducer(s, { type: 'observe', observed: s.observed })).toBe(s)
  })

  it('edits only the draft', () => {
    const s = busy()
    const next = sessionReducer(s, { type: 'edit', edit: (d) => ({ ...d, title: 'new' }) })
    expect(next.draft.title).toBe('new')
    expect({ ...next, draft: s.draft }).toEqual(s)
    expect(next.doState).toBe(s.doState)
    expect(next.base).toBe(s.base)
  })

  it('records what went wrong reading the address', () => {
    expect(sessionReducer(busy(), { type: 'loadFailed', errors: ['x', 'y'] }).loadErrors).toEqual(['x', 'y'])
  })
})
