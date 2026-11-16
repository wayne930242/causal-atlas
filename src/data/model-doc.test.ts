import { describe, expect, it } from 'vitest'
import { evaluate } from '../engine/index.ts'
import { caseIds, getCase } from './index.ts'
import { caseToDoc, decodeShare, docToCase, encodeShare, parseModelJson, shareFromHash } from './model-doc.ts'
import type { ModelDoc } from './schema.ts'

describe('model documents', () => {
  it.each(caseIds)('%s turns into a document that builds the same model', (id) => {
    const c = getCase(id)
    const doc = caseToDoc(c)
    const again = docToCase(doc)
    expect(again.model.edges).toEqual(c.model.edges)
    if (c.context !== undefined && again.context !== undefined) {
      expect(evaluate(again.model, again.context).values).toEqual(evaluate(c.model, c.context).values)
    }
  })

  it('writes lookup tables as if-then-else chains', () => {
    const doc = caseToDoc(getCase('newcomb'))
    expect(doc.model.equations.P).toBe(
      "if D='one' and E=0 then 'one' else if D='one' and E=1 then 'two' else if D='two' and E=0 then 'two' else 'one'",
    )
  })
})

describe('share links', () => {
  it('round-trips a model through the hash', async () => {
    const doc = caseToDoc(getCase('rock-throwing'))
    const value = await encodeShare(doc)
    expect(value).toMatch(/^1\.[A-Za-z0-9_-]+$/)
    expect(value.length).toBeLessThan(JSON.stringify(doc).length)
    expect(shareFromHash(`#/editor?model=${value}`)).toBe(value)
    expect(shareFromHash(`#model=${value}`)).toBe(value)
    const back = await decodeShare(value)
    expect(back).toEqual({ ok: true, doc })
  })

  it('rejects other versions and damaged data', async () => {
    const value = await encodeShare(caseToDoc(getCase('rock-throwing')))
    expect(await decodeShare(`2${value.slice(1)}`)).toEqual({ ok: false, errors: ['分享連結的版本 2 不支援'] })
    expect(await decodeShare('1.not-deflate')).toEqual({ ok: false, errors: ['分享連結的資料損壞'] })
  })
})

describe('JSON import', () => {
  const doc: ModelDoc = caseToDoc(getCase('rock-throwing'))

  it('accepts a model document and a whole case file', () => {
    expect(parseModelJson(JSON.stringify(doc))).toEqual({ ok: true, doc })
    const fromCase = parseModelJson(JSON.stringify(getCase('newcomb').data))
    expect(fromCase.ok && fromCase.doc.from).toBe('newcomb')
  })

  it('rejects invalid input with the path of each problem', () => {
    expect(parseModelJson('{').ok).toBe(false)
    const bad = parseModelJson(JSON.stringify({ ...doc, version: 2, layout: { ZZ: [0, 0] } }))
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.errors.join('\n')).toMatch(/version/)
    const unknownVar = parseModelJson(JSON.stringify({ ...doc, layout: { ZZ: [0, 0] } }))
    expect(unknownVar).toEqual({ ok: false, errors: ['layout.ZZ：unknown variable ZZ'] })
    const cyclic = parseModelJson(JSON.stringify({ ...doc, model: { ...doc.model, equations: { ...doc.model.equations, SH: 'BS' } } }))
    expect(cyclic.ok).toBe(false)
    if (!cyclic.ok) expect(cyclic.errors[0]).toMatch(/cyclic: SH → BS → SH|cyclic: BS → SH → BS/)
    const notContext = parseModelJson(JSON.stringify({ ...doc, context: { ST: 1 } }))
    expect(notContext).toEqual({ ok: false, errors: ['context.ST：ST is not exogenous'] })
  })
})
