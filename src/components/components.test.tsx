// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CasePage, CausalPlayground, ProbabilityPanel, WorldLanes } from './index.ts'
import { doNode } from './test-menu.ts'

afterEach(cleanup)

function node(container: HTMLElement, id: string): Element {
  const el = container.querySelector(`[data-node="${id}"]`)
  if (el === null) throw new Error(`no node ${id}`)
  return el
}

function edge(container: HTMLElement, key: string): Element {
  const el = container.querySelector(`[data-edge="${key}"]`)
  if (el === null) throw new Error(`no edge ${key}`)
  return el
}

describe('CausalPlayground', () => {
  it('sets do() on a node from its menu: cuts its incoming edge, recomputes downstream, releases', () => {
    const { container } = render(<CausalPlayground caseId="rock-throwing" />)
    expect(node(container, 'SH').getAttribute('data-value')).toBe('1')
    expect(node(container, 'BH').getAttribute('data-value')).toBe('0')
    expect(edge(container, 'ST>SH').getAttribute('data-state')).toBe('live')

    // do(SH=1) at its current value: the edge is cut, nothing downstream changes.
    doNode(container, 'SH', '1')
    expect(node(container, 'SH').getAttribute('data-intervened')).toBe('true')
    expect(node(container, 'SH').getAttribute('data-value')).toBe('1')
    expect(edge(container, 'ST>SH').getAttribute('data-state')).toBe('cut')
    expect(node(container, 'BH').getAttribute('data-value')).toBe('0')
    expect(container.querySelector('.ca-do-chip .ca-tex')?.getAttribute('data-text')).toBe('do(SH=1)')

    doNode(container, 'SH', '0')
    expect(node(container, 'SH').getAttribute('data-intervened')).toBe('true')
    expect(node(container, 'SH').getAttribute('data-value')).toBe('0')
    expect(edge(container, 'ST>SH').getAttribute('data-state')).toBe('cut')
    expect(node(container, 'BH').getAttribute('data-value')).toBe('1')
    expect(node(container, 'BS').getAttribute('data-value')).toBe('1')
    expect(container.querySelector('.ca-do-chip .ca-tex')?.getAttribute('data-text')).toBe('do(SH=0)')

    // Keyboard: Esc closes the menu, Enter on the node opens it again, and 放開 releases it.
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.keyDown(screen.getByRole('button', { name: /^SH 小蘇擊中/ }), { key: 'Enter' })
    fireEvent.click(within(container.querySelector('[data-menu="SH"]') as HTMLElement).getByRole('button', { name: '放開' }))
    expect(node(container, 'SH').getAttribute('data-intervened')).toBe('false')
    expect(edge(container, 'ST>SH').getAttribute('data-state')).toBe('live')
    expect(node(container, 'BH').getAttribute('data-value')).toBe('0')
  })

  it('switches the equations between notations', () => {
    const { container } = render(<CausalPlayground caseId="rock-throwing" />)
    const eqs = (): string =>
      [...container.querySelectorAll('.ca-eqs .ca-tex')].map((e) => e.getAttribute('data-text') ?? '').join('\n')
    // The equations start closed under the graph, still in the page.
    expect(screen.getByRole('button', { name: '式子' }).getAttribute('aria-expanded')).toBe('false')
    expect(eqs()).toContain('BH ↔ (BT ∧ ¬SH)')
    fireEvent.click(screen.getByRole('button', { name: '式子' }))
    fireEvent.click(screen.getByRole('button', { name: '數學式' }))
    expect(screen.getByRole('button', { name: '數學式' }).getAttribute('aria-pressed')).toBe('true')
    expect(eqs()).toContain('BH = BT·(1−SH)')
    expect(eqs()).toContain('= 1·(1−1) = 0')
    expect(eqs()).not.toContain('↔')
    fireEvent.click(screen.getByRole('button', { name: '干預式' }))
    // The actual world's row of each variable; the full table is behind the expander.
    expect(eqs()).toContain('[BT←1, SH←1](BH=0)')
    expect(eqs()).not.toContain('[BT←1, SH←0](BH=1)')
    fireEvent.click(screen.getByRole('button', { name: /展開完整真值表/ }))
    expect(eqs()).toContain('[BT←1, SH←0](BH=1)')
  })
})

describe('CasePage', () => {
  it('reveals one thing per step: story, graph, do(), verdicts', () => {
    const { container } = render(<CasePage caseId="rock-throwing" />)
    const has = (selector: string): boolean => container.querySelector(selector) !== null
    expect(screen.getByLabelText('故事').textContent).toContain('小蘇')
    expect(has('.ca-graph')).toBe(false)
    expect(has('[data-reveal="explanation"]')).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: /畫成圖/ }))
    expect(has('.ca-graph')).toBe(true)
    expect(has('[data-reveal="explanation"]')).toBe(true)
    expect(container.querySelector('[data-world]')?.getAttribute('data-world')).toBe('actual')
    expect(has('[data-reveal="verdicts"]')).toBe(false)

    fireEvent.click(screen.getAllByRole('button', { name: /^干預/ }).find(b => b.classList.contains('ca-btn-primary'))!)
    expect(container.querySelector('[data-world]')?.getAttribute('data-world')).toBe('do')
    expect(node(container, 'ST').getAttribute('data-intervened')).toBe('true')
    expect(node(container, 'SH').getAttribute('data-value')).toBe('0')
    expect(has('[data-reveal="verdicts"]')).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: /定義評判/ }))
    const verdicts = container.querySelector('[data-reveal="verdicts"]') as HTMLElement
    expect(verdicts).not.toBeNull()
    expect(within(verdicts).getAllByText('簡單反事實').length).toBeGreaterThan(0)
    const more = within(verdicts).getByRole('button', { name: /HP 定義的三個條件/ })
    expect(more.getAttribute('aria-expanded')).toBe('false')
    expect(within(verdicts).queryByText('AC1')).toBeNull()
    fireEvent.click(more)
    expect(within(verdicts).getByText('AC1')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '上一步' }))
    expect(has('[data-reveal="verdicts"]')).toBe(false)
  })
})

describe('CasePage display fields', () => {
  it('shows the subtitle and tags story sentences with variable ids', () => {
    const { container } = render(<CasePage caseId="rock-throwing" />)
    expect(container.querySelector('.ca-subtitle')?.textContent).toBe('兩個人都丟了石頭，只有一顆砸中瓶子。')
    const tags = [...container.querySelectorAll('.ca-story-sentence')].map((s) =>
      [...s.querySelectorAll('.ca-story-tag')].map((t) => t.textContent).join(','),
    )
    expect(tags.slice(0, 3)).toEqual(['ST,BT', 'SH,BS', 'BH'])
  })

  it('puts the intuition first and marks theories that disagree with it', () => {
    const { container } = render(<CasePage caseId="rock-throwing" initialStep={4} />)
    const group = container.querySelector('.ca-verdict-group') as HTMLElement
    const rows = [...group.querySelectorAll('.ca-verdict')]
    expect(rows[0].getAttribute('data-theory')).toBe('intuition')
    expect(rows[0].textContent).toContain('小蘇的石頭砸中了瓶子')
    const mismatched = rows.filter((r) => r.getAttribute('data-mismatch') === 'true').map((r) => r.getAttribute('data-theory'))
    expect(mismatched).toEqual(['butfor'])
    expect(container.querySelector('[data-reveal="step-4"]')?.textContent).toContain('簡單反事實和直覺不一致')
  })

  it('draws a non-boolean node as one labelled bar per value, not a fill', () => {
    const { container } = render(<ProbabilityPanel caseId="newcomb" />)
    const a = container.querySelector('[data-node="A"]') as Element
    expect([...a.querySelectorAll('[data-bar]')].map((b) => b.getAttribute('data-bar'))).toEqual(['one', 'two'])
    expect(a.querySelector('[data-level]')).toBeNull()
    expect(container.textContent).toContain('多值變項每個值一根長條')
  })
})

describe('CasePage verdicts follow the sliders', () => {
  it('Newcomb at P(D=one)=0.1: P(M=1) 0.11, CDT 108000 against 109000', () => {
    const { container } = render(<CasePage caseId="newcomb" initialStep={4} />)
    const cdt = (): string => container.querySelector('.ca-decision-row[data-theory="cdt"]')?.textContent ?? ''
    expect(cdt()).toContain('500000')
    fireEvent.click(container.querySelector('button[data-tab="probabilities"]') as Element)
    const slider = container.querySelector('#ca-slider-newcomb-D') as HTMLInputElement
    fireEvent.change(slider, { target: { value: '0.1' } })
    expect(cdt()).toContain('108000')
    expect(cdt()).toContain('109000')
    const numbers = [...container.querySelectorAll('.ca-number-row strong')].map((n) => n.textContent)
    expect(numbers).toContain('0.11')
  })
})

describe('ProbabilityPanel', () => {
  it('recomputes P(V=1) when a slider moves', () => {
    const { container } = render(<ProbabilityPanel caseId="smoking-lesion" />)
    const level = (id: string): number => Number(node(container, id).querySelector('[data-level]')?.getAttribute('data-level'))
    expect(level('L')).toBeCloseTo(0.3)
    expect(level('S')).toBeCloseTo(0.38)
    fireEvent.change(screen.getByLabelText('病灶的機率'), { target: { value: '0.5' } })
    expect(level('L')).toBeCloseTo(0.5)
    expect(level('S')).toBeCloseTo(0.5)
    expect(level('C')).toBeCloseTo(0.35)
  })

  it('shows observing and intervening side by side', () => {
    const { container } = render(<ProbabilityPanel caseId="smoking-lesion" view="compare" />)
    const level = (side: string, id: string): number =>
      Number(container.querySelector(`[data-side="${side}"] [data-node="${id}"] [data-level]`)?.getAttribute('data-level'))
    expect(level('see', 'L')).toBeCloseTo(0.24 / 0.38)
    expect(level('do', 'L')).toBeCloseTo(0.3)
    expect(container.querySelector('[data-side="do"] [data-edge="L>S"]')?.getAttribute('data-state')).toBe('cut')
    expect(screen.getByTestId('see-value').textContent).toBe('0.42')
    expect(screen.getByTestId('do-value').textContent).toBe('0.25')
  })
})

describe('ProbabilityPanel captions', () => {
  const texts = (c: HTMLElement): string[] => [...c.querySelectorAll('.ca-compare-text')].map((n) => n.textContent ?? '')
  it('words a 0 observation as not having happened, in zh and en', () => {
    const zh = render(<ProbabilityPanel caseId="firing-squad" view="compare" />)
    expect(texts(zh.container)[0]).toContain('看到槍手 A 開槍沒有發生（A=0）')
    expect(texts(zh.container)[1]).toContain('讓槍手 A 開槍不發生（do(A=0)）')
    cleanup()
    const en = render(<ProbabilityPanel caseId="firing-squad" view="compare" locale="en" />)
    expect(texts(en.container)[0]).toContain('Seeing that “Rifleman A shoots” did not happen (A=0)')
    expect(texts(en.container)[1]).toContain('Making “Rifleman A shoots” not happen (do(A=0))')
  })
  it('words a 1 value as the event happening', () => {
    const pair = { event: 'D=1', observe: 'A=1', intervene: { A: 1 } }
    const zh = render(<ProbabilityPanel caseId="firing-squad" view="compare" pair={pair} />)
    expect(texts(zh.container)[0]).toContain('看到槍手 A 開槍（A=1）')
    expect(texts(zh.container)[1]).toContain('讓槍手 A 開槍（do(A=1)）')
    cleanup()
    const en = render(<ProbabilityPanel caseId="firing-squad" view="compare" pair={pair} locale="en" />)
    expect(texts(en.container)[0]).toContain('Seeing that “Rifleman A shoots” (A=1)')
    expect(texts(en.container)[1]).toContain('Making “Rifleman A shoots” (do(A=1))')
  })
})

describe('WorldLanes', () => {
  it('adds the counterfactual lane and a diff strip on the second step', () => {
    const { container } = render(<WorldLanes caseId="rock-throwing" interventions={{ SH: 0 }} actionLabel="攔下小蘇的石頭" />)
    expect(container.querySelectorAll('[data-lane]').length).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: /攔下小蘇的石頭/ }))
    expect(container.querySelectorAll('[data-lane]').length).toBe(2)
    expect(container.querySelector('[data-diff-cell="SH"]')?.getAttribute('data-diff-kind')).toBe('do')
    expect(container.querySelector('[data-diff-cell="BH"]')?.getAttribute('data-diff-kind')).toBe('recomputed')
    expect(container.querySelector('[data-diff-cell="BS"]')?.getAttribute('data-diff-kind')).toBe('same')
  })
})

describe('normality verdict wording', () => {
  it('gardener and Queen: no witness is at least as normal (the worlds are incomparable, not less normal)', () => {
    const { container } = render(<CasePage caseId="gardener-queen" initialStep={4} />)
    expect(container.textContent).toContain('能讓結果不發生的情況，沒有一個至少和實際世界一樣正常。')
    expect(container.textContent).not.toContain('更不尋常')
  })
})

describe('WorldLanes witness lane', () => {
  const laneText = (container: HTMLElement): string => container.querySelector('[data-lane="witness"]')?.textContent ?? ''

  it('says MD=0 is held at a value it does not have (forest fire, original HP)', () => {
    const { container } = render(
      <WorldLanes caseId="forest-fire-disjunctive" interventions={{ L: 0 }} witness={{ cause: 'L=1', effect: 'FF=1', theory: 'hp-original' }} initialStep={3} />,
    )
    expect(laneText(container)).toContain('MD=0 固定在非實際值')
    expect(laneText(container)).not.toContain('固定在實際值')
  })

  it('says BH=0 is held at its actual value (rock throwing)', () => {
    const { container } = render(<WorldLanes caseId="rock-throwing" witness={{ cause: 'ST=1', effect: 'BS=1' }} initialStep={3} />)
    expect(laneText(container)).toContain('BH=0 固定在實際值')
  })
})

describe('CasePage embedded', () => {
  it('frames itself with a caption when heading is off', () => {
    const { container } = render(<CasePage caseId="gardener-queen" heading={false} />)
    const root = container.querySelector('article.ca-case')
    expect(root?.classList.contains('is-embedded')).toBe(true)
    expect(container.querySelector('.ca-case-caption')?.textContent).toContain('園丁')
    expect(container.querySelector('.ca-case-head')).toBeNull()
  })
})
