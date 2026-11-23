// @vitest-environment jsdom
import { cleanup, fireEvent, render, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { lessonModel } from '../../demo/lesson-models.ts'
import { CausalPlayground } from '../index.ts'
import { doNode } from '../test-menu.ts'

afterEach(cleanup)

const node = (container: HTMLElement, id: string): Element => {
  const el = container.querySelector(`[data-node="${id}"]`)
  if (el === null) throw new Error(`no node ${id}`)
  return el
}
const cell = (container: HTMLElement, theory: string): Element => {
  const el = container.querySelector(`[data-verdict-cell="${theory}"]`)
  if (el === null) throw new Error(`no cell ${theory}`)
  return el
}
const live = (container: HTMLElement): string => container.querySelector('[data-witness-now]')?.textContent ?? ''
const hull = (container: HTMLElement): string | null => container.querySelector('.ca-witness')?.getAttribute('data-witness') ?? null
const heldNote = (container: HTMLElement, id: string): string | null => node(container, id).querySelector('[data-held]')?.textContent ?? null

const query = [{ cause: 'L=1', effect: 'FF=1' }]

describe('playground verdicts: one row per query, a witness on the graph, and whether this world is one', () => {
  it('the disjunctive forest fire: four standards, the witness of the original definition on the graph', () => {
    const { container } = render(<CausalPlayground caseId="forest-fire-disjunctive" verdicts={query} />)
    expect(container.textContent).toContain('L=1 是 FF=1 的原因嗎？')
    expect(cell(container, 'butfor').getAttribute('data-verdict')).toBe('not-cause')
    expect(cell(container, 'hp-original').getAttribute('data-verdict')).toBe('cause')
    expect(cell(container, 'hp-updated').getAttribute('data-verdict')).toBe('cause')
    expect(cell(container, 'hp-modified').getAttribute('data-verdict')).toBe('part-of-cause')
    // No normality in this case: no fifth cell.
    expect(container.querySelector('[data-verdict-cell="hp-normality"]')).toBeNull()

    fireEvent.click(within(cell(container, 'hp-original') as HTMLElement).getByRole('button', { name: '在圖上看' }))
    expect(node(container, 'L').getAttribute('data-value')).toBe('0')
    expect(node(container, 'MD').getAttribute('data-value')).toBe('0')
    expect(node(container, 'FF').getAttribute('data-value')).toBe('0')
    expect(hull(container)).toBe('MD')
    expect(heldNote(container, 'MD')).toBe('固定為 0（實際 1）')
    const now = live(container)
    expect(now).toContain('HP 原始定義、HP 更新定義：是 L 的見證')
    expect(now).toContain('HP 修正定義：不是，MD 沒有固定在實際值 1')
    expect(now).toContain('but-for 檢驗：不是，只改 L')
  })

  it("the reader's own do() is never drawn held", () => {
    const { container } = render(<CausalPlayground caseId="forest-fire-disjunctive" verdicts={query} />)
    doNode(container, 'L', '0')
    expect(node(container, 'L').getAttribute('data-value')).toBe('0')
    expect(hull(container)).toBeNull()
    expect(live(container)).toContain('FF=1 還成立')
    doNode(container, 'MD', '1')
    expect(hull(container)).toBeNull()
    expect(heldNote(container, 'MD')).toBeNull()
    doNode(container, 'MD', '0')
    expect(heldNote(container, 'MD')).toBeNull()
    expect(live(container)).toContain('HP 原始定義、HP 更新定義：是 L 的見證')
  })

  it.each(['zh-TW', 'en'] as const)('updates the marks, legend, explanation and active verdict after presets and witness clicks (%s)', (locale) => {
    const en = locale === 'en'
    const { container, getByText } = render(<CausalPlayground locale={locale} caseId="forest-fire-disjunctive" presets={[
      { label: 'hold', interventions: { L: 0 }, hold: { MD: 0 } },
      { label: 'both', interventions: { L: 0, MD: 0 } },
    ]} verdicts={[...query, { cause: 'L=1 and MD=1', effect: 'FF=1', theories: ['hp-original', 'hp-updated', 'hp-modified'] }]} />)
    const legend = () => container.querySelector('[data-mark-legend]')?.textContent
    const clamp = en ? 'Red corners' : '紅色框角'
    const hold = en ? 'held fixed' : '固定住'
    expect(legend()).toBeUndefined()
    expect(cell(container, 'butfor').textContent).toContain(en ? 'But-for test' : 'but-for 檢驗')
    const checkHeld = () => {
      expect(hull(container)).toBe('MD')
      expect(heldNote(container, 'MD')).toBe(en ? 'held at 0 (actually 1)' : '固定為 0（實際 1）')
      expect(legend()).toContain(hold)
    }
    const checkBoth = () => {
      expect(hull(container)).toBeNull()
      for (const id of ['L', 'MD']) expect(node(container, id).querySelector('.ca-stroke-clamp')).not.toBeNull()
      expect(legend()).toContain(clamp)
      expect(legend()).toContain(en ? 'actual world' : '實際世界的值')
      expect(legend()).not.toContain(hold)
      expect(live(container)).not.toContain(en ? 'But-for test:' : 'but-for 檢驗：')
    }
    fireEvent.click(getByText('hold')); checkHeld()
    fireEvent.click(getByText('both')); checkBoth()
    const show = (group: number, theory: string) => fireEvent.click(container.querySelectorAll('[data-query]')[group].querySelector(`[data-verdict-cell="${theory}"] button`)!)
    show(0, 'hp-original'); checkHeld()
    show(1, 'hp-modified'); checkBoth()
    const summary = container.querySelector<HTMLDetailsElement>('[data-witness-now] details')!
    expect(summary.open).toBe(false)
    fireEvent.click(summary.querySelector('summary')!); expect(summary.open).toBe(true)
    fireEvent.click(summary.querySelector('summary')!); expect(summary.open).toBe(false)
  })

  it('a model with normality gets the fifth cell', () => {
    const { container } = render(<CausalPlayground doc={lessonModel('m10-pen')} verdicts={[{ cause: 'PT=1', effect: 'PO=1' }]} />)
    expect(container.querySelector('[data-verdict-cell="hp-normality"]')).not.toBeNull()
  })

  it('verdicts need a graph with values', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<CausalPlayground doc={lessonModel('m02-collider')} verdicts={[{ cause: 'X=1', effect: 'Z=1' }]} />)).toThrow(/verdicts/)
    spy.mockRestore()
  })
})
