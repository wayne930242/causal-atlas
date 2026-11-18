// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModelDoc } from '../data/schema.ts'
import { modelDocSchema } from '../data/schema.ts'
import { CausalPlayground } from './index.ts'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const boolVar = (id: string, kind: 'exogenous' | 'endogenous') => ({
  id,
  label: { 'zh-TW': id, en: id },
  kind,
  domain: 'boolean',
})

/** A collider X → Z ← Y: X and Y are fair coins, Z = X or Y. */
const colliderSpec = {
  format: 'causal-atlas/model',
  version: 1,
  title: 'Collider',
  model: {
    variables: [boolVar('U_X', 'exogenous'), boolVar('U_Y', 'exogenous'), boolVar('X', 'endogenous'), boolVar('Y', 'endogenous'), boolVar('Z', 'endogenous')],
    equations: { X: 'U_X', Y: 'U_Y', Z: 'X or Y' },
  },
}
const collider: ModelDoc = modelDocSchema.parse({ ...colliderSpec, priors: { independent: { U_X: 0.5, U_Y: 0.5 } } })
/** The same collider in one actual world: X=1, Y=0, so Z=1. */
const colliderWorld: ModelDoc = modelDocSchema.parse({ ...colliderSpec, context: { U_X: 1, U_Y: 0 } })

const node = (container: HTMLElement, id: string): Element => {
  const el = container.querySelector(`[data-node="${id}"]`)
  if (el === null) throw new Error(`no node ${id}`)
  return el
}
const readout = (container: HTMLElement, id: string): string => node(container, id).querySelector(`[data-readout="${id}"]`)?.textContent ?? ''
const chip = (container: HTMLElement): string | null => container.querySelector('.ca-do-chip .ca-tex')?.getAttribute('data-text') ?? null
const observedAs = (container: HTMLElement, id: string): string | null => node(container, id).getAttribute('data-observed')

describe('probability graph: a click observes', () => {
  it('shows explaining away on a collider: P(Y=1) 0.50 → 0.67 given Z=1 → 0.50 given X=1 too', () => {
    const { container } = render(<CausalPlayground doc={collider} />)
    expect(readout(container, 'Y')).toBe('0.50')

    fireEvent.click(node(container, 'Z'))
    expect(observedAs(container, 'Z')).toBe('1')
    expect(node(container, 'Z').getAttribute('data-intervened')).toBe('false')
    expect(readout(container, 'Y')).toBe('0.67')
    // No arrow is cut by an observation.
    expect(container.querySelector('[data-state="cut"]')).toBeNull()

    fireEvent.click(node(container, 'X'))
    expect(observedAs(container, 'X')).toBe('1')
    expect(readout(container, 'Y')).toBe('0.50')
    expect(chip(container)).toBe('Z=1, X=1')
  })

  it('cycles an observed node =1 → =0 → released', () => {
    const { container } = render(<CausalPlayground doc={collider} />)
    fireEvent.click(node(container, 'X'))
    expect(observedAs(container, 'X')).toBe('1')
    fireEvent.click(node(container, 'X'))
    expect(observedAs(container, 'X')).toBe('0')
    fireEvent.click(node(container, 'X'))
    expect(observedAs(container, 'X')).toBeNull()
    expect(chip(container)).toBeNull()
  })

  it('Shift+click intervenes at once, do(X=1), and opens the P*(X=1) slider', () => {
    const { container } = render(<CausalPlayground doc={collider} />)
    fireEvent.click(node(container, 'Z'), { shiftKey: true })
    expect(node(container, 'Z').getAttribute('data-intervened')).toBe('true')
    expect(observedAs(container, 'Z')).toBeNull()
    expect(container.querySelector('.ca-do-pop')).not.toBeNull()
    expect(chip(container)).toBe('do(Z=1)')
    // do(Z) cuts X → Z and Y → Z: Y stays a fair coin.
    expect(container.querySelectorAll('[data-state="cut"]').length).toBe(2)
    expect(readout(container, 'Y')).toBe('0.50')
  })

  it('a long press intervenes, and the click that follows it does not observe', () => {
    vi.useFakeTimers()
    const { container } = render(<CausalPlayground doc={collider} />)
    const x = node(container, 'X')
    fireEvent.pointerDown(x, { button: 0, pointerId: 1 })
    expect(x.getAttribute('data-pressing')).toBe('true')
    act(() => {
      vi.advanceTimersByTime(600)
    })
    fireEvent.pointerUp(x, { button: 0, pointerId: 1 })
    fireEvent.click(x)
    expect(node(container, 'X').getAttribute('data-intervened')).toBe('true')
    expect(observedAs(container, 'X')).toBeNull()
  })

  it('Shift+Enter intervenes, Enter observes', () => {
    const { container } = render(<CausalPlayground doc={collider} />)
    fireEvent.keyDown(node(container, 'X'), { key: 'Enter', shiftKey: true })
    expect(node(container, 'X').getAttribute('data-intervened')).toBe('true')
    fireEvent.keyDown(node(container, 'Y'), { key: 'Enter' })
    expect(observedAs(container, 'Y')).toBe('1')
  })

  it('observes in the intervened model: P(Y=1 | do(X=1), Z=1) = 0.50', () => {
    const { container } = render(<CausalPlayground doc={collider} />)
    fireEvent.click(node(container, 'Z'))
    expect(readout(container, 'Y')).toBe('0.67')
    fireEvent.click(node(container, 'X'), { shiftKey: true })
    expect(node(container, 'X').getAttribute('data-intervened')).toBe('true')
    expect(observedAs(container, 'Z')).toBe('1')
    expect(readout(container, 'Y')).toBe('0.50')
    expect(chip(container)).toBe('do(X=1), Z=1')
  })

  it('a click on an intervened node turns it into an observation of the same value', () => {
    const { container } = render(<CausalPlayground doc={collider} />)
    fireEvent.click(node(container, 'X'), { shiftKey: true })
    fireEvent.click(node(container, 'X'))
    expect(node(container, 'X').getAttribute('data-intervened')).toBe('false')
    expect(observedAs(container, 'X')).toBe('1')
  })

  it('refuses an observation that cannot happen, and says why', () => {
    const { container } = render(<CausalPlayground doc={collider} />)
    fireEvent.click(node(container, 'X'), { shiftKey: true })
    fireEvent.click(node(container, 'Z'))
    expect(observedAs(container, 'Z')).toBe('1')
    // Under do(X=1), Z is always 1: observing Z=0 has probability 0.
    fireEvent.click(node(container, 'Z'))
    expect(observedAs(container, 'Z')).toBe('1')
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Z=0')
  })
})

describe('graph of one actual world: a click intervenes', () => {
  it('pins the current value first, then flips it, then releases', () => {
    const { container } = render(<CausalPlayground doc={colliderWorld} />)
    expect(node(container, 'X').getAttribute('data-value')).toBe('1')

    fireEvent.click(node(container, 'X'))
    expect(node(container, 'X').getAttribute('data-intervened')).toBe('true')
    expect(node(container, 'X').getAttribute('data-value')).toBe('1')
    expect(chip(container)).toBe('do(X=1)')

    fireEvent.click(node(container, 'X'))
    expect(node(container, 'X').getAttribute('data-value')).toBe('0')
    expect(chip(container)).toBe('do(X=0)')
    expect(node(container, 'Z').getAttribute('data-value')).toBe('0')

    fireEvent.click(node(container, 'X'))
    expect(node(container, 'X').getAttribute('data-intervened')).toBe('false')
    expect(chip(container)).toBeNull()
  })

  it('after do(C=0) pins B at the value it shows (1), then 0, then releases (early preemption)', () => {
    const doc = modelDocSchema.parse({
      format: 'causal-atlas/model',
      version: 1,
      title: 'Early preemption',
      model: {
        variables: [boolVar('U_C', 'exogenous'), boolVar('U_A', 'exogenous'), boolVar('C', 'endogenous'), boolVar('B', 'endogenous'), boolVar('E', 'endogenous')],
        equations: { C: 'U_C', B: 'U_A and not C', E: 'C or B' },
      },
      context: { U_C: 1, U_A: 1 },
    })
    const { container } = render(<CausalPlayground doc={doc} />)
    fireEvent.click(node(container, 'C'))
    fireEvent.click(node(container, 'C'))
    expect(chip(container)).toBe('do(C=0)')
    expect(node(container, 'B').getAttribute('data-value')).toBe('1')

    fireEvent.click(node(container, 'B'))
    expect(chip(container)).toBe('do(C=0, B=1)')
    fireEvent.click(node(container, 'B'))
    expect(chip(container)).toBe('do(C=0, B=0)')
    expect(node(container, 'E').getAttribute('data-value')).toBe('0')
    fireEvent.click(node(container, 'B'))
    expect(chip(container)).toBe('do(C=0)')
  })
})

describe('probability graph: a click observes a multi-valued node', () => {
  it('cycles its values, then releases: P(M=1 | A=one) = 1, P(M=1 | A=two) = 0, P(M=1) = 0.5', () => {
    const doc = modelDocSchema.parse({
      format: 'causal-atlas/model',
      version: 1,
      title: 'Newcomb-like',
      model: {
        variables: [
          { id: 'D', label: { 'zh-TW': 'D' }, kind: 'exogenous', domain: ['one', 'two'] },
          { id: 'A', label: { 'zh-TW': 'A' }, kind: 'endogenous', domain: ['one', 'two'] },
          boolVar('M', 'endogenous'),
        ],
        equations: { A: 'D', M: "D = 'one'" },
      },
      priors: { independent: { D: [['one', 0.5], ['two', 0.5]] } },
    })
    const { container } = render(<CausalPlayground doc={doc} />)
    expect(readout(container, 'M')).toBe('0.50')
    fireEvent.click(node(container, 'A'))
    expect(observedAs(container, 'A')).toBe('one')
    expect(readout(container, 'M')).toBe('1.00')
    fireEvent.click(node(container, 'A'))
    expect(observedAs(container, 'A')).toBe('two')
    expect(readout(container, 'M')).toBe('0.00')
    fireEvent.click(node(container, 'A'))
    expect(observedAs(container, 'A')).toBeNull()
    expect(readout(container, 'M')).toBe('0.50')
  })
})

describe('exogenous nodes are the context, not do() targets', () => {
  it('a click on U in the firing squad sets nothing', () => {
    const { container } = render(<CausalPlayground caseId="firing-squad" />)
    const u = node(container, 'U')
    expect(u.getAttribute('role')).toBe('img')
    fireEvent.click(u)
    fireEvent.keyDown(u, { key: 'Enter' })
    expect(chip(container)).toBeNull()
    expect(u.getAttribute('data-intervened')).toBe('false')
  })

  it('in probability mode U_X is observed by a click, and Shift+click does not intervene', () => {
    const doc = modelDocSchema.parse({ ...collider, show_exogenous: ['U_X'] })
    const { container } = render(<CausalPlayground doc={doc} />)
    fireEvent.click(node(container, 'U_X'), { shiftKey: true })
    expect(chip(container)).toBeNull()
    fireEvent.click(node(container, 'U_X'))
    expect(observedAs(container, 'U_X')).toBe('1')
    expect(node(container, 'U_X').getAttribute('aria-label')).not.toContain('干預')
  })
})


describe('the do() popover', () => {
  it('closes when 回到原本的機率 is pressed from the keyboard', () => {
    const { container } = render(<CausalPlayground doc={collider} />)
    fireEvent.keyDown(node(container, 'X'), { key: 'Enter', shiftKey: true })
    expect(chip(container)).toBe('do(X=1)')
    expect(container.querySelector('.ca-do-pop')).not.toBeNull()
    const reset = [...container.querySelectorAll('button')].find((b) => b.textContent === '回到原本的機率') as HTMLButtonElement
    fireEvent.keyDown(reset, { key: 'Enter' })
    fireEvent.click(reset)
    expect(chip(container)).toBeNull()
    expect(container.querySelector('.ca-do-pop')).toBeNull()
  })
})
