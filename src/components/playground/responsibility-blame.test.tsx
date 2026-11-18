// @vitest-environment jsdom
import { cleanup, fireEvent, render, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { lessonModel } from '../../demo/lesson-models.ts'
import { CausalPlayground } from '../index.ts'

afterEach(cleanup)

const cell = (container: HTMLElement, theory: string): Element => {
  const el = container.querySelector(`[data-verdict-cell="${theory}"]`)
  if (el === null) throw new Error(`no cell ${theory}`)
  return el
}
const resp = (container: HTMLElement, theory: string): string | null =>
  cell(container, theory).querySelector('[data-responsibility]')?.getAttribute('data-responsibility') ?? null

describe('verdicts with responsibility: true', () => {
  it('5–0: 1/3 under every Halpern–Pearl standard, no degree on the but-for cell', () => {
    const { container } = render(
      <CausalPlayground doc={lessonModel('m10-vote-5-0')} verdicts={[{ cause: 'V1=1', effect: 'W=1', responsibility: true }]} />,
    )
    expect(cell(container, 'butfor').getAttribute('data-verdict')).toBe('not-cause')
    expect(resp(container, 'butfor')).toBeNull()
    expect(resp(container, 'hp-original')).toBe('1/3')
    expect(resp(container, 'hp-updated')).toBe('1/3')
    expect(resp(container, 'hp-modified')).toBe('1/3')
    expect(cell(container, 'hp-original').textContent).toContain('責任 1/3')
    expect(cell(container, 'hp-modified').getAttribute('data-verdict')).toBe('part-of-cause')
  })

  it('3–2: 1 for a member of the majority, 0 for the minority', () => {
    const doc = lessonModel('m10-vote-3-2')
    const majority = render(<CausalPlayground doc={doc} verdicts={[{ cause: 'V1=1', effect: 'W=1', responsibility: true }]} />)
    expect(resp(majority.container, 'hp-original')).toBe('1')
    majority.unmount()
    const minority = render(<CausalPlayground doc={doc} verdicts={[{ cause: 'V4=0', effect: 'W=1', responsibility: true }]} />)
    expect(resp(minority.container, 'hp-modified')).toBe('0')
  })

  it("Mrs Jones: the pill's responsibility is 1/2 under every HP standard, the witness in the ⓘ", () => {
    const { container } = render(
      <CausalPlayground doc={lessonModel('m08-pill-jones')} verdicts={[{ cause: 'X=1', effect: 'Y=1', responsibility: true }]} />,
    )
    for (const theory of ['hp-original', 'hp-updated', 'hp-modified']) expect(resp(container, theory)).toBe('1/2')
    const tip = cell(container, 'hp-modified').querySelector('[role="tooltip"]')
    expect(tip?.textContent).toContain('k = 2')
    expect(tip?.textContent).toContain('固定 Z=0')
  })

  it('without the flag the verdict cells carry no responsibility', () => {
    const { container } = render(<CausalPlayground doc={lessonModel('m10-vote-5-0')} verdicts={[{ cause: 'V1=1', effect: 'W=1' }]} />)
    expect(container.querySelector('[data-responsibility]')).toBeNull()
  })

  it('a cause of more than one event throws the engine problem', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() =>
      render(
        <CausalPlayground doc={lessonModel('m10-vote-5-0')} verdicts={[{ cause: 'V1=1 and V2=1', effect: 'W=1', responsibility: true }]} />,
      ),
    ).toThrow(/single event/i)
    spy.mockRestore()
  })

  it('speaks English', () => {
    const { container } = render(
      <CausalPlayground
        doc={lessonModel('m10-vote-5-0')}
        locale="en"
        verdicts={[{ cause: 'V1=1', effect: 'W=1', responsibility: true }]}
      />,
    )
    expect(cell(container, 'hp-original').textContent).toContain('responsibility 1/3')
  })
})

const doctor = lessonModel('m10-doctor')
const believes = (s: number) => ({ independent: { S: s, H: 0.3, N: 0.05, U_T: 1 } })

const blameOf = (container: HTMLElement, state: number, theory: string): string | null =>
  container.querySelector(`[data-state="${state}"] [data-blame="${theory}"]`)?.getAttribute('data-degree') ?? null

describe('blame: one row per epistemic state, one column per standard', () => {
  it('the doctor (Halpern Ex. 6.2.4): 0, 0.285, 0.95 and 0.8507 as his state changes', () => {
    const { container } = render(
      <CausalPlayground
        doc={doctor}
        blame={{
          cause: 'T=1',
          effect: 'D=1',
          states: [
            { label: '他實際相信的', prior: believes(0) },
            { label: '他應該知道的' },
            { label: '量完血壓之後', given: 'H=1' },
            { label: '病人死了之後', given: 'D=1' },
          ],
        }}
      />,
    )
    // The blame tab is the figure's own block: open at first.
    expect(container.querySelector('.ca-tabs')?.getAttribute('data-open')).toBe('blame')
    const expected = ['0.000000', '0.285000', '0.950000', '0.850746']
    expected.forEach((degree, i) => {
      for (const theory of ['hp-original', 'hp-updated', 'hp-modified'])
        expect(blameOf(container, i, theory), `${i} ${theory}`).toBe(degree)
    })
    const rows = container.querySelectorAll('.ca-blame-table [data-state]')
    expect(rows.length).toBe(4)
    expect(rows[1].textContent).toContain('0.285')
    expect(rows[3].textContent).toContain('0.85')
    expect(rows[2].textContent).toContain('已知 H=1')
  })

  it("Suzy (Halpern Ex. 6.2.2): without `states` the document's joint prior gives 1/2; the fold lists the four backgrounds", () => {
    const { container } = render(<CausalPlayground doc={lessonModel('m10-suzy-blame')} blame={{ cause: 'ST=1', effect: 'BS=1' }} />)
    expect(blameOf(container, 0, 'hp-original')).toBe('0.500000')
    const fold = container.querySelector('[data-fold="0"]')
    expect(fold?.tagName).toBe('DETAILS')
    expect(fold?.querySelectorAll('[data-background]').length).toBe(4)
    const degrees = [...(fold?.querySelectorAll('[data-background] td:last-child') ?? [])].map((td) => td.textContent)
    expect(degrees).toEqual(['0', '1/2', '1/2', '1'])
  })

  it("Faulkner: the match's blame is 0.009, and 1 after the suicide", () => {
    const { container } = render(
      <CausalPlayground
        doc={lessonModel('m10-faulkner')}
        blame={{
          cause: 'M=1',
          effect: 'ES=1',
          theories: ['hp-modified'],
          states: [{}, { label: { 'zh-TW': '自殺之後', en: 'After the suicide' }, given: 'ES=1' }],
        }}
      />,
    )
    expect(container.querySelectorAll('[data-blame]').length).toBe(2)
    expect(blameOf(container, 0, 'hp-modified')).toBe('0.009000')
    expect(blameOf(container, 1, 'hp-modified')).toBe('1.000000')
    expect(container.textContent).toContain('自殺之後')
  })

  it('moves with a slider of the document prior', () => {
    const { container } = render(
      <CausalPlayground doc={doctor} sliders={['H']} blame={{ cause: 'T=1', effect: 'D=1', theories: ['hp-modified'] }} />,
    )
    expect(blameOf(container, 0, 'hp-modified')).toBe('0.285000')
    fireEvent.click(within(container).getByRole('button', { name: /式子/ }))
    const h = container.querySelector<HTMLInputElement>('input[type="range"]')
    if (h === null) throw new Error('no slider')
    fireEvent.change(h, { target: { value: '0.5' } })
    // P(H) 0.5, P(S) 1: 0.5 × 0.95.
    expect(blameOf(container, 0, 'hp-modified')).toBe('0.475000')
  })

  it('speaks English', () => {
    const { container } = render(
      <CausalPlayground doc={doctor} locale="en" blame={{ cause: 'T=1', effect: 'D=1', theories: ['hp-modified'] }} />,
    )
    expect(container.textContent).toContain('How much blame does')
    expect(container.textContent).toContain("The document's probabilities")
    expect(within(container).getByRole('button', { name: 'Blame' })).not.toBeNull()
  })

  it('needs priors', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<CausalPlayground doc={lessonModel('m10-vote-5-0')} blame={{ cause: 'V1=1', effect: 'W=1' }} />)).toThrow(
      /blame needs priors/,
    )
    spy.mockRestore()
  })

  it('no blame, no tab', () => {
    const { container } = render(<CausalPlayground doc={doctor} />)
    expect(container.querySelector('[data-tab="blame"]')).toBeNull()
  })
})
