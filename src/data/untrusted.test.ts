import { describe, expect, it } from 'vitest'
import { evaluate, problem, problemText } from '../engine/index.ts'
import { getCase } from './index.ts'
import { caseToDoc, decodeShare, docToCase, encodeShare, parseModelJson, shareFromHash } from './model-doc.ts'
import type { ModelDoc } from './schema.ts'
import { modelDocSchema } from './schema.ts'

const label = { 'zh-TW': 'x', en: 'x' }

function b64url(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** n independent exogenous booleans and Y = U0 or … or U(n-1), as a probabilistic document. */
function wideDoc(n: number): unknown {
  const ids = Array.from({ length: n }, (_, i) => `U${i}`)
  return {
    format: 'causal-atlas/model',
    version: 1,
    title: 't',
    model: {
      variables: [...ids.map((id) => ({ id, label, kind: 'exogenous', domain: 'boolean' })), { id: 'Y', label, kind: 'endogenous', domain: 'boolean' }],
      equations: { Y: ids.join(' or ') },
    },
    priors: { independent: Object.fromEntries(ids.map((id) => [id, 0.5])) },
  }
}

function tinyDoc(extra: Record<string, unknown> = {}, variables: unknown[] = []): Record<string, unknown> {
  return {
    format: 'causal-atlas/model',
    version: 1,
    title: 't',
    model: {
      variables: [{ id: 'U', label, kind: 'exogenous', domain: 'boolean' }, ...variables],
      equations: {},
    },
    context: { U: 1 },
    ...extra,
  }
}

describe('REV-F001: input that would take exponential time or space', () => {
  it('rejects a probabilistic model with too many contexts when it is imported', () => {
    const started = Date.now()
    const result = parseModelJson(JSON.stringify(wideDoc(24)))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.map((e) => problemText(e)).join('\n')).toMatch(/too many contexts/)
    expect(Date.now() - started).toBeLessThan(1000)
  })

  it('rejects the same model arriving as a share link', async () => {
    // encodeShare validates the document, which does not check the build; build the link by hand.
    const text = JSON.stringify(wideDoc(24))
    const packed = await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()
    const value = `1.${b64url(packed)}`
    const result = await decodeShare(value)
    expect(result.ok).toBe(false)
  })

  it('caps the number of variables and the size of a domain', () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ id: `E${i}`, label, kind: 'endogenous', domain: 'boolean' }))
    const tooMany = modelDocSchema.safeParse({ ...tinyDoc(), model: { variables: [{ id: 'U', label, kind: 'exogenous', domain: 'boolean' }, ...many], equations: {} } })
    expect(tooMany.success).toBe(false)
    const wide = Array.from({ length: 200 }, (_, i) => `v${i}`)
    const tooWide = modelDocSchema.safeParse(tinyDoc({}, [{ id: 'A', label, kind: 'endogenous', domain: wide }]))
    expect(tooWide.success).toBe(false)
  })
})

describe('REV-F003: untrusted input never throws', () => {
  it('survives a malformed percent escape in the hash', async () => {
    const value = shareFromHash('#model=%E0%A4%A')
    expect(value).toBeDefined()
    expect((await decodeShare(value ?? '')).ok).toBe(false)
  })

  it('reports a cyclic case file instead of throwing', () => {
    const cyclic = {
      id: 'x',
      title: label,
      family: 'actual',
      story: label,
      explanation: label,
      copy_status: { 'zh-TW': 'draft', en: 'draft' },
      sources: [{ citation: 'c', role: 'origin', verified: false }],
      model: {
        variables: [
          { id: 'A', label, kind: 'endogenous', domain: 'boolean' },
          { id: 'B', label, kind: 'endogenous', domain: 'boolean' },
        ],
        equations: { A: 'B', B: 'A' },
      },
      context: {},
      verdicts: [{ theory: 'butfor', query: { cause: 'A=1', effect: 'B=1' }, expected: 'cause' }],
      showcase: [],
    }
    const result = parseModelJson(JSON.stringify(cyclic))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors[0].code).toBe('cyclic')
  })
})

describe('REV-F004: size caps', () => {
  it('rejects a share link longer than 64 KB', async () => {
    const result = await decodeShare(`1.${'A'.repeat(70_000)}`)
    expect(result).toEqual({ ok: false, errors: [problem('too-large', {})] })
  })

  it('rejects a link that inflates past 1 MB', async () => {
    const bomb = new Uint8Array(4_000_000).fill(32)
    const packed = await new Response(new Blob([bomb]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()
    const value = `1.${b64url(packed)}`
    expect(value.length).toBeLessThan(65_536)
    expect(await decodeShare(value)).toEqual({ ok: false, errors: [problem('too-large', {})] })
  })

  it('rejects pasted JSON longer than 1 MB', () => {
    expect(parseModelJson(' '.repeat(1_100_000))).toEqual({ ok: false, errors: [problem('too-large', {})] })
  })

  it('still takes a normal document', async () => {
    const doc = caseToDoc(getCase('newcomb'))
    expect(await decodeShare(await encodeShare(doc))).toEqual({ ok: true, doc })
  })
})

describe('REV-F005: ids that collide with Object.prototype or the equation syntax', () => {
  it.each(['toString', 'constructor', '__proto__', 'hasOwnProperty'])('the schema rejects %s as a variable id', (id) => {
    const doc = tinyDoc({}, [{ id, label, kind: 'endogenous', domain: 'boolean' }])
    expect(modelDocSchema.safeParse(doc).success).toBe(false)
    const text = JSON.stringify(doc).replace(`"id":"${id}"`, `"id":"${id}"`)
    expect(parseModelJson(text).ok).toBe(false)
  })

  it.each(['and', 'or', 'not', 'if', 'then', 'else', 'true', 'false', 'iff', 'implies'])('the schema rejects the keyword %s', (id) => {
    expect(modelDocSchema.safeParse(tinyDoc({}, [{ id, label, kind: 'endogenous', domain: 'boolean' }])).success).toBe(false)
  })

  it('does not let a __proto__ key in the context or layout through', () => {
    const text =
      '{"format":"causal-atlas/model","version":1,"title":"t","model":{"variables":[{"id":"U","label":{"zh-TW":"x","en":"x"},"kind":"exogenous","domain":"boolean"}],"equations":{}},"context":{"U":1,"__proto__":{"polluted":1}},"layout":{"U":[0,0],"__proto__":[1,1]}}'
    const result = parseModelJson(text)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    if (result.ok) {
      expect(Object.hasOwn(result.doc.context ?? {}, '__proto__')).toBe(false)
      expect(Object.hasOwn(result.doc.layout ?? {}, '__proto__')).toBe(false)
    }
  })

  it('evaluates ordinary models unchanged', () => {
    const doc: ModelDoc = caseToDoc(getCase('rock-throwing'))
    const c = docToCase(doc)
    expect(evaluate(c.model, c.context ?? {}).values.BS).toBe(true)
  })
})
