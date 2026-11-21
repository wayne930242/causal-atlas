// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModelDoc } from '../../data/schema.ts'
import { modelDocSchema } from '../../data/schema.ts'
import { CausalPlayground } from '../index.ts'
import { doNode, doProbability, observeNode, openMenu } from '../test-menu.ts'

afterEach(cleanup)

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

describe('a click on a node opens its menu', () => {
  it('opens beside the node, focused, with the node marked expanded; Esc closes it and gives the node its focus back', () => {
    const { container } = render(<CausalPlayground doc={collider} />)
    const x = node(container, 'X')
    expect(x.getAttribute('aria-haspopup')).toBe('dialog')
    expect(x.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(x)
    const menu = container.querySelector('[data-menu="X"]') as HTMLElement
    expect(menu.getAttribute('role')).toBe('dialog')
    expect(document.activeElement).toBe(menu)
    expect(node(container, 'X').getAttribute('aria-expanded')).toBe('true')
    fireEvent.keyDown(menu, { key: 'Escape' })
    expect(container.querySelector('[data-menu]')).toBeNull()
    expect(document.activeElement).toBe(node(container, 'X'))
  })

  it('Enter and Space open it too; a second click on the node, the ×, or a press outside closes it', () => {
    const { container } = render(<CausalPlayground doc={collider} />)
    fireEvent.keyDown(node(container, 'Y'), { key: 'Enter' })
    expect(container.querySelector('[data-menu="Y"]')).not.toBeNull()
    fireEvent.click(node(container, 'Y'))
    expect(container.querySelector('[data-menu]')).toBeNull()
    fireEvent.keyDown(node(container, 'Y'), { key: ' ' })
    fireEvent.click(container.querySelector('.ca-node-menu-close') as Element)
    expect(container.querySelector('[data-menu]')).toBeNull()
    fireEvent.click(node(container, 'Z'))
    // Another node's click moves the menu there.
    fireEvent.click(node(container, 'X'))
    expect(container.querySelector('[data-menu]')?.getAttribute('data-menu')).toBe('X')
    fireEvent.pointerDown(document.body)
    expect(container.querySelector('[data-menu]')).toBeNull()
  })

  it('binds nothing to a right-click or a long press: the browser keeps its menu', () => {
    const { container } = render(<CausalPlayground doc={collider} />)
    const x = node(container, 'X')
    fireEvent.pointerDown(x, { button: 2, pointerType: 'mouse', pointerId: 1 })
    expect(fireEvent.contextMenu(x, { button: 2 })).toBe(true)
    fireEvent.pointerDown(x, { button: 0, pointerType: 'touch', pointerId: 2 })
    expect(fireEvent.contextMenu(x, { pointerType: 'touch' })).toBe(true)
    expect(container.querySelector('[data-menu]')).toBeNull()
    expect(x.getAttribute('data-intervened')).toBe('false')
  })

  it('says what the marks mean now: fill, double ring, red clamp', () => {
    const { container } = render(<CausalPlayground doc={collider} />)
    const notes = (): string[] => [...container.querySelectorAll('.ca-node-menu-notes li')].map((li) => li.textContent ?? '')
    openMenu(container, 'Z')
    expect(notes()).toEqual(['填色高度：P(Z=1) = 0.75'])
    observeNode(container, 'Z', '1')
    expect(notes()).toEqual(['雙圈：已觀察到 Z=1，圖上其他機率都以它為條件'])
    doNode(container, 'Z', '0')
    expect(notes()).toEqual(['紅色夾子：do(Z=0)，剪掉進入它的箭頭'])
  })
})

describe('probability graph: the menu observes and intervenes', () => {
  it('shows explaining away on a collider: P(Y=1) 0.50 → 0.67 given Z=1 → 0.50 given X=1 too', () => {
    const { container } = render(<CausalPlayground doc={collider} />)
    expect(readout(container, 'Y')).toBe('0.50')

    observeNode(container, 'Z', '1')
    expect(observedAs(container, 'Z')).toBe('1')
    expect(node(container, 'Z').getAttribute('data-intervened')).toBe('false')
    expect(readout(container, 'Y')).toBe('0.67')
    // No arrow is cut by an observation.
    expect(container.querySelector('[data-state="cut"]')).toBeNull()

    observeNode(container, 'X', '1')
    expect(observedAs(container, 'X')).toBe('1')
    expect(readout(container, 'Y')).toBe('0.50')
    expect(chip(container)).toBe('Z=1, X=1')
  })

  it('observes at 1, at 0, and no longer, the pressed button following', () => {
    const { container } = render(<CausalPlayground doc={collider} />)
    const pressed = (): string[] => [...openMenu(container, 'X').querySelectorAll('[aria-pressed="true"]')].map((b) => b.textContent ?? '')
    const unobserve = (): HTMLButtonElement => openMenu(container, 'X').querySelector('[data-observe=""]') as HTMLButtonElement
    expect(unobserve().disabled).toBe(true)
    observeNode(container, 'X', '1')
    expect(observedAs(container, 'X')).toBe('1')
    expect(pressed()).toEqual(['X=1'])
    observeNode(container, 'X', '0')
    expect(observedAs(container, 'X')).toBe('0')
    expect(pressed()).toEqual(['X=0'])
    observeNode(container, 'X')
    expect(observedAs(container, 'X')).toBeNull()
    expect(chip(container)).toBeNull()
  })

  it('do(Z=1) cuts the arrows into Z, and the P*(Z=1) slider sets a probability between', () => {
    const { container } = render(<CausalPlayground doc={collider} />)
    doNode(container, 'Z', '1')
    expect(node(container, 'Z').getAttribute('data-intervened')).toBe('true')
    expect(observedAs(container, 'Z')).toBeNull()
    expect(chip(container)).toBe('do(Z=1)')
    // do(Z) cuts X → Z and Y → Z: Y stays a fair coin.
    expect(container.querySelectorAll('[data-state="cut"]').length).toBe(2)
    expect(readout(container, 'Y')).toBe('0.50')
    doProbability(container, 'Z', 0.3)
    expect(node(container, 'Z').getAttribute('data-do-p')).toBe('0.30')
    doNode(container, 'Z')
    expect(node(container, 'Z').getAttribute('data-intervened')).toBe('false')
    expect(chip(container)).toBeNull()
  })

  it('observes in the intervened model: P(Y=1 | do(X=1), Z=1) = 0.50', () => {
    const { container } = render(<CausalPlayground doc={collider} />)
    observeNode(container, 'Z', '1')
    expect(readout(container, 'Y')).toBe('0.67')
    doNode(container, 'X', '1')
    expect(node(container, 'X').getAttribute('data-intervened')).toBe('true')
    expect(observedAs(container, 'Z')).toBe('1')
    expect(readout(container, 'Y')).toBe('0.50')
    expect(chip(container)).toBe('do(X=1), Z=1')
  })

  it('observing an intervened node turns it into an observation, and do() on an observed one drops the observation', () => {
    const { container } = render(<CausalPlayground doc={collider} />)
    doNode(container, 'X', '1')
    observeNode(container, 'X', '1')
    expect(node(container, 'X').getAttribute('data-intervened')).toBe('false')
    expect(observedAs(container, 'X')).toBe('1')
    doNode(container, 'X', '0')
    expect(node(container, 'X').getAttribute('data-intervened')).toBe('true')
    expect(observedAs(container, 'X')).toBeNull()
  })

  it('refuses an observation that cannot happen, and says why', () => {
    const { container } = render(<CausalPlayground doc={collider} />)
    doNode(container, 'X', '1')
    observeNode(container, 'Z', '1')
    expect(observedAs(container, 'Z')).toBe('1')
    // Under do(X=1), Z is always 1: observing Z=0 has probability 0.
    observeNode(container, 'Z', '0')
    expect(observedAs(container, 'Z')).toBe('1')
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Z=0')
  })

  it('closes when 回到原本的機率 is pressed', () => {
    const { container } = render(<CausalPlayground doc={collider} />)
    doNode(container, 'X', '1')
    expect(chip(container)).toBe('do(X=1)')
    const reset = [...container.querySelectorAll('button')].find((b) => b.textContent === '回到原本的機率') as HTMLButtonElement
    fireEvent.pointerDown(reset)
    fireEvent.click(reset)
    expect(chip(container)).toBeNull()
    expect(container.querySelector('[data-menu]')).toBeNull()
  })
})

describe('graph of one actual world: the menu intervenes', () => {
  it('sets do() at either value and releases; observing is not offered', () => {
    const { container } = render(<CausalPlayground doc={colliderWorld} />)
    expect(node(container, 'X').getAttribute('data-value')).toBe('1')
    const menu = openMenu(container, 'X')
    expect(menu.querySelector('[data-observe]')).toBeNull()
    expect(menu.textContent).toContain('所有值都已知，觀察不會改變任何值。')

    doNode(container, 'X', '1')
    expect(node(container, 'X').getAttribute('data-intervened')).toBe('true')
    expect(chip(container)).toBe('do(X=1)')

    doNode(container, 'X', '0')
    expect(node(container, 'X').getAttribute('data-value')).toBe('0')
    expect(chip(container)).toBe('do(X=0)')
    expect(node(container, 'Z').getAttribute('data-value')).toBe('0')

    doNode(container, 'X')
    expect(node(container, 'X').getAttribute('data-intervened')).toBe('false')
    expect(chip(container)).toBeNull()
  })

  it('after do(C=0), do(B=1) and do(B=0) (early preemption)', () => {
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
    doNode(container, 'C', '0')
    expect(chip(container)).toBe('do(C=0)')
    expect(node(container, 'B').getAttribute('data-value')).toBe('1')
    doNode(container, 'B', '1')
    expect(chip(container)).toBe('do(C=0, B=1)')
    doNode(container, 'B', '0')
    expect(chip(container)).toBe('do(C=0, B=0)')
    expect(node(container, 'E').getAttribute('data-value')).toBe('0')
    doNode(container, 'B')
    expect(chip(container)).toBe('do(C=0)')
  })
})

describe('probability graph: a multi-valued node', () => {
  it('observes each value and no longer: P(M=1 | A=one) = 1, P(M=1 | A=two) = 0, P(M=1) = 0.5', () => {
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
    observeNode(container, 'A', 'one')
    expect(observedAs(container, 'A')).toBe('one')
    expect(readout(container, 'M')).toBe('1.00')
    observeNode(container, 'A', 'two')
    expect(observedAs(container, 'A')).toBe('two')
    expect(readout(container, 'M')).toBe('0.00')
    observeNode(container, 'A')
    expect(observedAs(container, 'A')).toBeNull()
    expect(readout(container, 'M')).toBe('0.50')
    // A multi-valued node has no P* slider: do() picks a value.
    expect(openMenu(container, 'A').querySelector('[data-do-slider]')).toBeNull()
    doNode(container, 'A', 'two')
    expect(chip(container)).toBe('do(A=two)')
  })
})

describe('exogenous nodes are the context, not do() targets', () => {
  it('a click on U in the firing squad (one actual world) opens nothing', () => {
    const { container } = render(<CausalPlayground caseId="firing-squad" />)
    const u = node(container, 'U')
    expect(u.getAttribute('role')).toBe('img')
    fireEvent.click(u)
    fireEvent.keyDown(u, { key: 'Enter' })
    expect(container.querySelector('[data-menu]')).toBeNull()
    expect(chip(container)).toBeNull()
  })

  it('in probability mode U_X can be observed, and its menu offers no do()', () => {
    const doc = modelDocSchema.parse({ ...collider, show_exogenous: ['U_X'] })
    const { container } = render(<CausalPlayground doc={doc} />)
    const menu = openMenu(container, 'U_X')
    expect(menu.querySelector('[data-do]')).toBeNull()
    expect(menu.textContent).toContain('外生變項是背景條件，只能觀察，不能干預。')
    expect(menu.getAttribute('aria-label')).toMatch(/：觀察$/)
    expect(node(container, 'U_X').getAttribute('aria-label')).toContain('按一下打開選單，可以觀察')
    expect(node(container, 'U_X').getAttribute('aria-label')).not.toContain('干預')
    observeNode(container, 'U_X', '1')
    expect(observedAs(container, 'U_X')).toBe('1')
    expect(node(container, 'U_X').getAttribute('aria-label')).toContain('按一下打開選單')
  })
})

describe('marked edges explain themselves', () => {
  it('an edge on a d-separation path shows its tip on hover and on a tap; a cut edge says so', () => {
    const doc = modelDocSchema.parse({ ...collider, priors: { independent: { U_X: 0.5, U_Y: 0.5 } } })
    const { container } = render(<CausalPlayground doc={doc} dsep={['X', 'Y']} />)
    const edge = container.querySelector('[data-edge="X>Z"]') as Element
    expect(edge.getAttribute('tabindex')).toBe('0')
    expect(edge.getAttribute('aria-label')).toBe('虛線：路徑 X → Z ← Y 在 Z 被堵住。Z 是對撞點，Z 未知，也沒有後代。')
    fireEvent.pointerEnter(edge, { pointerType: 'mouse' })
    expect(container.querySelector('[data-edge-tip="X>Z"]')?.textContent).toBe('虛線：路徑 X → Z ← Y 在 Z 被堵住。Z 是對撞點，Z 未知，也沒有後代。')
    fireEvent.pointerLeave(edge, { pointerType: 'mouse' })
    expect(container.querySelector('[data-edge-tip]')).toBeNull()
    // A tap (no hover on touch) toggles it; a press elsewhere hides it.
    fireEvent.pointerEnter(edge, { pointerType: 'touch' })
    expect(container.querySelector('[data-edge-tip]')).toBeNull()
    fireEvent.click(edge)
    expect(container.querySelector('[data-edge-tip="X>Z"]')).not.toBeNull()
    fireEvent.pointerDown(document.body)
    expect(container.querySelector('[data-edge-tip]')).toBeNull()
    observeNode(container, 'Z', '1')
    expect(container.querySelector('[data-edge="X>Z"]')?.getAttribute('aria-label')).toBe('紅色粗線：路徑 X → Z ← Y 暢通。對撞點 Z 已知。')
    doNode(container, 'Z', '1')
    expect(container.querySelector('[data-edge="X>Z"]')?.getAttribute('aria-label')).toBe('灰色虛線加斜槓：do() 剪掉了 X → Z，Z 的值不再由 X 決定')
  })

  it('a real tap (press, focus, click) toggles the tip; a mouse click on a hovered edge keeps it', () => {
    // A press focuses the edge before its click, and that focus is not :focus-visible.
    const matches = Element.prototype.matches
    const spy = vi.spyOn(Element.prototype, 'matches').mockImplementation(function (this: Element, sel: string) {
      return sel === ':focus-visible' ? false : matches.call(this, sel)
    })
    const { container } = render(<CausalPlayground doc={collider} dsep={['X', 'Y']} />)
    const edge = container.querySelector('[data-edge="X>Z"]') as SVGGElement
    const tap = (): void => {
      fireEvent.pointerDown(edge, { pointerType: 'touch' })
      edge.focus()
      fireEvent.click(edge)
    }
    tap()
    expect(container.querySelector('[data-edge-tip="X>Z"]')).not.toBeNull()
    tap()
    expect(container.querySelector('[data-edge-tip]')).toBeNull()
    edge.blur()
    fireEvent.pointerEnter(edge, { pointerType: 'mouse' })
    fireEvent.pointerDown(edge, { pointerType: 'mouse' })
    edge.focus()
    fireEvent.click(edge)
    expect(container.querySelector('[data-edge-tip="X>Z"]')).not.toBeNull()
    spy.mockRestore()
  })

  it("a press on another graph's node closes this graph's menu", () => {
    const { container } = render(
      <>
        <div data-a><CausalPlayground doc={collider} /></div>
        <div data-b><CausalPlayground doc={collider} /></div>
      </>,
    )
    const a = container.querySelector('[data-a]') as HTMLElement
    const b = container.querySelector('[data-b]') as HTMLElement
    fireEvent.click(a.querySelector('[data-node="Z"]') as Element)
    expect(a.querySelector('[data-menu="Z"]')).not.toBeNull()
    fireEvent.pointerDown(b.querySelector('[data-node="X"]') as Element)
    expect(a.querySelector('[data-menu]')).toBeNull()
  })

  it('a plain edge has no tip and takes no focus', () => {
    const { container } = render(<CausalPlayground doc={collider} />)
    expect(container.querySelector('[data-edge="X>Z"]')?.hasAttribute('tabindex')).toBe(false)
  })
})
