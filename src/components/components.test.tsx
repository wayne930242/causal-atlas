// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CasePage, CausalPlayground, ProbabilityPanel, WorldLanes } from './index.ts'

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
  it('toggles do() on a node: cuts its incoming edge and recomputes downstream', () => {
    const { container } = render(<CausalPlayground caseId="rock-throwing" />)
    expect(node(container, 'SH').getAttribute('data-value')).toBe('1')
    expect(node(container, 'BH').getAttribute('data-value')).toBe('0')
    expect(edge(container, 'ST>SH').getAttribute('data-state')).toBe('live')

    fireEvent.click(screen.getByRole('button', { name: /^SH 小蘇擊中/ }))
    expect(node(container, 'SH').getAttribute('data-intervened')).toBe('true')
    expect(node(container, 'SH').getAttribute('data-value')).toBe('0')
    expect(edge(container, 'ST>SH').getAttribute('data-state')).toBe('cut')
    expect(node(container, 'BH').getAttribute('data-value')).toBe('1')
    expect(node(container, 'BS').getAttribute('data-value')).toBe('1')
    expect(container.querySelector('.ca-do-chip .ca-tex')?.getAttribute('data-text')).toBe('do(SH=0)')

    // Keyboard: Enter on the same node releases it.
    fireEvent.keyDown(screen.getByRole('button', { name: /^SH 小蘇擊中/ }), { key: 'Enter' })
    expect(node(container, 'SH').getAttribute('data-intervened')).toBe('false')
    expect(edge(container, 'ST>SH').getAttribute('data-state')).toBe('live')
    expect(node(container, 'BH').getAttribute('data-value')).toBe('0')
  })

  it('switches the equations between notations', () => {
    const { container } = render(<CausalPlayground caseId="rock-throwing" />)
    const eqs = (): string =>
      [...container.querySelectorAll('.ca-eqs .ca-tex')].map((e) => e.getAttribute('data-text') ?? '').join('\n')
    expect(eqs()).toContain('BH ↔ (BT ∧ ¬SH)')
    fireEvent.click(screen.getByRole('button', { name: '數學式' }))
    expect(screen.getByRole('button', { name: '數學式' }).getAttribute('aria-pressed')).toBe('true')
    expect(eqs()).toContain('BH = BT·(1−SH)')
    expect(eqs()).toContain('= 1·(1−1) = 0')
    expect(eqs()).not.toContain('↔')
    fireEvent.click(screen.getByRole('button', { name: '干預式' }))
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

  it('labels the value a non-boolean fill stands for', () => {
    const { container } = render(<ProbabilityPanel caseId="newcomb" />)
    expect(container.querySelector('[data-node="A"] [data-fill-means]')?.getAttribute('data-fill-means')).toBe('A=one')
    expect(container.textContent).toContain('數字前標出填色代表的值')
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
