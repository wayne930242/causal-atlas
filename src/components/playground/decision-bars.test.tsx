// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { lessonModel } from '../../demo/lesson-models.ts'
import type { CaseDecision } from '../../data/index.ts'
import { CausalPlayground } from '../index.ts'

afterEach(cleanup)

type Row = { values: string[]; choice: string; lit: string[] }
const rows = (container: HTMLElement): Record<string, Row> =>
  Object.fromEntries(
    [...container.querySelectorAll<HTMLElement>('[data-ev-row]')].map((r) => [
      r.dataset.evRow ?? '',
      {
        values: [...r.querySelectorAll<HTMLElement>('[data-ev-value]')].map((v) => v.dataset.evValue ?? ''),
        choice: r.querySelector('.ca-ev-choice')?.textContent ?? '',
        lit: [...r.querySelectorAll<HTMLElement>('[data-ev-act][data-lit="true"]')].map((b) => b.dataset.evAct ?? ''),
      },
    ]),
  )

const GH: CaseDecision = {
  variable: 'A',
  utility: {
    variables: ['A', 'M'],
    rows: [
      ['one', 1, 100],
      ['one', 0, 0],
      ['two', 1, 101],
      ['two', 0, 10],
    ],
  },
}

describe('CausalPlayground decision: expected-utility bars under the graph', () => {
  it('smoking lesion: EDT picks not smoking by 16.74, CDT smoking by 10; observing and do() light the matching bar', () => {
    const { container, getByLabelText } = render(<CausalPlayground caseId="smoking-lesion" sliders={['N_S1']} decision />)
    expect(rows(container)).toMatchObject({
      edt: { values: ['-31.58', '-14.84'], choice: '選 S=0（多 16.74）', lit: [] },
      cdt: { values: ['-15.00', '-25.00'], choice: '選 S=1（多 10.00）', lit: [] },
    })
    fireEvent.click(container.querySelector('[data-node="S"]') as Element)
    expect(rows(container).edt.lit).toEqual(['1'])
    expect(rows(container).cdt.lit).toEqual([])
    fireEvent.click(container.querySelector('[data-node="S"]') as Element, { shiftKey: true })
    expect(rows(container).cdt.lit).toEqual(['1'])
    expect(rows(container).edt.lit).toEqual([])
    // The slider moves the evidential row only; below about 0.38 it picks smoking too.
    const slider = getByLabelText('有病灶時想吸菸的機率')
    fireEvent.change(slider, { target: { value: '0.37' } })
    expect(rows(container).edt.choice).toMatch(/^選 S=1/)
    expect(rows(container).cdt.values).toEqual(['-15.00', '-25.00'])
    fireEvent.change(slider, { target: { value: '0.39' } })
    expect(rows(container).edt.choice).toMatch(/^選 S=0/)
  })

  it('Newcomb with Gibbard–Harper utilities and error 0.1: CDT gains 8.38 / 5.5 / 2.62 as the prior grows; EDT stays 90 / 19.1', () => {
    for (const [p, gain] of [
      [0.1, '8.38'],
      [0.5, '5.50'],
      [0.9, '2.62'],
    ] as const) {
      const { container, unmount } = render(<CausalPlayground caseId="newcomb" sliders={['D']} prior={{ D: p, E: 0.1 }} decision={GH} />)
      const r = rows(container)
      expect(r.edt.values).toEqual(['90.00', '19.10'])
      expect(r.cdt.choice).toBe(`選 A=two（多 ${gain}）`)
      unmount()
    }
  })

  it('murder lesion, utilities given in the prop: EDT does not shoot (−4.91 against 0), CDT shoots (5.60)', () => {
    const decision: CaseDecision = { variable: 'S', utility: { variables: ['S', 'H'], rows: [[1, 1, 10], [1, 0, -10], [0, 0, 0], [0, 1, 0]] } }
    const { container } = render(<CausalPlayground doc={lessonModel('m10-murder-lesion')} decision={decision} />)
    expect(rows(container)).toMatchObject({ edt: { values: ['-4.91', '0.00'] }, cdt: { values: ['5.60', '0.00'] } })
  })

  it('decision={true} needs the case to have one', () => {
    expect(() => renderToString(<CausalPlayground doc={lessonModel('m10-murder-lesion')} decision />)).toThrow(/decision/)
  })
})
