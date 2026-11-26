import { describe, expect, it } from 'vitest'
import { MODAL_MODELS } from '../demo/modal-models.ts'
import * as modal from './index.ts'
import { parseModalJson } from './data/load.ts'
import { docGraphInput } from './components/doc-graph.ts'
import { labelsOverlap, layoutWorldGraph } from './components/world-graph.ts'
import { MODAL_EN } from './i18n/en.ts'
import { MODAL_ZH } from './i18n/zh.ts'

/** Interface text lives in i18n/ (zh.ts, en.ts). Any other modal source with a CJK character outside a comment is a forgotten string. */
const sources: Record<string, string> = import.meta.glob(['./**/*.ts', './**/*.tsx', '!./**/*.test.ts', '!./**/*.test.tsx', '!./i18n/*.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

const CJK = /[　-〿㐀-䶿一-鿿＀-￯]+/g

function withoutComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
}

describe('modal interface text', () => {
  it('comes only from the string tables', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(15)
    const stray = Object.entries(sources).flatMap(([path, code]) => (withoutComments(code).match(CJK) ?? []).map((hit) => `${path}: ${hit}`))
    expect(stray).toEqual([])
  })

  it('has the same keys in both languages', () => {
    expect(Object.keys(MODAL_EN).sort()).toEqual(Object.keys(MODAL_ZH).sort())
    expect(Object.keys(MODAL_EN.problems.messages).sort()).toEqual(Object.keys(MODAL_ZH.problems.messages).sort())
  })
})

describe('logic-atlas/modal', () => {
  it('exports these names', () => {
    expect(Object.keys(modal).sort()).toMatchInlineSnapshot(`
      [
        "ATOM_PATTERN",
        "AXIOMS",
        "CONDITION_AXIOM",
        "DEFAULT_LOCALE",
        "F",
        "FRAME_CONDITIONS",
        "FrameConditions",
        "IntensionTable",
        "KripkeView",
        "LANGUAGE_NAMES",
        "LocaleProvider",
        "MAX_ASSIGNMENTS",
        "MAX_DOC_WORLDS",
        "MAX_ENGINE_WORLDS",
        "MODAL_PROBLEMS_EN",
        "ModalError",
        "ModalEvaluator",
        "SYSTEMS",
        "SYSTEM_CONDITIONS",
        "SphereView",
        "StrictImplication",
        "SurgeryVsSimilarity",
        "TCS_PATTERNS",
        "TcsCheck",
        "accessFromPairs",
        "accessPairs",
        "atomsOf",
        "checkCondition",
        "checkInference",
        "checkInferenceAt",
        "checkModalDoc",
        "checkSystem",
        "collapseSpheres",
        "distances",
        "equationOrder",
        "explain",
        "formulaKey",
        "formulaLatex",
        "formulaText",
        "frameDocSchema",
        "frameOf",
        "frameOfDoc",
        "holds",
        "intension",
        "isAtomId",
        "isTruthFunctional",
        "kripkeDocSchema",
        "kripkeModel",
        "literalsOf",
        "modalDocSchema",
        "modalProblem",
        "modalProblemOf",
        "modalProblemText",
        "modelOfDoc",
        "operatorSymbol",
        "parseFormula",
        "parseModalJson",
        "printFormula",
        "similarityOf",
        "similaritySpheres",
        "sphereModel",
        "spheresDocSchema",
        "structuralEquations",
        "surgery",
        "systemsOf",
        "tcsInference",
        "truthSet",
        "validOnFrame",
        "withSimilaritySpheres",
        "worldWith",
      ]
    `)
  })
})

describe('Kripke picture layout', () => {
  it.each(Object.keys(MODAL_MODELS))('keeps the world names of %s apart', (id) => {
    const result = parseModalJson(MODAL_MODELS[id])
    if (!result.ok) throw new Error(id)
    const doc = result.doc
    if (doc.kind === 'spheres') return
    for (const showFalse of [false, true]) {
      const layout = layoutWorldGraph(docGraphInput(doc, 'zh-TW', { showFalse, notation: 'modern', mergeSymmetric: true }))
      expect(labelsOverlap(layout)).toBe(false)
    }
  })
})
