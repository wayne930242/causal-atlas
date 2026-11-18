// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { heightAtInitialBlock } from './tab-height.ts'

const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')

afterEach(() => {
  if (original !== undefined) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', original)
})

/** A figure 100 px tall without blocks, plus 50 px per open block. */
function figure(open: string): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = ['verdicts', 'equations'].map((id) => `<div data-tab-panel="${id}"${id === open ? '' : ' hidden'}></div>`).join('')
  Object.defineProperty(root, 'offsetHeight', { configurable: true, get: () => 100 + 50 * root.querySelectorAll('[data-tab-panel]:not([hidden])').length })
  return root
}

const hidden = (root: HTMLElement): string[] => [...root.querySelectorAll<HTMLElement>('[data-tab-panel]')].map((p) => `${p.dataset.tabPanel}:${p.hidden}`)

describe('heightAtInitialBlock', () => {
  it("measures with the figure's own block open, however the reader left the tabs", () => {
    const root = figure('equations')
    expect(heightAtInitialBlock(root, 'verdicts', 640)).toBe(150)
    expect(hidden(root)).toEqual(['verdicts:true', 'equations:false'])
  })

  it('measures with every block closed when the figure has no own block', () => {
    const root = figure('equations')
    expect(heightAtInitialBlock(root, undefined, 640)).toBe(100)
    expect(hidden(root)).toEqual(['verdicts:true', 'equations:false'])
  })

  it('falls back when there is no figure yet', () => {
    expect(heightAtInitialBlock(null, 'verdicts', 640)).toBe(640)
  })
})
