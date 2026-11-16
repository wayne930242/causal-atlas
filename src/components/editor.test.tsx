// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getCase } from '../data/index.ts'
import { modelDocSchema } from '../data/schema.ts'
import { saveFile } from './download.ts'
import { ModelEditor } from './index.ts'

vi.mock('./download.ts', () => ({ saveFile: vi.fn() }))
const saved = vi.mocked(saveFile)

beforeEach(() => saved.mockReset())
afterEach(cleanup)

function node(container: HTMLElement, id: string): Element {
  const el = container.querySelector(`.ca-graph [data-node="${id}"]`)
  if (el === null) throw new Error(`no node ${id}`)
  return el
}

const open = (name: string): void => {
  const head = screen.getByRole('button', { name })
  if (head.getAttribute('aria-expanded') === 'false') fireEvent.click(head)
}

const type = (label: string | RegExp, value: string): void => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

describe('ModelEditor', () => {
  it('starts with every editing panel closed', () => {
    render(<ModelEditor />)
    for (const name of ['變項', '式子', '外生變項的值', '常態', '存檔與分享']) {
      expect(screen.getByRole('button', { name }).getAttribute('aria-expanded')).toBe('false')
    }
  })

  it('builds and evaluates a model from inputs', () => {
    const { container } = render(<ModelEditor initial="blank" />)
    expect(container.querySelector('.ca-graph')).toBeNull()
    open('變項')
    fireEvent.click(screen.getByRole('button', { name: '加一個變項' }))
    fireEvent.click(screen.getByRole('button', { name: '加一個變項' }))
    type('第 1 個變項：代號', 'U')
    type('第 1 個變項：中文名稱', '開關')
    type('第 1 個變項：種類', 'exogenous')
    type('第 2 個變項：代號', 'A')
    type('第 2 個變項：中文名稱', '燈亮')
    open('式子')
    type('A 的式子', 'not U')
    open('外生變項的值')
    type('U 的值', '0')
    expect(node(container, 'A').getAttribute('data-value')).toBe('1')
    expect(node(container, 'U').getAttribute('data-value')).toBe('0')
    type('U 的值', '1')
    expect(node(container, 'A').getAttribute('data-value')).toBe('0')

    // A finite domain and probabilities.
    type('第 2 個變項：值域', 'list')
    type('第 2 個變項：可能的值', 'dark, bright')
    type('A 的式子', "if U then 'bright' else 'dark'")
    fireEvent.click(screen.getByRole('button', { name: '機率' }))
    type('P(U=1)', '0.25')
    const level = node(container, 'A').querySelector('[data-level]')?.getAttribute('data-level')
    expect(Number(level)).toBeCloseTo(0.75)
  })

  it('shows a parse error under the equation and keeps the last good graph', () => {
    const { container } = render(<ModelEditor initial="rock-throwing" />)
    open('式子')
    type('BH 的式子', 'BT and (')
    const input = screen.getByLabelText('BH 的式子')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    const error = document.getElementById(input.getAttribute('aria-describedby') ?? '')
    expect(error?.textContent).toMatch(/看不懂這條式子/)
    expect(screen.getByRole('alert').textContent).toMatch(/BH/)
    expect(node(container, 'BH')).toBeDefined()
    type('BH 的式子', 'BT and not SH')
    expect(input.getAttribute('aria-invalid')).toBe('false')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('rejects a cycle and names it', () => {
    render(<ModelEditor initial="rock-throwing" />)
    open('式子')
    type('SH 的式子', 'BS')
    expect(screen.getByRole('alert').textContent).toMatch(/式子繞成一圈：(SH → BS → SH|BS → SH → BS)/)
  })

  it('loads a case as a starting point and moves nodes with the arrow keys', () => {
    const { container } = render(<ModelEditor initial="rock-throwing" />)
    type('從案例開始', 'newcomb')
    expect(node(container, 'P')).toBeDefined()
    expect(container.querySelector('.ca-graph')?.getAttribute('data-mode')).toBe('probability')
    const before = node(container, 'M').getAttribute('transform')
    fireEvent.keyDown(node(container, 'M'), { key: 'ArrowDown' })
    expect(node(container, 'M').getAttribute('transform')).not.toBe(before)
  })

  it('exports JSON that the schema accepts and rejects invalid JSON on import', () => {
    const { container } = render(<ModelEditor initial="rock-throwing" />)
    open('存檔與分享')
    fireEvent.click(screen.getByRole('button', { name: '下載 JSON' }))
    const [name, text] = saved.mock.calls[0]
    expect(name).toBe('causal-model.json')
    const doc = modelDocSchema.parse(JSON.parse(String(text)))
    expect(doc.model.equations.BH).toBe('BT and not SH')

    type('貼上 JSON', '{"format":"causal-atlas/model","version":1}')
    fireEvent.click(screen.getByRole('button', { name: '匯入' }))
    const alert = within(screen.getByRole('group', { name: '匯入 JSON' })).getByRole('alert')
    expect(alert.textContent).toMatch(/title/)
    expect(node(container, 'BS')).toBeDefined()

    type('貼上 JSON', JSON.stringify(getCase('firing-squad').data))
    fireEvent.click(screen.getByRole('button', { name: '匯入' }))
    expect(node(container, 'D')).toBeDefined()
  })

  it('shares the model through the URL hash', async () => {
    const first = render(<ModelEditor initial="rock-throwing" shareHref={(v) => `https://x.test/editor#model=${v}`} />)
    open('式子')
    type('BH 的式子', 'BT')
    open('存檔與分享')
    fireEvent.click(screen.getByRole('button', { name: '產生分享連結' }))
    const link = (await screen.findByRole('textbox', { name: '分享連結' })) as HTMLInputElement
    expect(link.value).toMatch(/^https:\/\/x\.test\/editor#model=1\./)
    first.unmount()

    const second = render(<ModelEditor initial="blank" hash={new URL(link.value).hash} />)
    await waitFor(() => expect(second.container.querySelector('.ca-graph [data-node="BH"]')).not.toBeNull())
    open('式子')
    expect((screen.getByLabelText('BH 的式子') as HTMLInputElement).value).toBe('BT')
  })
})
