// @vitest-environment jsdom
import { cleanup, fireEvent, render, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { watermarkLine } from './cite.ts'
import { saveFile } from './download.ts'
import { CasePage, WorldLanes } from './index.ts'

vi.mock('./download.ts', () => ({ saveFile: vi.fn() }))
const saved = vi.mocked(saveFile)

beforeEach(() => {
  saved.mockReset()
  delete document.documentElement.dataset.theme
})
afterEach(cleanup)

const CJK = /[　-〿㐀-䶿一-鿿＀-￯]/

interface MenuNames {
  readonly open: string
  readonly group: string
  readonly download: string
}
const ZH: MenuNames = { open: '下載圖片', group: '圖片設定', download: '下載' }
const EN: MenuNames = { open: 'Download image', group: 'Image settings', download: 'Download' }

/** Open the export menu, choose SVG (and a language), download, return the saved SVG text. */
function exportSvg(scope: HTMLElement, names: MenuNames, language?: string): { name: string; svg: string } {
  if (within(scope).queryByRole('group', { name: names.group }) === null) {
    fireEvent.click(within(scope).getByRole('button', { name: names.open }))
  }
  const menu = within(scope).getByRole('group', { name: names.group })
  fireEvent.click(within(menu).getByRole('button', { name: 'SVG' }))
  if (language !== undefined) fireEvent.click(within(menu).getByRole('button', { name: language }))
  fireEvent.click(within(menu).getByRole('button', { name: names.download }))
  const call = saved.mock.calls.at(-1)
  if (call === undefined) throw new Error('nothing saved')
  return { name: call[0], svg: String(call[1]) }
}

describe('export language', () => {
  it('an English component exports an English image', () => {
    const { container } = render(<CasePage caseId="rock-throwing" initialStep={3} locale="en" />)
    const { name, svg } = exportSvg(container.querySelector('.ca-case-right') as HTMLElement, EN)
    expect(name).toBe('rock-throwing-graph-light-en.svg')
    expect(svg).toContain(watermarkLine(undefined, 'en'))
    expect(svg).toContain('Case source: Hall 2004')
    expect(svg).toContain('Rock throwing (preemption)')
    expect(svg).toContain('Suzy throws')
    expect(svg.replace('洪偉', '')).not.toMatch(CJK)
  })

  it('a Chinese component exports Chinese by default, and English when chosen in the menu', () => {
    const { container } = render(<CasePage caseId="rock-throwing" initialStep={3} />)
    const right = container.querySelector('.ca-case-right') as HTMLElement
    const zh = exportSvg(right, ZH)
    expect(zh.name).toBe('rock-throwing-graph-light.svg')
    expect(zh.svg).toContain(watermarkLine(undefined, 'zh-TW'))
    expect(zh.svg).toContain('案例出處：Hall 2004')

    const en = exportSvg(right, ZH, 'English')
    expect(en.name).toBe('rock-throwing-graph-light-en.svg')
    expect(en.svg).toContain(watermarkLine(undefined, 'en'))
    expect(en.svg).toContain('Case source: Hall 2004')
    expect(en.svg).toContain('Suzy throws')
    expect(en.svg).toContain('do(ST=0)')
    expect(en.svg.replace('洪偉', '')).not.toMatch(CJK)
    // The page itself stays Chinese.
    expect(right.textContent).toContain('小蘇丟')
  })

  it('exports English world lanes from a Chinese page', () => {
    const { container } = render(<WorldLanes caseId="rock-throwing" initialStep={2} />)
    const { svg } = exportSvg(container, ZH, 'English')
    expect(svg).toContain('Counterfactual world')
    expect(svg.replace('洪偉', '')).not.toMatch(CJK)
  })
})
