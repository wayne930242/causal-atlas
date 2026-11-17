// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { caseIds, getCase } from '../data/index.ts'
import { caseToDoc } from '../data/model-doc.ts'
import { ModelEditor } from './index.ts'

afterEach(cleanup)

const coarse = { ...caseToDoc(getCase('rock-throwing')), from: undefined, title: '丟石頭的粗模型' }
const extraModels = [
  {
    id: 'm08-rock-coarse',
    title: '丟石頭的粗模型',
    group: '第 8 講',
    doc: {
      ...coarse,
      model: {
        variables: coarse.model.variables.filter((v) => !['SH', 'BH'].includes(v.id)),
        equations: { ST: 'U_ST', BT: 'U_BT', BS: 'ST or BT' },
      },
      layout: undefined,
      normality: undefined,
    },
    links: [{ title: '形式 08', href: '/blog/formal-08/' }],
  },
]

const picker = (): HTMLSelectElement => screen.getByLabelText('從案例開始', { selector: 'select' }) as HTMLSelectElement
const filter = (): HTMLInputElement => screen.getByRole('searchbox', { name: '篩選' }) as HTMLInputElement
const values = (): string[] => [...picker().querySelectorAll('option')].map((o) => o.value)

describe('ModelEditor model list', () => {
  it('lists every case and host model, and the filter narrows the list', () => {
    render(<ModelEditor initial="rock-throwing" extraModels={extraModels} />)
    for (const id of caseIds) expect(values()).toContain(id)
    expect(values()).toContain('model:m08-rock-coarse')
    fireEvent.change(filter(), { target: { value: '紐康' } })
    expect(values()).toContain('newcomb')
    expect(values()).not.toContain('forest-fire-conjunctive')
    expect(values()).not.toContain('model:m08-rock-coarse')
    // The current choice stays listed, so the select keeps showing it.
    expect(values()).toContain('rock-throwing')
    expect(picker().value).toBe('rock-throwing')
    // By id and by group name too.
    fireEvent.change(filter(), { target: { value: '第 8 講' } })
    expect(values()).toContain('model:m08-rock-coarse')
    expect(values()).not.toContain('newcomb')
  })

  it('Enter in the filter loads the first match', () => {
    const { container } = render(<ModelEditor initial="rock-throwing" extraModels={extraModels} />)
    fireEvent.change(filter(), { target: { value: 'newcomb' } })
    fireEvent.keyDown(filter(), { key: 'Enter' })
    expect(picker().value).toBe('newcomb')
    expect(container.querySelector('.ca-editor-case h2')?.textContent).toBe(getCase('newcomb').data.title['zh-TW'])
    fireEvent.keyDown(filter(), { key: 'Escape' })
    expect(filter().value).toBe('')
  })

  it('choosing a host model loads its document and shows its links instead of a story', () => {
    const { container } = render(<ModelEditor initial="rock-throwing" extraModels={extraModels} />)
    expect(container.querySelector('.ca-graph [data-node="SH"]')).not.toBeNull()
    fireEvent.change(picker(), { target: { value: 'model:m08-rock-coarse' } })
    expect(picker().value).toBe('model:m08-rock-coarse')
    expect(container.querySelector('.ca-graph [data-node="SH"]')).toBeNull()
    expect(container.querySelector('.ca-graph [data-node="BS"]')).not.toBeNull()
    expect((screen.getByLabelText('模型名稱') as HTMLInputElement).value).toBe('丟石頭的粗模型')
    const panel = container.querySelector('.ca-editor-case') as HTMLElement
    expect(within(panel).getByRole('link', { name: '形式 08' }).getAttribute('href')).toBe('/blog/formal-08/')
    expect(panel.querySelector('.ca-story')).toBeNull()
    // Back to a case: the story returns.
    fireEvent.change(picker(), { target: { value: 'firing-squad' } })
    expect(container.querySelector('.ca-editor-case .ca-story')).not.toBeNull()
  })

  it('notes when the model was edited away from the case', () => {
    const { container } = render(<ModelEditor initial="rock-throwing" />)
    expect(container.querySelector('.ca-editor-case-edited')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '式子' }))
    fireEvent.change(screen.getByLabelText('BS 的式子', { selector: 'input' }), { target: { value: 'SH' } })
    expect(container.querySelector('.ca-editor-case-edited')).not.toBeNull()
  })
})
