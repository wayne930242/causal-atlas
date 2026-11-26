import type { ModalProblemWording } from '../engine/errors.ts'
import { MODAL_PROBLEMS_EN } from '../engine/errors.ts'
import type { FrameCondition, ModalSystem } from '../engine/frames.ts'
import type { TcsPattern } from '../engine/inference.ts'
import type { ModalMessages } from './zh.ts'

/** The modal components' interface text in English. */

const list = (xs: readonly string[]): string => (xs.length <= 2 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)
const set = (xs: readonly string[]): string => (xs.length === 0 ? '∅' : `{${xs.join(', ')}}`)

const EN_PROBLEMS: ModalProblemWording = MODAL_PROBLEMS_EN

export const MODAL_EN: ModalMessages = {
  locale: 'en',
  problems: EN_PROBLEMS,
  docInvalid: 'This model cannot be drawn:',
  trueWord: 'true',
  falseWord: 'false',
  world: 'World',
  formula: 'Formula',
  formulas: 'Formulas',
  truthSet: 'Truth set',
  intensionCaption: 'Intension: each world gives the sentence a truth value',
  selectWorld: (w) => `Select world ${w}`,
  selectFormula: (f) => `Select formula ${f}`,
  worldGraph: (n) => `Possible worlds, ${n} ${n === 1 ? 'world' : 'worlds'}`,
  worldState: (w, atoms) => (atoms.length === 0 ? `World ${w}: no atom true` : `World ${w}: ${list(atoms)} true`),
  atomsHeading: 'Atoms',
  at: (w) => `At ${w}`,
  noAccess: (w) => `${w} sees no world`,
  boxTrue: (w, arg, seen) => (seen.length === 0 ? `${w} sees no world, so □${arg} is vacuously true.` : `Every world ${w} sees (${list(seen)}) makes ${arg} true.`),
  boxFalse: (w, arg, v) => `${w} sees ${v}, where ${arg} is false: a counterexample.`,
  diaTrue: (w, arg, v) => `${w} sees ${v}, where ${arg} is true: a witness.`,
  diaFalse: (w, arg, seen) => (seen.length === 0 ? `${w} sees no world, so ◇${arg} is false.` : `Every world ${w} sees (${list(seen)}) makes ${arg} false.`),
  plainValue: (w, value) => `${value ? 'True' : 'False'} at ${w}.`,
  customFormula: 'Type a formula',
  add: 'Add',
  editHeading: 'Edit the model',
  accessHeading: 'Accessibility',
  accessToggle: (a, b) => `${a} sees ${b}`,
  atomToggle: (w, atom) => `${atom} true at ${w}`,
  showFalse: 'Also list false atoms',
  conditionHeading: 'Frame condition',
  holdsHeading: 'Holds',
  axiomHeading: 'Axiom',
  validHeading: 'Valid on the frame',
  conditionName: { serial: 'serial', reflexive: 'reflexive', transitive: 'transitive', symmetric: 'symmetric', euclidean: 'euclidean' } satisfies Readonly<Record<FrameCondition, string>>,
  conditionRule: {
    serial: 'every world sees some world',
    reflexive: 'every world sees itself',
    transitive: 'if wRv and vRu, then wRu',
    symmetric: 'if wRv, then vRw',
    euclidean: 'if wRv and wRu, then vRu',
  } satisfies Readonly<Record<FrameCondition, string>>,
  conditionWitness: (c, w) => {
    const [a = '', b = '', d = ''] = w
    switch (c) {
      case 'serial':
        return `${a} sees no world`
      case 'reflexive':
        return `${a} does not see itself`
      case 'symmetric':
        return `${a}R${b} but not ${b}R${a}`
      case 'transitive':
        return `${a}R${b} and ${b}R${d} but not ${a}R${d}`
      case 'euclidean':
        return `${a}R${b} and ${a}R${d} but not ${b}R${d}`
    }
  },
  axiomName: (name) => (name === 'M' ? 'M (also called T)' : name),
  axiomCounterexample: (trueAt, w) =>
    `with ${Object.entries(trueAt)
      .map(([a, ws]) => `${a} true exactly at ${set(ws)}`)
      .join(' and ')}, the axiom is false at ${w}`,
  yes: 'yes',
  no: 'no',
  systemName: (s: ModalSystem) => (s === 'M' ? 'M (also called T)' : s),
  systemsLine: (names) => `This frame is in the frame classes of ${list(names)}.`,
  materialHeading: 'Material conditional',
  strictHeading: 'Strict implication',
  strictTrue: (w) => `At every world ${w} sees where the antecedent is true, the consequent is true too.`,
  strictFalse: (w, bad) => `${w} sees ${list(bad)}, where the antecedent is true and the consequent false.`,
  materialTrue: (w, aFalse) => (aFalse ? `At ${w} the antecedent is false, so the material conditional is true.` : `At ${w} antecedent and consequent are both true.`),
  materialFalse: (w) => `At ${w} the antecedent is true and the consequent false.`,
  patternName: { transitivity: 'Transitivity', contraposition: 'Contraposition', strengthening: 'Strengthening the antecedent' } satisfies Readonly<Record<TcsPattern, string>>,
  exampleTitle: (pattern, title) => `${pattern}: ${title}`,
  premise: 'Premise',
  conclusion: 'Conclusion',
  counterfactualHeading: 'Spheres (counterfactual)',
  collapse: 'Press into one sphere',
  collapseHint: 'Press all spheres into the outermost one: every antecedent then uses the same range of worlds, and the counterfactual becomes strict implication.',
  inferenceCounterexample: (w) => `At ${w} the premises are true and the conclusion false: the inference fails.`,
  inferenceHolds: (w) => `At ${w} no premise set is true with the conclusion false: the inference holds.`,
  inferenceVacuous: (w) => `At ${w} not every premise is true, so there is no counterexample here.`,
  semanticsLabel: 'Semantics for conditionals',
  sphereName: (i) => `S${i + 1}`,
  center: 'centre',
  antecedentWorlds: 'Antecedent worlds',
  closestWorlds: 'Closest antecedent worlds',
  closestList: (ws) => `Closest antecedent worlds: ${list(ws)}`,
  vacuous: 'No sphere holds an antecedent world, so the conditional is vacuously true.',
  smallestSphere: (s, ws) => `The smallest sphere holding an antecedent world is ${s}; its antecedent worlds are ${list(ws)}.`,
  cfTrue: 'Every closest antecedent world makes the consequent true, so the conditional is true.',
  cfFalse: (ws) => `${list(ws)} ${ws.length === 1 ? 'makes' : 'make'} the consequent false, so the conditional is false.`,
  notUnique: (ws) => `Stalnaker's selection function is undefined here: the closest antecedent worlds are ${list(ws)}, more than one. Conditional excluded middle is not guaranteed.`,
  needsConditional: 'Choose a formula of the form A > B.',
  similarityHeading: 'By similarity (Lewis)',
  surgeryHeading: 'Minimal surgery (Pearl)',
  weightsHeading: 'Weights',
  weightLabel: (atom) => `differs from the actual ${atom}`,
  lawLabel: (law) => `violates ${law}`,
  distance: 'Distance',
  approxNote: 'Distance as a sum of weights is only a numeric stand-in for Lewis’s (1979) priorities of similarity.',
  intervention: (vals) => `Intervention: ${vals} replaced by constants, every other equation kept; atoms without an equation keep their value at the centre.`,
  solution: 'The submodel’s solution',
  solutionWorld: (w) => (w === undefined ? 'No world in the model matches this solution.' : `This solution is world ${w}.`),
  agree: 'The two semantics agree.',
  diverge: 'The two semantics disagree.',
  equationsHeading: 'Structural equations',
}
