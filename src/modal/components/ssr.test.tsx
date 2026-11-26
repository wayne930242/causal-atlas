// Runs in the node environment: no window, no document.
import type { FunctionComponent } from 'react'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { modalModel } from '../../demo/modal-models.ts'

const FIGURES = [
  ['IntensionTable', { model: modalModel('md-rain-intension') }, 'ca-modal-intension'],
  ['KripkeView', { model: modalModel('md-rain-access'), editable: true }, 'data-world="v"'],
  ['FrameConditions', { frame: modalModel('md-time') }, 'data-condition="transitive"'],
  ['StrictImplication', { model: modalModel('md-strict'), antecedent: 'rain', consequent: 'wet' }, 'data-kind="strict"'],
  [
    'TcsCheck',
    { items: [{ pattern: 'strengthening', model: modalModel('md-umbrella'), a: 'rain', b: 'umbrella', c: 'stolen' }] },
    'data-counterexample="true"',
  ],
  ['SphereView', { model: modalModel('md-programmer') }, 'data-sphere="1"'],
  ['SurgeryVsSimilarity', { model: modalModel('md-nixon') }, 'data-agree="false"'],
] as const

describe('modal figures on the server', () => {
  it('import without a DOM', async () => {
    expect(typeof globalThis.window).toBe('undefined')
    const mod = await import('../index.ts')
    expect(typeof mod.KripkeView).toBe('function')
  })

  it.each(FIGURES)('render %s with its figure in the markup, in both languages', async (name, props, marker) => {
    const mod = (await import('../index.ts')) as unknown as Record<string, FunctionComponent<object>>
    const figure = mod[name] as FunctionComponent<object>
    const zh = renderToString(createElement(figure, props as object))
    const en = renderToString(createElement(figure, { ...props, locale: 'en' } as object))
    expect(zh).toContain(marker)
    expect(en).toContain(marker)
    expect(zh).toContain('lang="zh-TW"')
    expect(en).toContain('lang="en"')
    expect(zh).not.toContain('ca-doc-error')
  })

  it('shows the problems of a document it cannot draw', async () => {
    const { KripkeView, SphereView } = await import('../index.ts')
    const bad = renderToString(createElement(KripkeView, { model: { kind: 'kripke', worlds: [{ id: 'w' }], access: [['w', 'x']] } }))
    expect(bad).toContain('data-code="unknown-world"')
    expect(bad).toContain('沒有世界 x')
    const wrong = renderToString(createElement(SphereView, { model: modalModel('md-time'), locale: 'en' }))
    expect(wrong).toContain('data-code="wrong-kind"')
    expect(wrong).toContain('needs a spheres document')
  })
})
