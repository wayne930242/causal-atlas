// @vitest-environment jsdom
import { cleanup, fireEvent, render, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { lessonModel } from '../../demo/lesson-models.ts'
import { CausalPlayground } from '../index.ts'

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
    expect(heldNote(container, 'MD')).toBe('固定（實際 1）')
    const now = live(container)
    expect(now).toContain('HP 原始定義、HP 更新定義：是 L 的見證')
    expect(now).toContain('HP 修正定義：不是，MD 沒有固定在實際值 1')
    expect(now).toContain('簡單反事實：不是，只改 L')
  })

  it("the reader's own do() on a variable other than the cause is drawn held", () => {
    const { container } = render(<CausalPlayground caseId="forest-fire-disjunctive" verdicts={query} />)
    // L: first click pins its current value 1, the second sets 0.
    fireEvent.click(node(container, 'L'))
    fireEvent.click(node(container, 'L'))
    expect(node(container, 'L').getAttribute('data-value')).toBe('0')
    expect(hull(container)).toBeNull()
    expect(live(container)).toContain('FF=1 還成立')
    fireEvent.click(node(container, 'MD'))
    expect(hull(container)).toBe('MD')
    expect(heldNote(container, 'MD')).toBe('固定（實際值）')
    fireEvent.click(node(container, 'MD'))
    expect(heldNote(container, 'MD')).toBe('固定（實際 1）')
    expect(live(container)).toContain('HP 原始定義、HP 更新定義：是 L 的見證')
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
