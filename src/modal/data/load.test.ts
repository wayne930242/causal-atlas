import { describe, expect, it } from 'vitest'
import { MODAL_MODELS } from '../../demo/modal-models.ts'
import { ModalEvaluator } from '../engine/evaluate.ts'
import { parseFormula } from '../engine/formula.ts'
import { modelOfDoc, parseModalJson, startWorld } from './load.ts'

function codes(input: unknown): string[] {
  const result = parseModalJson(input)
  return result.ok ? [] : result.errors.map((e) => e.code)
}

const KRIPKE = { kind: 'kripke', atoms: [{ id: 'p' }], worlds: [{ id: 'w', true: ['p'] }, { id: 'v' }], access: [['w', 'v']] }

describe('parseModalJson', () => {
  it.each(Object.keys(MODAL_MODELS))('reads the example %s', (id) => {
    const result = parseModalJson(JSON.stringify(MODAL_MODELS[id]))
    expect(result.ok ? 'ok' : result.errors).toBe('ok')
  })

  it('fills in defaults and builds the model', () => {
    const result = parseModalJson(KRIPKE)
    if (!result.ok) throw new Error('expected ok')
    expect(result.doc.kind === 'kripke' && result.doc.layout).toBe('circle')
    expect(startWorld(result.doc)).toBe('w')
    const model = modelOfDoc(result.doc)
    expect(new ModalEvaluator(model).holds(parseFormula('<>~p & p'), 'w')).toBe(true)
  })

  it('reports problems with the path where they sit', () => {
    expect(parseModalJson('{')).toMatchObject({ ok: false, errors: [{ code: 'not-json' }] })
    expect(parseModalJson({ ...KRIPKE, access: [['w', 'x']] })).toEqual({
      ok: false,
      errors: [{ code: 'unknown-world', params: { world: 'x' }, where: 'access.0.1' }],
    })
    expect(codes({ ...KRIPKE, worlds: [{ id: 'w', true: ['q'] }, { id: 'v' }] })).toEqual(['unknown-atom'])
    expect(codes({ ...KRIPKE, worlds: [{ id: 'w' }, { id: 'v' }, { id: 'w' }] })).toEqual(['duplicate-world'])
    expect(codes({ ...KRIPKE, atoms: [{ id: 'p' }, { id: 'true' }] })).toEqual(['reserved-atom'])
    expect(codes({ ...KRIPKE, formulas: ['p >'] })).toEqual(['parse-unexpected-end'])
    expect(codes({ ...KRIPKE, layout: 'manual' })).toEqual(['missing-position', 'missing-position'])
    expect(codes({ ...KRIPKE, worlds: Array.from({ length: 13 }, (_, i) => ({ id: `w${i}` })), access: [] })).toEqual(['too-many-worlds'])
    expect(codes({ kind: 'kripke', worlds: [] })[0]).toBe('schema')
    expect(codes({ kind: 'galaxy' })[0]).toBe('schema')
  })

  it('checks systems of spheres, similarity laws and structural equations', () => {
    const base = { kind: 'spheres', atoms: [{ id: 'p' }, { id: 'q' }], worlds: [{ id: 'w' }, { id: 'v', true: ['p'] }] }
    expect(codes({ ...base, center: 'w', spheres: [['w'], ['w', 'v']] })).toEqual([])
    expect(codes({ ...base, center: 'w', spheres: [['w', 'v'], ['w']] })).toEqual(['spheres-not-nested'])
    expect(codes({ ...base, center: 'w', spheres: [['w', 'v']] })).toEqual(['centering'])
    expect(codes({ ...base, center: 'w', spheres: [['w', 'v']], centering: 'weak' })).toEqual([])
    expect(codes({ ...base, spheres: [['w']] })).toEqual(['spheres-source'])
    expect(codes({ ...base, center: 'w' })).toEqual(['spheres-source'])
    expect(codes({ ...base, systems: { w: [['w']], v: [['v'], ['v', 'w']] } })).toEqual([])
    expect(codes({ ...base, center: 'w', similarity: { laws: [{ formula: '[]p' }] } })).toEqual(['not-truth-functional'])
    expect(codes({ ...base, center: 'w', similarity: { weights: { r: 2 } } })).toEqual(['unknown-atom'])
    expect(codes({ ...base, center: 'w', similarity: {}, structural: { equations: { p: 'q', q: 'p' } } })).toEqual(['cyclic-equations'])
  })

  it('draws similarity spheres around the centre, with weights the host may override', () => {
    const result = parseModalJson(MODAL_MODELS['md-nixon'])
    if (!result.ok) throw new Error('expected ok')
    const heavy = new ModalEvaluator(modelOfDoc(result.doc))
    expect(heavy.counterfactual(parseFormula('press'), parseFormula('war'), 'w')).toMatchObject({ selected: ['p'], value: false })
    const light = new ModalEvaluator(modelOfDoc(result.doc, { war: 0.5 }))
    expect(light.counterfactual(parseFormula('press'), parseFormula('war'), 'w')).toMatchObject({ selected: ['pcw'], value: true })
  })
})
