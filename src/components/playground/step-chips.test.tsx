// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { lessonModel } from '../../demo/lesson-models.ts'
import { CausalPlayground } from '../index.ts'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const node = (container: HTMLElement, id: string): Element => {
  const el = container.querySelector(`[data-node="${id}"]`)
  if (el === null) throw new Error(`no node ${id}`)
  return el
}
const readout = (container: HTMLElement, id: string): string => node(container, id).querySelector(`[data-readout="${id}"]`)?.textContent ?? ''
const chip = (container: HTMLElement): string | null => container.querySelector('.ca-do-chip .ca-tex')?.getAttribute('data-text') ?? null
const button = (container: HTMLElement, name: string): HTMLButtonElement => within(container).getByRole('button', { name }) as HTMLButtonElement

const nervous = lessonModel('m00-firing-squad-nervous')
const steps = [
  { label: '第 1 步：看到 A 沒開槍', observed: { A: 0 } },
  { label: '第 2 步：攔住 A', interventions: { A: 0 } },
]

describe('step buttons (presets with observed and hold)', () => {
  it('an observed preset observes on a probability graph and shows as pressed', () => {
    const { container } = render(<CausalPlayground doc={nervous} presets={steps} />)
    const first = button(container, '第 1 步：看到 A 沒開槍')
    expect(first.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(first)
    expect(node(container, 'A').getAttribute('data-observed')).toBe('0')
    expect(node(container, 'A').getAttribute('data-intervened')).toBe('false')
    expect(chip(container)).toBe('A=0')
    // P(D=1 | A=0) = 0: A=0 means no order, so B did not shoot either.
    expect(readout(container, 'D')).toBe('0.00')
    expect(first.getAttribute('aria-pressed')).toBe('true')

    const second = button(container, '第 2 步：攔住 A')
    fireEvent.click(second)
    expect(node(container, 'A').getAttribute('data-intervened')).toBe('true')
    expect(node(container, 'A').getAttribute('data-observed')).toBeNull()
    expect(chip(container)).toBe('do(A=0)')
    expect(readout(container, 'D')).toBe('0.70')
    expect(second.getAttribute('aria-pressed')).toBe('true')
    expect(first.getAttribute('aria-pressed')).toBe('false')

    // The reader's own click after a step adds to it: the step still holds, so it stays pressed.
    fireEvent.click(node(container, 'C'))
    expect(second.getAttribute('aria-pressed')).toBe('true')
  })

  it('UATSB-F018: the step row sits inside the figure frame, under the graph', () => {
    const { container } = render(<CausalPlayground doc={nervous} presets={steps} />)
    const row = container.querySelector('.ca-presets')
    expect(row?.closest('.ca-panel')).not.toBeNull()
    expect(row?.closest('.ca-graph-box')).not.toBeNull()
  })

  it('a hold preset draws the held variables in the amber hull, set at their values', () => {
    const { container } = render(
      <CausalPlayground caseId="forest-fire-disjunctive" presets={[{ label: 'witness', interventions: { L: 0 }, hold: { MD: 0 } }]} />,
    )
    fireEvent.click(button(container, 'witness'))
    expect(container.querySelector('.ca-witness')?.getAttribute('data-witness')).toBe('MD')
    expect(node(container, 'MD').getAttribute('data-value')).toBe('0')
    expect(node(container, 'L').getAttribute('data-value')).toBe('0')
    expect(node(container, 'FF').getAttribute('data-value')).toBe('0')
    expect(button(container, 'witness').getAttribute('aria-pressed')).toBe('true')
    // Releasing the held variable drops it from the hull.
    fireEvent.click(node(container, 'MD'))
    fireEvent.click(node(container, 'MD'))
    expect(container.querySelector('.ca-witness')).toBeNull()
  })

  it('an observed preset on a graph with values fails fast', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<CausalPlayground caseId="forest-fire-disjunctive" presets={[{ label: 'x', observed: { L: 1 } }]} />)).toThrow(/observed/)
    spy.mockRestore()
  })
})

describe('right-click intervenes on a probability graph', () => {
  it('a mouse right-click intervenes like a long press, and opens the slider', () => {
    const { container } = render(<CausalPlayground doc={nervous} />)
    const a = node(container, 'A')
    fireEvent.pointerDown(a, { button: 2, pointerType: 'mouse', pointerId: 1 })
    const allowed = fireEvent.contextMenu(a, { button: 2 })
    expect(allowed).toBe(false)
    expect(node(container, 'A').getAttribute('data-intervened')).toBe('true')
    expect(container.querySelector('.ca-do-pop')).not.toBeNull()
    expect(chip(container)).toBe('do(A=1)')
  })

  it('a touch long press intervenes once, though Android also sends contextmenu', () => {
    vi.useFakeTimers()
    const { container } = render(<CausalPlayground doc={nervous} />)
    const a = node(container, 'A')
    fireEvent.pointerDown(a, { button: 0, pointerType: 'touch', pointerId: 1 })
    act(() => {
      vi.advanceTimersByTime(600)
    })
    fireEvent.contextMenu(a, { pointerType: 'touch' })
    fireEvent.pointerUp(a, { button: 0, pointerType: 'touch', pointerId: 1 })
    fireEvent.click(a)
    expect(node(container, 'A').getAttribute('data-intervened')).toBe('true')
    // A second intervention would have closed the slider again.
    expect(container.querySelector('.ca-do-pop')).not.toBeNull()
    expect(chip(container)).toBe('do(A=1)')
  })

  it('a graph with values keeps the browser menu', () => {
    const { container } = render(<CausalPlayground caseId="forest-fire-disjunctive" />)
    const l = node(container, 'L')
    fireEvent.pointerDown(l, { button: 2, pointerType: 'mouse', pointerId: 1 })
    expect(fireEvent.contextMenu(l, { button: 2 })).toBe(true)
    expect(node(container, 'L').getAttribute('data-intervened')).toBe('false')
  })
})

describe('the hint under the graph', () => {
  it('is one short line; the details sit in a tooltip reachable by focus', () => {
    const { container } = render(<CausalPlayground doc={nervous} />)
    const hint = container.querySelector('.ca-hint')
    expect(hint?.textContent?.startsWith('點一下節點是觀察；長按、右鍵或 Shift＋點是干預。')).toBe(true)
    const trigger = hint?.querySelector('[aria-describedby]')
    if (!(trigger instanceof HTMLElement)) throw new Error('no tooltip trigger')
    const tip = container.querySelector(`#${CSS.escape(trigger.getAttribute('aria-describedby') ?? '')}`)
    expect(tip?.getAttribute('role')).toBe('tooltip')
    expect(tip?.textContent).toMatch(/滑桿/)
    expect(tip?.hasAttribute('hidden')).toBe(true)
    fireEvent.focus(trigger)
    expect(tip?.hasAttribute('hidden')).toBe(false)
    fireEvent.keyDown(trigger, { key: 'Escape' })
    expect(tip?.hasAttribute('hidden')).toBe(true)
    // A tap opens it too.
    fireEvent.click(trigger)
    expect(tip?.hasAttribute('hidden')).toBe(false)
  })

  it('says a click intervenes on a graph with values, in one line', () => {
    const { container } = render(<CausalPlayground caseId="forest-fire-disjunctive" />)
    expect(container.querySelector('.ca-hint')?.textContent?.startsWith('點一下節點是干預。')).toBe(true)
  })

  it('a step stays pressed when the reader sets more on top of it', () => {
    const chain = lessonModel('m02-chain')
    const known = [
      { label: '第 1 步：不知道 Z' },
      { label: '第 2 步：已知 Z', observed: { Z: 1 } },
    ]
    const { container } = render(<CausalPlayground doc={chain} presets={known} />)
    const first = button(container, '第 1 步：不知道 Z')
    const second = button(container, '第 2 步：已知 Z')
    expect(first.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(second)
    expect(second.getAttribute('aria-pressed')).toBe('true')
    expect(first.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(node(container, 'X'))
    expect(chip(container)).toContain('Z=1')
    expect(second.getAttribute('aria-pressed')).toBe('true')
    expect(first.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(node(container, 'Z'))
    expect(second.getAttribute('aria-pressed')).toBe('false')
  })
})
