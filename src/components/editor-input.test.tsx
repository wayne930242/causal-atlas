// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getCase } from '../data/index.ts'
import { caseToDoc, decodeShare, encodeShare } from '../data/model-doc.ts'
import { blankDraft, compileDraft, newKey } from './editor/draft.ts'
import type { Draft, DraftVariable } from './editor/draft.ts'
import { ModelEditor } from './index.ts'
import { solve } from './model-state.ts'

vi.mock('../data/model-doc.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/model-doc.ts')>()
  return { ...actual, decodeShare: vi.fn(actual.decodeShare) }
})
vi.mock('./model-state.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./model-state.ts')>()
  return { ...actual, solve: vi.fn(actual.solve) }
})
const decode = vi.mocked(decodeShare)
const solved = vi.mocked(solve)

afterEach(cleanup)
beforeEach(() => {
  solved.mockClear()
})

const open = (name: string): void => {
  const head = screen.getByRole('button', { name })
  if (head.getAttribute('aria-expanded') === 'false') fireEvent.click(head)
}
const type = (label: string | RegExp, value: string): void => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}
const label = { 'zh-TW': 'x', en: 'x' }

describe('REV-F001: the editor solves once per model, not once per render', () => {
  it('does not solve again when only the notation changes', () => {
    render(<ModelEditor initial="rock-throwing" />)
    const before = solved.mock.calls.length
    expect(before).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: '數學式' }))
    fireEvent.click(screen.getByRole('button', { name: '干預式' }))
    expect(solved.mock.calls.length).toBe(before)
  })

  it('reports a probabilistic draft with too many contexts where compileDraft reports errors', () => {
    const variables: DraftVariable[] = Array.from({ length: 14 }, (_, i) => ({
      key: newKey(),
      id: `U${i}`,
      label: '',
      en: '',
      kind: 'exogenous',
      domain: 'boolean',
      values: '',
      shown: false,
    }))
    const draft: Draft = { ...blankDraft('t'), mode: 'probability', variables }
    const compiled = compileDraft(draft)
    expect(compiled.loaded).toBeUndefined()
    const model = compiled.errors.model
    expect(model?.code === 'model' && model.problems.map((p) => p.code)).toEqual(['too-many-contexts'])
  })
})

describe('REV-F003: untrusted input in the editor', () => {
  it('shows a message when decoding a share link fails unexpectedly', async () => {
    decode.mockRejectedValueOnce(new Error('boom'))
    render(<ModelEditor initial="blank" hash="#model=1.abc" />)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/分享連結/)
  })

  it('shows a cyclic case file as an import error instead of crashing', () => {
    render(<ModelEditor initial="rock-throwing" />)
    open('存檔與分享')
    const cyclic = {
      id: 'x',
      title: label,
      family: 'actual',
      story: label,
      explanation: label,
      copy_status: { 'zh-TW': 'draft', en: 'draft' },
      sources: [{ citation: 'c', role: 'origin', verified: false }],
      model: {
        variables: [
          { id: 'A', label, kind: 'endogenous', domain: 'boolean' },
          { id: 'B', label, kind: 'endogenous', domain: 'boolean' },
        ],
        equations: { A: 'B', B: 'A' },
      },
      context: {},
      verdicts: [{ theory: 'butfor', query: { cause: 'A=1', effect: 'B=1' }, expected: 'cause' }],
      showcase: [],
    }
    type('貼上 JSON', JSON.stringify(cyclic))
    fireEvent.click(screen.getByRole('button', { name: '匯入' }))
    const alert = within(screen.getByRole('group', { name: '匯入 JSON' })).getByRole('alert')
    expect(alert.textContent).toMatch(/式子繞成一圈：A → B → A|式子繞成一圈：B → A → B/)
  })
})

describe('REV-F006: an imported document credits a bundled case only when it is that case', () => {
  const startedFrom = (): HTMLSelectElement => screen.getByLabelText('從案例開始') as HTMLSelectElement
  const rock = caseToDoc(getCase('rock-throwing'))
  const modified = { ...rock, model: { ...rock.model, equations: { ...rock.model.equations, BH: 'BT' } } }

  it('keeps `from` for pasted JSON of the unchanged case and drops it for a modified one', () => {
    render(<ModelEditor initial="blank" />)
    open('存檔與分享')
    type('貼上 JSON', JSON.stringify(rock))
    fireEvent.click(screen.getByRole('button', { name: '匯入' }))
    expect(startedFrom().value).toBe('rock-throwing')
    type('貼上 JSON', JSON.stringify(modified))
    fireEvent.click(screen.getByRole('button', { name: '匯入' }))
    expect(startedFrom().value).toBe('')
  })

  it('keeps `from` from a share link of the unchanged case', async () => {
    const value = await encodeShare(rock)
    render(<ModelEditor initial="blank" hash={`#model=${value}`} />)
    await waitFor(() => expect(screen.getByLabelText('模型名稱')).toHaveProperty('value', getCase('rock-throwing').data.title['zh-TW']))
    expect(startedFrom().value).toBe('rock-throwing')
  })

  it('drops `from` from a share link of a modified model', async () => {
    const value = await encodeShare(modified)
    render(<ModelEditor initial="blank" hash={`#model=${value}`} />)
    await waitFor(() => expect(screen.getByLabelText('模型名稱')).toHaveProperty('value', getCase('rock-throwing').data.title['zh-TW']))
    expect(startedFrom().value).toBe('')
  })

  it('keeps the credit when the editor itself started from the case', () => {
    render(<ModelEditor initial="rock-throwing" />)
    expect(startedFrom().value).toBe('rock-throwing')
  })
})
