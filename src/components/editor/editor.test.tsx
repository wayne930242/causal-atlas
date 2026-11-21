// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getCase } from '../../data/index.ts'
import { modelDocSchema } from '../../data/schema.ts'
import { saveFile } from '../export/download.ts'
import { freeCell } from './draft.ts'
import { ModelEditor } from '../index.ts'

vi.mock('../export/download.ts', () => ({ saveFile: vi.fn() }))
const saved = vi.mocked(saveFile)

beforeEach(() => saved.mockReset())
afterEach(() => {
  cleanup()
  // The editor writes the model it shows into the address; the next test starts from none.
  window.history.replaceState(null, '', '/')
})

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
  // A typeset label (role=math) repeats the plain text in its aria-label: pick the field.
  fireEvent.change(screen.getByLabelText(label, { selector: 'input, select, textarea' }), { target: { value } })
}

describe('ModelEditor', () => {
  it('starts with every editing panel closed', () => {
    render(<ModelEditor />)
    for (const name of ['變數', '式子', '外生變數的值', '常態', '存檔與分享']) {
      expect(screen.getByRole('button', { name }).getAttribute('aria-expanded')).toBe('false')
    }
  })

  it('builds and evaluates a model from inputs', () => {
    const { container } = render(<ModelEditor initial="blank" />)
    expect(container.querySelector('.ca-graph')).toBeNull()
    open('變數')
    fireEvent.click(screen.getByRole('button', { name: '加一個變數' }))
    fireEvent.click(screen.getByRole('button', { name: '加一個變數' }))
    type('第 1 個變數：代號', 'U')
    type('第 1 個變數：中文名稱', '開關')
    type('第 1 個變數：種類', 'exogenous')
    type('第 2 個變數：代號', 'A')
    type('第 2 個變數：中文名稱', '燈亮')
    open('式子')
    type('A 的式子', 'not U')
    open('外生變數的值')
    type('U 的值', '0')
    expect(node(container, 'A').getAttribute('data-value')).toBe('1')
    expect(node(container, 'U').getAttribute('data-value')).toBe('0')
    type('U 的值', '1')
    expect(node(container, 'A').getAttribute('data-value')).toBe('0')

    // A finite domain and probabilities.
    type('第 2 個變數：值域', 'list')
    type('第 2 個變數：可能的值', 'dark, bright')
    type('A 的式子', "if U then 'bright' else 'dark'")
    fireEvent.click(screen.getByRole('button', { name: '機率' }))
    type('P(U=1)', '0.25')
    // A has two values now: a bar for each, dark 0.75 and bright 0.25.
    const bar = (value: string): number =>
      Number(node(container, 'A').querySelector(`[data-bar="${value}"]`)?.getAttribute('data-p'))
    expect(bar('dark')).toBeCloseTo(0.75)
    expect(bar('bright')).toBeCloseTo(0.25)
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
    expect(screen.getByRole('alert').textContent).toMatch(/式子繞成一圈：(SH ?→ ?BS ?→ ?SH|BS ?→ ?SH ?→ ?BS)/)
  })

  it('loads a case as a starting point and moves nodes with the arrow keys', () => {
    const { container } = render(<ModelEditor initial="rock-throwing" />)
    const option = container.querySelector<HTMLElement>('.ca-editor-side [role="option"][data-key="newcomb"]')
    if (option === null) throw new Error('no option newcomb')
    fireEvent.click(option)
    expect(node(container, 'P')).toBeDefined()
    expect(container.querySelector('.ca-graph')?.getAttribute('data-mode')).toBe('probability')
    const before = node(container, 'M').getAttribute('transform')
    fireEvent.keyDown(node(container, 'M'), { key: 'ArrowDown' })
    expect(node(container, 'M').getAttribute('transform')).not.toBe(before)
  })

  it('drags a node to a new place, then a plain click still opens its menu', () => {
    const { container } = render(<ModelEditor initial="rock-throwing" />)
    const svg = container.querySelector('.ca-graph') as SVGSVGElement
    const before = node(container, 'BS').getAttribute('transform')
    fireEvent.pointerDown(node(container, 'BS'), { pointerId: 1, button: 0, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 160, clientY: 220 })
    fireEvent.pointerUp(svg, { pointerId: 1, clientX: 160, clientY: 220 })
    expect(node(container, 'BS').getAttribute('transform')).not.toBe(before)
    expect(node(container, 'BS').getAttribute('data-intervened')).toBe('false')
    // A click that trails the drag is ignored; a press-release without movement is a click.
    fireEvent.click(node(container, 'BS'))
    expect(container.querySelector('[data-menu]')).toBeNull()
    const later = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 1000)
    fireEvent.pointerDown(node(container, 'SH'), { pointerId: 2, button: 0, clientX: 10, clientY: 10 })
    fireEvent.pointerUp(node(container, 'SH'), { pointerId: 2, clientX: 10, clientY: 10 })
    fireEvent.click(node(container, 'SH'))
    expect(container.querySelector('[data-menu="SH"]')).not.toBeNull()
    later.mockRestore()
  })

  it('places a new variable clear of nodes on half rows', () => {
    expect(freeCell({ a: [0, 0], b: [0, 1], c: [1, 0.5] })).toEqual([2, 0])
  })

  it('exports an image of the edited model crediting the starting case', () => {
    const { container } = render(<ModelEditor initial="rock-throwing" />)
    fireEvent.click(within(container).getByRole('button', { name: '下載圖片' }))
    const menu = within(container).getByRole('group', { name: '圖片設定' })
    fireEvent.click(within(menu).getByRole('button', { name: 'SVG' }))
    fireEvent.click(within(menu).getByRole('button', { name: '下載' }))
    const [name, svg] = saved.mock.calls[0]
    expect(name).toBe('my-model-graph-light.svg')
    expect(String(svg)).toContain('案例出處：Hall 2004')
    expect(String(svg)).toContain('實心＝發生（1）')
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
