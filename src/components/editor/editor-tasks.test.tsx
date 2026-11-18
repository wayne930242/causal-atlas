// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { docToCase, caseToDoc, getCase } from '../../data/index.ts'
import { CaseInfo } from './CaseInfo.tsx'
import type { EditorTask } from './tasks.ts'
import { checkTask } from './tasks.ts'
import { ModelEditor } from '../index.ts'

afterEach(cleanup)

const conj = getCase('forest-fire-conjunctive')
const doc = caseToDoc(conj, 'zh-TW')
const disj = docToCase({ ...doc, model: { ...doc.model, equations: { ...doc.model.equations, FF: 'L or MD' } } })
const asL = docToCase({ ...doc, model: { ...doc.model, equations: { ...doc.model.equations, FF: 'L' } } })

const TASK: EditorTask = {
  id: 'disjunctive',
  title: '只改一條式子，把連言版森林大火改成選言版。',
  prompt: '把 FF 改成：閃電或丟菸蒂，任一個就起火。',
  start: 'forest-fire-conjunctive',
  goal: { equations: { FF: 'L or MD' } },
  predict: { cause: 'L=1', effect: 'FF=1' },
}

describe('checkTask: the edited equations against the goal, over every value of their parents', () => {
  it('passes L or MD and MD or L, gives one counterexample otherwise', () => {
    expect(checkTask(disj, TASK)).toMatchObject({ ok: true })
    const md = docToCase({ ...doc, model: { ...doc.model, equations: { ...doc.model.equations, FF: 'MD or L' } } })
    expect(checkTask(md, TASK)).toMatchObject({ ok: true })
    const no = checkTask(asL, TASK)
    expect(no.ok).toBe(false)
    expect(no).toMatchObject({ id: 'FF', yours: false, goal: true, at: { L: false, MD: true } })
  })

  it('reveals the four verdicts on the edited model: but-for no, original and updated yes, modified part of a cause', () => {
    const r = checkTask(disj, TASK)
    expect(r.ok && r.verdicts).toEqual({ butfor: 'not-cause', 'hp-original': 'cause', 'hp-updated': 'cause', 'hp-modified': 'part-of-cause' })
  })
})

describe('CaseInfo recompute: the engine column follows the edited model', () => {
  it('heads it 你的模型 and recomputes each verdict', () => {
    const { container } = render(<CaseInfo c={conj} edited recompute={disj} heading={false} />)
    expect(container.querySelector('thead')?.textContent).toContain('你的模型')
    expect(container.textContent).toContain('「你的模型」一欄依改過的式子重算')
    const first = container.querySelector('tbody tr') as HTMLElement
    expect(first.dataset.engine).toBe('not-cause')
    expect(first.dataset.ok).toBe('false')
  })
})

describe('ModelEditor: blank model first, the task card, the recomputed table', () => {
  it('lists the blank model first, with the copy note', () => {
    const { container } = render(<ModelEditor initial="forest-fire-conjunctive" syncUrl={false} />)
    const list = container.querySelector('.ca-editor-options') as HTMLElement
    expect(list.querySelector('[role="option"]')?.getAttribute('data-key')).toBe('blank')
    expect(list.textContent).toContain('選一個案例，就從它的副本改起')
  })

  it('checks a task, says what was guessed right, and the verdict table recomputes', () => {
    const { container, getByRole, getByLabelText } = render(<ModelEditor initial="forest-fire-conjunctive" syncUrl={false} tasks={[TASK]} />)
    const card = container.querySelector('.ca-editor-task') as HTMLElement
    expect(card.textContent).toContain('只改一條式子')
    fireEvent.click(getByRole('button', { name: /^式子/ }))
    const ff = getByLabelText('FF 的式子') as HTMLInputElement
    fireEvent.change(ff, { target: { value: 'L' } })
    fireEvent.click(getByRole('button', { name: '檢查' }))
    expect(card.textContent).toContain('你的 FF 是 0')
    fireEvent.change(ff, { target: { value: 'L or MD' } })
    fireEvent.click(getByRole('button', { name: 'HP 原始定義' }))
    fireEvent.click(getByRole('button', { name: 'HP 更新定義' }))
    fireEvent.click(getByRole('button', { name: '檢查' }))
    expect(card.textContent).toContain('FF 的式子和目標相同')
    expect(card.textContent).toContain('猜對 3 / 4')
    expect(container.querySelector('.ca-editor-verdicts thead')?.textContent).toContain('你的模型')
  })
})
