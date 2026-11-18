// Runs in the node environment: the editor's case panel and model list, drawn on the server.
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { checkVerdict, getCase, loadCase } from '../../data/index.ts'
import type { ModelDoc } from '../../data/schema.ts'
import { modelDocSchema } from '../../data/schema.ts'
import { CaseInfo } from '../case/CaseInfo.tsx'
import { ModelEditor } from '../index.ts'
import { messagesFor } from '../i18n/messages.ts'

/** The blog's coarse rock-throwing model (lesson 8): no hit variables. */
const coarse: ModelDoc = modelDocSchema.parse({
  format: 'causal-atlas/model',
  version: 1,
  title: '丟石頭的粗模型',
  model: {
    variables: [
      { id: 'U_ST', label: { 'zh-TW': '小蘇想丟', en: "Suzy's intention" }, kind: 'exogenous', domain: 'boolean' },
      { id: 'U_BT', label: { 'zh-TW': '小比想丟', en: "Billy's intention" }, kind: 'exogenous', domain: 'boolean' },
      { id: 'ST', label: { 'zh-TW': '小蘇丟', en: 'Suzy throws' }, kind: 'endogenous', domain: 'boolean' },
      { id: 'BT', label: { 'zh-TW': '小比丟', en: 'Billy throws' }, kind: 'endogenous', domain: 'boolean' },
      { id: 'BS', label: { 'zh-TW': '瓶子破', en: 'Bottle shatters' }, kind: 'endogenous', domain: 'boolean' },
    ],
    equations: { ST: 'U_ST', BT: 'U_BT', BS: 'ST or BT' },
  },
  context: { U_ST: 1, U_BT: 1 },
})

const extraModels = [
  {
    id: 'm08-rock-coarse',
    title: { 'zh-TW': '丟石頭的粗模型', en: 'Rock throwing, coarse model' },
    group: { 'zh-TW': '第 8 講', en: 'Lesson 8' },
    doc: coarse,
    links: [{ title: '形式 08：模型的選擇', href: '/blog/formal-08/' }],
  },
]

const html = (props: Parameters<typeof ModelEditor>[0]): string => renderToString(createElement(ModelEditor, props))

/** Each verdict row as `[theory, expected, engine, ok]`, in document order. */
function rows(out: string): string[][] {
  return [...out.matchAll(/<tr[^>]*data-theory="([^"]+)"[^>]*data-expected="([^"]*)"[^>]*data-engine="([^"]*)"[^>]*data-ok="([^"]+)"/g)].map((m) =>
    m.slice(1, 5),
  )
}

describe('ModelEditor case panel', () => {
  it('shows the story, intuition, sources and a verdict row per case verdict that matches the engine', () => {
    const c = getCase('rock-throwing')
    const out = html({ initial: 'rock-throwing' })
    expect(out).toContain('ca-editor-case')
    expect(out).toContain('小蘇的石頭先到')
    expect(out).toContain(c.data.intuition?.text['zh-TW'] ?? 'missing')
    expect(out).toContain('Two concepts of causation')
    const got = rows(out)
    expect(got).toHaveLength(c.data.verdicts.length)
    c.data.verdicts.forEach((v, i) => {
      const check = checkVerdict(c, v)
      expect(got[i]).toEqual([v.theory, String(check.expected), String(check.actual), String(check.ok)])
    })
    // Every page the case cites is shown.
    for (const s of c.data.sources) if (s.pages !== undefined) expect(out).toContain(s.pages)
  })

  it('words the panel in English', () => {
    const out = html({ initial: 'rock-throwing', locale: 'en' })
    expect(out).toContain("Suzy&#x27;s rock arrives first")
    expect(out).toContain(messagesFor('en').editor.verdictTable.heading)
    expect(out).not.toContain('小蘇的石頭先到')
  })

  it('shows a source with its printed page and a link', () => {
    const raw = structuredClone(getCase('rock-throwing').data) as Record<string, unknown> & { sources: Record<string, unknown>[] }
    raw.sources[2] = { ...raw.sources[2], pages: '235–236', citation: `${String(raw.sources[2].citation)} https://doi.org/10.7551/mitpress/1752.003.0010` }
    const c = loadCase(raw)
    const zh = renderToString(createElement(CaseInfo, { c }))
    expect(zh).toContain('第 235–236 頁')
    expect(zh).toContain('href="https://doi.org/10.7551/mitpress/1752.003.0010"')
    const en = renderToString(createElement(CaseInfo, { c, locale: 'en' }))
    expect(en).toContain('pp. 235–236')
  })

  it('lists the host’s lesson links for the case', () => {
    const out = html({ initial: 'rock-throwing', caseLinks: { 'rock-throwing': [{ title: '形式 08：先發制人', href: '/blog/formal-08/' }] } })
    expect(out).toContain(messagesFor('zh-TW').editor.caseLinks)
    expect(out).toContain('href="/blog/formal-08/"')
    expect(out).toContain('形式 08：先發制人')
    expect(html({ initial: 'rock-throwing' })).not.toContain(messagesFor('zh-TW').editor.caseLinks)
  })

  it('keeps variable names typeset in the panel', () => {
    const out = html({ initial: 'rock-throwing' })
    // The case panel follows the inputs.
    const panel = out.slice(out.indexOf('ca-editor-case'), out.indexOf('ca-editor-sources'))
    expect(panel).toContain('ca-story')
    expect(panel).toContain('class="katex"')
  })
})

describe('ModelEditor model list', () => {
  it('lists the bundled cases by family and the host’s models by their group, server-rendered', () => {
    const out = html({ initial: 'rock-throwing', extraModels })
    const zh = messagesFor('zh-TW').editor
    expect(out).toContain('role="listbox"')
    expect(out).toContain(`aria-label="${zh.caseList}"`)
    expect(out).toContain(`aria-label="${zh.search}"`)
    for (const label of ['實際因果', '因果決策', '第 8 講']) expect(out).toContain(`>${label}</`)
    expect(out).toMatch(/role="option"[^>]*data-key="model:m08-rock-coarse"/)
    expect(out).toMatch(/aria-selected="true"[^>]*data-key="rock-throwing"|data-key="rock-throwing"[^>]*aria-selected="true"/)
    expect(out).not.toContain('<optgroup')
    // The narrow layout's button, closed: no dialog on the server.
    expect(out).toContain(zh.pickCase)
    expect(out).not.toContain('role="dialog"')
    expect(out).not.toContain('<dialog')
  })

  it('starts from a host model named by `initial` and shows its title and links, no story', () => {
    const out = html({ initial: 'm08-rock-coarse', extraModels })
    expect(out).toMatch(/aria-selected="true"[^>]*data-key="model:m08-rock-coarse"|data-key="model:m08-rock-coarse"[^>]*aria-selected="true"/)
    expect(out).toMatch(/data-node="BS"/)
    expect(out).not.toMatch(/data-node="SH"/)
    expect(out).toContain('ca-editor-case')
    expect(out).toContain(messagesFor('zh-TW').editor.modelLinks)
    expect(out).toContain('href="/blog/formal-08/"')
    expect(out).not.toContain('ca-story')
    expect(out).not.toContain('data-theory=')
  })

  it('a host model that fails the schema starts blank and shows its problems', () => {
    const bad = { ...coarse, model: { ...coarse.model, variables: [] } } as unknown as ModelDoc
    const out = html({ initial: 'broken', extraModels: [{ id: 'broken', title: 'Broken', doc: bad }] })
    expect(out).toContain('role="alert"')
    expect(out).not.toContain('ca-graph')
  })
})
