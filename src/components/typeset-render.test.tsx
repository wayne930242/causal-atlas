// Node environment: every place a variable name is shown is typeset, on the server too.
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { caseIds, getCase } from '../data/index.ts'
import type { LoadedCase } from '../data/load.ts'
import type { Locale } from './i18n.ts'
import { CasePage, CausalPlayground, ModelEditor, ProbabilityPanel, WorldLanes } from './index.ts'

const LOCALES: readonly Locale[] = ['zh-TW', 'en']

/** What a reader sees: the markup without tags, so aria-labels, data-* and form values are not text. */
function visibleText(html: string): string {
  return html.replace(/<[^>]*>/g, ' ')
}

/** Every variable id with an underscore: those are the ones that would show as a raw `X_Y`. */
function subscriptedIds(c: LoadedCase): string[] {
  return c.model.variables.map((v) => v.id).filter((id) => id.includes('_'))
}

function renders(id: string, locale: Locale): Record<string, string> {
  const c = getCase(id)
  const out: Record<string, string> = {
    playground: renderToString(createElement(CausalPlayground, { caseId: id, locale })),
    sliders: renderToString(createElement(ProbabilityPanel, { caseId: id, locale })),
    editor: renderToString(createElement(ModelEditor, { initial: id, locale })),
  }
  for (let step = 1; step <= 4; step += 1) out[`case-${step}`] = renderToString(createElement(CasePage, { caseId: id, initialStep: step, locale }))
  if (c.context !== undefined && c.data.showcase.length > 0) {
    const row = c.data.verdicts.find((v) => 'cause' in v.query && v.theory !== 'butfor')
    const witness =
      row !== undefined && 'cause' in row.query ? { cause: row.query.cause, effect: row.query.effect } : undefined
    out.lanes = renderToString(createElement(WorldLanes, { caseId: id, initialStep: witness === undefined ? 2 : 3, witness, locale }))
  }
  try {
    out.compare = renderToString(createElement(ProbabilityPanel, { caseId: id, view: 'compare', locale }))
  } catch {
    // a case without an observe/do pair has no comparison
  }
  return out
}

describe('smoking-lesion probability panel', () => {
  const html = renderToString(createElement(ProbabilityPanel, { caseId: 'smoking-lesion' }))
  const rows = [...html.matchAll(/<li class="ca-slider-row">(.*?)<\/li>/g)].map((m) => m[1])

  it('typesets every prior slider label with a subscript', () => {
    expect(rows).toHaveLength(5)
    for (const id of ['N_S1', 'N_S0', 'N_C1', 'N_C0']) {
      const row = rows.find((r) => r.includes(`data-text="${id}"`))
      expect(row, id).toBeDefined()
      const label = /<span class="ca-slider-var[^>]*>(.*?)<\/span><label/.exec(row ?? '')?.[1] ?? ''
      expect(label, id).toContain('class="katex"')
      expect(label, id).toContain('vlist') // KaTeX builds the subscript as a vlist
      expect(label, id).toContain(`aria-label="${id}"`)
    }
  })

  it('prints no raw id outside attributes and form inputs', () => {
    const text = visibleText(html)
    for (const id of ['N_S1', 'N_S0', 'N_C1', 'N_C0']) expect(text).not.toContain(id)
    expect(html).not.toContain('katex-error')
  })
})

describe.each(caseIds)('%s', (id) => {
  for (const locale of LOCALES) {
    it(`typesets every variable name and has no KaTeX error (${locale})`, () => {
      const c = getCase(id)
      for (const [where, html] of Object.entries(renders(id, locale))) {
        expect(html, `${where} katex-error`).not.toContain('katex-error')
        const text = visibleText(html)
        for (const v of subscriptedIds(c)) expect(text, `${where} shows raw ${v}`).not.toContain(v)
      }
    })
  }
})
