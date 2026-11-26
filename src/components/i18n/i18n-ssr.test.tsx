// Runs in the node environment: the English server render carries no Chinese.
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { caseIds, getCase } from '../../data/index.ts'
import { watermarkLine } from '../export/cite.ts'
import { CasePage, CausalPlayground, ModelEditor } from '../index.ts'

/** CJK ideographs, CJK punctuation and full-width forms. */
const CJK = /[　-〿㐀-䶿一-鿿＀-￯]+/g

function cjkIn(html: string, allow: readonly string[] = []): string[] {
  const found = html.match(CJK) ?? []
  return found.filter((s) => !allow.some((a) => a.includes(s)))
}

describe('English server render', () => {
  it.each(caseIds)('CasePage %s in English has no Chinese at any step', (id) => {
    const c = getCase(id)
    for (let step = 1; step <= 4; step += 1) {
      const html = renderToString(createElement(CasePage, { caseId: id, initialStep: step, locale: 'en' }))
      expect(html).toContain(c.data.title.en.replace(/'/g, '&#x27;'))
      expect(cjkIn(html)).toEqual([])
    }
  })

  it.each(caseIds)('CausalPlayground %s in English has no Chinese', (id) => {
    const html = renderToString(createElement(CausalPlayground, { caseId: id, locale: 'en' }))
    expect(cjkIn(html)).toEqual([])
  })

  it.each(['rock-throwing', 'newcomb', 'blank'])('ModelEditor from %s in English shows Chinese only in the Chinese label inputs', (initial) => {
    // The editor offers both labels; the Chinese one is data the user edits, not interface text.
    const zhLabels = initial === 'blank' ? [] : getCase(initial).data.model.variables.map((v) => v.label['zh-TW'])
    const html = renderToString(createElement(ModelEditor, { initial, locale: 'en' }))
    expect(html).toContain('Save and share')
    expect(cjkIn(html, zhLabels)).toEqual([])
  })

  it('defaults to Traditional Chinese', () => {
    expect(renderToString(createElement(CasePage, { caseId: 'rock-throwing' }))).toContain('丟石頭砸瓶子')
  })
})

describe('watermark', () => {
  it('names the author per locale', () => {
    expect(watermarkLine('https://github.com/wayne930242/logic-atlas', 'zh-TW')).toBe('洪偉（Wei Hung）· logic-atlas · CC BY 4.0 · https://github.com/wayne930242/logic-atlas')
    expect(watermarkLine('https://github.com/wayne930242/logic-atlas', 'en')).toBe('Wei Hung (洪偉) · logic-atlas · CC BY 4.0 · https://github.com/wayne930242/logic-atlas')
    expect(watermarkLine()).toBe(watermarkLine('https://github.com/wayne930242/logic-atlas', 'zh-TW'))
  })
})
