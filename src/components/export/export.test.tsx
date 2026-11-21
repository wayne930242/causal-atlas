// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authorYear, bibtex, watermarkLine } from './cite.ts'
import { ACADEMIC_PALETTE, exportImage, inlineSvg } from './export-image.ts'
import { saveFile } from './download.ts'
import { CasePage, CausalPlayground, ProbabilityPanel, WorldLanes } from '../index.ts'

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

/** Pick the academic style in the open export menu, then download as SVG. */
function exportAcademic(scope: HTMLElement): { name: string; svg: string } {
  if (within(scope).queryByRole('group', { name: '圖片設定' }) === null) {
    fireEvent.click(within(scope).getByRole('button', { name: '下載圖片' }))
  }
  const menu = within(scope).getByRole('group', { name: '圖片設定' })
  fireEvent.click(within(menu).getByRole('button', { name: 'SVG' }))
  fireEvent.click(within(menu).getByRole('button', { name: '學術版（黑白線條）' }))
  fireEvent.click(within(menu).getByRole('button', { name: '下載' }))
  const call = saved.mock.calls.at(-1)
  if (call === undefined || typeof call[1] !== 'string') throw new Error('nothing saved')
  return { name: call[0], svg: call[1] }
}

describe('academic export', () => {
  it('draws only black and white, with no watermark or case-source strip', () => {
    const { container } = render(<CasePage caseId="rock-throwing" initialStep={3} />)
    const { name, svg } = exportAcademic(container)
    expect(name).toBe('rock-throwing-graph-academic.svg')
    const colours = [...svg.matchAll(/(?:fill|stroke|stop-color|flood-color|color)="([^"]*)"/g)].map((m) => m[1])
    expect(colours.length).toBeGreaterThan(10)
    expect(new Set(colours.map((c) => c.toLowerCase()))).toEqual(new Set(['#000000', '#ffffff', 'none']))
    expect(svg).not.toMatch(/#[0-9a-fA-F]{6}(?<!#000000)(?<!#ffffff)\b/)
    expect(svg).not.toMatch(/rgb|hsl|var\(|opacity="0\./i)
    expect(svg).not.toContain(watermarkLine())
    expect(svg).not.toContain('案例出處')
    expect(svg).not.toContain('CC BY 4.0 · ')
    expect(svg).toContain('do(ST=0)')
  })

  it('draws a cut edge dashed with two slashes, the witness hull dotted, and the do bracket in black', () => {
    const ns = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(ns, 'svg') as SVGSVGElement
    for (const cls of ['ca-stroke-cut', 'ca-stroke-slash', 'ca-hull', 'ca-stroke-clamp', 'ca-amber-tag', 'ca-fill-accent']) {
      const el = document.createElementNS(ns, 'path')
      el.setAttribute('class', cls)
      svg.append(el)
    }
    const [cut, slash, hull, clamp, tag, accent] = [...inlineSvg(svg, ACADEMIC_PALETTE, 'academic').children]
    expect(cut?.getAttribute('stroke-dasharray')).toBe('5 3')
    expect(hull?.getAttribute('stroke-dasharray')).toBe('1.5 3')
    for (const el of [cut, slash, hull, clamp]) expect(Number(el?.getAttribute('stroke-width'))).toBeGreaterThanOrEqual(1)
    expect([slash, clamp].map((e) => e?.getAttribute('stroke'))).toEqual(['#000000', '#000000'])
    expect(tag?.getAttribute('fill')).toBe('#ffffff')
    expect(tag?.getAttribute('stroke')).toBe('#000000')
    expect(accent?.getAttribute('fill')).toBe('#000000')
  })

  it('carries the citation in the description and metadata, not in the drawing', () => {
    const { container } = render(<CasePage caseId="rock-throwing" initialStep={3} />)
    const { svg } = exportAcademic(container)
    const desc = /<desc>([\s\S]*?)<\/desc>/.exec(svg)?.[1] ?? ''
    expect(desc).toContain(authorYear().replace(/&/g, '&amp;'))
    expect(desc).toContain('Hall, N. (2004)')
    expect(/<metadata>([\s\S]*?)<\/metadata>/.exec(svg)?.[1]).toContain('@software{hung_causal_atlas_')
    expect(svg).not.toMatch(/<text[^>]*>[^<]*Hall, N\./)
  })

  it('shows a citation reminder with copy buttons when the academic style is chosen', () => {
    const write = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true })
    const { container } = render(<CasePage caseId="rock-throwing" initialStep={3} />)
    fireEvent.click(within(container).getByRole('button', { name: '下載圖片' }))
    const menu = within(container).getByRole('group', { name: '圖片設定' })
    expect(within(menu).queryByRole('note')).toBeNull()
    fireEvent.click(within(menu).getByRole('button', { name: '學術版（黑白線條）' }))
    const note = within(menu).getByRole('note')
    expect(note.textContent).toContain(authorYear())
    expect(note.textContent).toContain('Hall, N. (2004)')
    fireEvent.click(within(note).getByRole('button', { name: '複製 BibTeX' }))
    expect(write).toHaveBeenCalledWith(bibtex())
    fireEvent.click(within(note).getByRole('button', { name: '複製作者年份' }))
    expect(write).toHaveBeenCalledWith(authorYear())
    expect(within(note).getByRole('button', { name: '複製案例出處' })).toBeTruthy()
    expect(within(menu).queryByRole('button', { name: '淺色' })).toBeNull()
  })

  it('says it in English for an English export', () => {
    const { container } = render(<CasePage caseId="rock-throwing" initialStep={3} />)
    fireEvent.click(within(container).getByRole('button', { name: '下載圖片' }))
    const menu = within(container).getByRole('group', { name: '圖片設定' })
    fireEvent.click(within(menu).getByRole('button', { name: 'English' }))
    fireEvent.click(within(menu).getByRole('button', { name: '學術版（黑白線條）' }))
    const note = within(menu).getByRole('note')
    expect(note.textContent).toContain('Hung, W.')
    expect(within(note).getByRole('button', { name: 'Copy author-year' })).toBeTruthy()
  })

  it('keeps the colour export watermarked', () => {
    const { container } = render(<CasePage caseId="rock-throwing" initialStep={3} />)
    const { svg } = exportSvg(container, '淺色')
    expect(svg).toContain(watermarkLine())
    expect(svg).not.toContain('<desc>')
  })
})


describe('subscripts in exported text', () => {
  it('lowers digit ids in tags and footnotes but leaves the watermark and source literal', async () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 200 100')
    await exportImage({
      name: 'dice', title: 'Dice v1', origin: 'Source v1, 2026 (CC BY 4.0)', legend: 'Version v1',
      panels: [{ svg, tags: [{ text: 'do(D1=1)', tone: 'accent' }], foot: 'P(U2=1) = 0.10' }],
    }, { theme: 'light', format: 'svg' })
    const output = new DOMParser().parseFromString(String(saved.mock.calls.at(-1)?.[1]), 'image/svg+xml')
    expect([...output.querySelectorAll('tspan[dy="0.25em"]')].map((n) => n.textContent)).toEqual(['1', '2'])
    expect(output.documentElement.textContent).toContain('Source v1, 2026 (CC BY 4.0)')
    expect(output.documentElement.textContent).toContain('Dice v1')
    expect(output.documentElement.textContent).toContain('Version v1')
    expect(output.documentElement.textContent).toContain('= 0.10')
  })
  it('draws X_Y identifiers as a lowered, smaller tspan instead of an underscore', () => {
    const NS = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(NS, 'svg')
    const text = document.createElementNS(NS, 'text')
    text.textContent = 'do(N_S1=0) and N_S1'
    svg.append(text)
    const out = inlineSvg(svg, ACADEMIC_PALETTE, 'academic')
    expect(out.textContent).not.toContain('_')
    const subs = [...out.querySelectorAll('tspan[font-size="70%"]')]
    expect(subs.map((s) => s.textContent)).toEqual(['S1', 'S1'])
    expect(subs[0].getAttribute('dy')).toBe('0.25em')
  })
})
