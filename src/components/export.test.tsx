// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { watermarkLine } from './cite.ts'
import { saveFile } from './download.ts'
import { CasePage, CausalPlayground, ProbabilityPanel, WorldLanes } from './index.ts'

vi.mock('./download.ts', () => ({ saveFile: vi.fn() }))

const saved = vi.mocked(saveFile)

beforeEach(() => {
  saved.mockReset()
  delete document.documentElement.dataset.theme
})
afterEach(cleanup)

/** Open the export menu inside `scope`, pick format and theme, download, return the saved SVG text. */
function exportSvg(scope: HTMLElement, theme?: '淺色' | '深色'): { name: string; svg: string } {
  if (within(scope).queryByRole('group', { name: '圖片設定' }) === null) {
    fireEvent.click(within(scope).getByRole('button', { name: '下載圖片' }))
  }
  const menu = within(scope).getByRole('group', { name: '圖片設定' })
  fireEvent.click(within(menu).getByRole('button', { name: 'SVG' }))
  if (theme !== undefined) fireEvent.click(within(menu).getByRole('button', { name: theme }))
  fireEvent.click(within(menu).getByRole('button', { name: '下載' }))
  const call = saved.mock.calls.at(-1)
  if (call === undefined) throw new Error('nothing saved')
  const [name, data] = call
  if (typeof data !== 'string') throw new Error('svg export should save text')
  return { name, svg: data }
}

describe('image export', () => {
  it('bakes the watermark, the case origin and the current do() into the SVG, in literal colours', () => {
    const { container } = render(<CasePage caseId="rock-throwing" initialStep={3} />)
    const light = exportSvg(container, '淺色')
    expect(light.name).toBe('rock-throwing-graph-light.svg')
    expect(light.svg).toContain(watermarkLine())
    expect(light.svg).toContain('案例出處：Hall 2004')
    expect(light.svg).toContain('ST←0')
    expect(light.svg).toContain('do(ST=0)')
    expect(light.svg).not.toContain('var(')
    expect(light.svg).not.toMatch(/class=/)
    expect(light.svg).toContain('fill="#f5f5f2"')
    expect(light.svg).toContain('fill="#111111"')
    expect(light.svg).toContain('stroke="#e3311d"')

    const dark = exportSvg(container, '深色')
    expect(dark.name).toBe('rock-throwing-graph-dark.svg')
    expect(dark.svg).toContain(watermarkLine())
    expect(dark.svg).toContain('fill="#111111"')
    expect(dark.svg).toContain('fill="#f2f2ed"')
    expect(dark.svg).toContain('stroke="#ff5948"')
    expect(dark.svg).not.toContain('#f5f5f2')
    expect(dark.svg).not.toContain('var(')
  })

  it('takes the url for the watermark from a prop', () => {
    const { container } = render(<CausalPlayground caseId="rock-throwing" exportUrl="https://example.test/atlas/" />)
    expect(exportSvg(container).svg).toContain(watermarkLine('https://example.test/atlas/'))
  })

  it('defaults to the page theme but the choice does not touch it', () => {
    document.documentElement.dataset.theme = 'dark'
    const { container } = render(<CausalPlayground caseId="rock-throwing" />)
    fireEvent.click(within(container).getByRole('button', { name: '下載圖片' }))
    const menu = within(container).getByRole('group', { name: '圖片設定' })
    expect(within(menu).getByRole('button', { name: '深色' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(menu).getByRole('button', { name: 'PNG（2×）' }).getAttribute('aria-pressed')).toBe('true')
    const { svg } = exportSvg(container, '淺色')
    expect(svg).toContain('fill="#f5f5f2"')
    expect(svg).not.toContain('#f2f2ed')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('exports the witness hull shown on the graph', () => {
    const { container } = render(<CasePage caseId="rock-throwing" initialStep={4} />)
    fireEvent.click(screen.getAllByRole('button', { name: '在圖上看' })[0])
    const { svg } = exportSvg(container.querySelector('.ca-case-right') as HTMLElement, '淺色')
    expect(svg).toContain('見證：固定 BH=0')
    expect(svg).toContain('stroke="#b07d0b"')
  })

  it('exports both graphs of the probability comparison and the world lanes', () => {
    const prob = render(<ProbabilityPanel caseId="smoking-lesion" view="compare" />)
    const both = exportSvg(prob.container, '淺色')
    expect(both.name).toBe('smoking-lesion-compare-light.svg')
    expect(both.svg.match(/<svg /g)?.length).toBe(3)
    expect(both.svg).toContain('P(C=1 | do(S=1)) = 0.25')
    expect(both.svg).toContain('案例出處：Eells 1982；Skyrms 1980')
    prob.unmount()

    const lanes = render(<WorldLanes caseId="rock-throwing" initialStep={2} />)
    const out = exportSvg(lanes.container, '深色')
    expect(out.name).toBe('rock-throwing-lanes-dark.svg')
    expect(out.svg).toContain('反事實世界')
    expect(out.svg).toContain(watermarkLine())
    expect(out.svg).not.toContain('var(')
  })
})
