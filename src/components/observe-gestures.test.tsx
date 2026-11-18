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
})
