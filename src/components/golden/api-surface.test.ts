// The runtime exports of the public entries.
import { describe, expect, it } from 'vitest'
import * as components from '../index.ts'
import * as data from '../../data/index.ts'
import * as engine from '../../engine/index.ts'
import * as caseEntry from '../entries/case.ts'
import * as cite from '../entries/cite.ts'
import * as editor from '../entries/editor.ts'
import * as extension from '../entries/extension.ts'
import * as i18n from '../entries/i18n.ts'
import * as identify from '../entries/identify.ts'
import * as lanes from '../entries/lanes.ts'
import * as playground from '../entries/playground.ts'
import * as probability from '../entries/probability.ts'
import * as supplement from '../entries/supplement.ts'

const subpaths = { case: caseEntry, cite, editor, extension, i18n, identify, lanes, playground, probability, supplement }

describe('public entries', () => {
  it('export the same names', () => {
    expect({ components: Object.keys(components).sort(), engine: Object.keys(engine).sort(), data: Object.keys(data).sort() }).toMatchInlineSnapshot(`
      {
        "components": [
          "CasePage",
          "CausalPlayground",
          "CiteBlock",
          "ConservativeExtension",
          "DEFAULT_LOCALE",
          "IdentifyPanel",
          "LANGUAGE_NAMES",
          "LocaleProvider",
          "ModelEditor",
          "ProbabilityPanel",
          "Supplement",
          "WorldLanes",
          "preloadCase",
        ],
        "data": [
          "LOCALES",
          "MODEL_DOC_FORMAT",
          "buildCase",
          "caseFiles",
          "caseIds",
          "caseSchema",
          "caseToDoc",
          "checkVerdict",
          "decisionProblem",
          "decodeShare",
          "describeVerdict",
          "docToCase",
          "encodeShare",
          "fileId",
          "getCase",
          "listCases",
          "loadCase",
          "localizedSchema",
          "modelDocSchema",
          "parseModelJson",
          "preloadCase",
          "sameModel",
          "schemaProblems",
          "shareFromHash",
          "tableToSource",
        ],
        "engine": [
          "CausalAtlasError",
          "CyclicModelError",
          "DerivationError",
          "DoEvaluator",
          "MAX_CONTEXTS",
          "MAX_EVALUATIONS",
          "MAX_EXPR_EVALUATIONS",
          "MAX_EXTENSION_CHECKS",
          "MAX_IDENTIFY_STEPS",
          "ModelError",
          "PROBLEMS_EN",
          "ParseError",
          "actualCause",
          "admgForPrior",
          "admgOf",
          "asBool",
          "atLeastAsNormal",
          "blame",
          "buildModel",
          "casePieces",
          "causalFormulas",
          "causalRows",
          "checkContextBudget",
          "checkIdentification",
          "coerceToDomain",
          "compareDoExprs",
          "conservativeExtension",
          "contextCount",
          "counterfactual",
          "dSeparation",
          "dependence",
          "derive",
          "descendants",
          "domainValues",
          "enumerateContexts",
          "evalArith",
          "evalExpr",
          "evalFormula",
          "evaluate",
          "evaluateDecision",
          "evaluateProbExpr",
          "formatValue",
          "freeVariables",
          "getVariable",
          "holdsIn",
          "identify",
          "isReservedName",
          "mediation",
          "normalizeAssignment",
          "observedJoint",
          "parseCause",
          "parseExpr",
          "parseFormula",
          "pointMass",
          "probExprLatex",
          "probExprText",
          "probability",
          "problem",
          "problemOf",
          "problemText",
          "renderArith",
          "renderEquation",
          "renderExpr",
          "renderIdent",
          "renderModel",
          "renderValue",
          "responsibility",
          "satisfies",
          "switchId",
          "toArith",
          "toFormula",
          "valuesEqual",
          "withSwitches",
          "witnessStatus",
        ],
      }
    `)
  })

  it('component subpaths export names the root also exports, as the same values', () => {
    for (const [name, entry] of Object.entries(subpaths)) {
      for (const [key, value] of Object.entries(entry)) {
        expect([name, key, (components as Record<string, unknown>)[key] === value]).toEqual([name, key, true])
      }
    }
    expect(Object.fromEntries(Object.entries(subpaths).map(([name, entry]) => [name, Object.keys(entry).sort()]))).toMatchInlineSnapshot(`
      {
        "case": [
          "CasePage",
          "preloadCase",
        ],
        "cite": [
          "CiteBlock",
        ],
        "editor": [
          "ModelEditor",
        ],
        "extension": [
          "ConservativeExtension",
          "preloadCase",
        ],
        "i18n": [
          "DEFAULT_LOCALE",
          "LANGUAGE_NAMES",
          "LocaleProvider",
        ],
        "identify": [
          "IdentifyPanel",
          "preloadCase",
        ],
        "lanes": [
          "WorldLanes",
          "preloadCase",
        ],
        "playground": [
          "CausalPlayground",
          "preloadCase",
        ],
        "probability": [
          "ProbabilityPanel",
          "preloadCase",
        ],
        "supplement": [
          "Supplement",
        ],
      }
    `)
  })
})
