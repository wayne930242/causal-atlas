import { FRONT_DOOR_STEPS } from '../front-door-steps.ts'
import { RULE_ONE_STEPS } from '../rule-one-steps.ts'
import { SWITCH_RULE_THREE_EXCEPTION, SWITCH_RULE_TWO } from '../switch-steps.ts'
import type { DocPatch, ModelSource } from './model-info.ts'
import type { ComponentId } from './registry.ts'

/** A ready-made figure: the component, its model and its props. The `Interactions` page's figures, one story each. */
export interface Story {
  readonly id: string
  readonly component: ComponentId
  readonly source: ModelSource
  readonly patch?: DocPatch
  readonly args: Readonly<Record<string, unknown>>
  /** The `Interactions` item it comes from (`#/interactions/<item>`). */
  readonly item?: string
}

const L = (id: string): ModelSource => ({ kind: 'lesson', id })
const C = (id: string): ModelSource => ({ kind: 'case', id })

const PILL = { treatment: 'X', mediators: ['Z'], outcome: 'Y=1', from: 0, to: 1 }
const ADMISSION = { treatment: 'X', mediators: ['Z'], outcome: 'Y=1', from: 0, to: 1, formula: true }
const ARCS: DocPatch = { latent_as_arcs: ['U'] }
const doctorBelieves = (s: number) => ({ independent: { S: s, H: 0.3, N: 0.05, U_T: 1 } })
const NEWCOMB_UTILITY = {
  variable: 'A',
  utility: {
    variables: ['A', 'M'],
    rows: [
      ['one', 1, 100],
      ['one', 0, 0],
      ['two', 1, 101],
      ['two', 0, 10],
    ],
  },
}
const MURDER_UTILITY = {
  variable: 'S',
  utility: {
    variables: ['S', 'H'],
    rows: [
      [1, 1, 10],
      [1, 0, -10],
      [0, 0, 0],
      [0, 1, 0],
    ],
  },
}
const RESPONSIBLE = (cause: string, effect: string) => ({ verdicts: [{ cause, effect, responsibility: true }] })
const NO_ARCS_CONTEXT: DocPatch = {
  context: { U: true, N_X1: true, N_X0: false, N_Z1: true, N_Z0: false, N_Y11: true, N_Y10: false, N_Y01: false, N_Y00: false },
  priors: null,
}

function story(item: string, n: number, component: ComponentId, source: ModelSource, args: Record<string, unknown>, patch?: DocPatch): Story {
  return { id: n === 1 ? item : `${item}-${n}`, item, component, source, args, ...(patch === undefined ? {} : { patch }) }
}

const basics: Story[] = [
  { id: 'playground-basic', component: 'playground', source: C('rock-throwing'), args: {} },
  { id: 'probability-basic', component: 'probability', source: L('m03-sprinkler'), args: {} },
  { id: 'identify-basic', component: 'identify', source: L('m05-frontdoor'), args: { query: { x: 'X', y: 'Y' } } },
  { id: 'identify-bow', component: 'identify', source: L('m06-bow-a'), args: { query: { x: 'X', y: 'Y' } } },
  { id: 'lanes-basic', component: 'lanes', source: C('rock-throwing'), args: { interventions: { SH: 0 }, actionLabel: '攔下小蘇的石頭' } },
  {
    id: 'lanes-witness',
    component: 'lanes',
    source: C('rock-throwing'),
    args: { interventions: { ST: 0 }, actionLabel: '小蘇沒丟', witness: { cause: 'ST=1', effect: 'BS=1' } },
  },
  { id: 'case-basic', component: 'case', source: C('rock-throwing'), args: {} },
  { id: 'editor-basic', component: 'editor', source: C('rock-throwing'), args: {} },
  { id: 'cite-basic', component: 'cite', source: { kind: 'blank' }, args: {} },
]

const lessons: Story[] = [
  story('adjust-calc', 1, 'probability', L('m05-backdoor'), { view: 'adjust', adjust: { x: 'X', y: 'Y' } }),
  story('editor', 1, 'editor', C('forest-fire-conjunctive'), {
    tasks: [
      {
        id: 'disjunctive',
        title: '只改一條式子，把連言版森林大火改成選言版。',
        prompt: '把 FF 改成：閃電或丟菸蒂，任一個就起火。',
        start: 'forest-fire-conjunctive',
        goal: { equations: { FF: 'L or MD' } },
        predict: { cause: 'L=1', effect: 'FF=1' },
      },
    ],
  }),
  story('cut-graphs', 1, 'probability', L('m05-frontdoor'), { view: 'rules', rules: FRONT_DOOR_STEPS }, ARCS),
  story('rule-one', 1, 'probability', L('m06-rule1'), { view: 'rules', rules: RULE_ONE_STEPS }),
  story('switch-graphs', 1, 'probability', L('m05-frontdoor'), { view: 'rules', rules: SWITCH_RULE_TWO }, ARCS),
  story('switch-graphs', 2, 'probability', L('m06-rule3-exception'), { view: 'rules', rules: SWITCH_RULE_THREE_EXCEPTION }),
  story('confound-slider', 1, 'playground', C('smoking-lesion'), { sliders: ['N_S1'], decision: true }),
  story('utilities', 1, 'playground', C('newcomb'), { sliders: ['D'], prior: { D: 0.1, E: 0.1 }, decision: NEWCOMB_UTILITY }),
  story('utilities', 2, 'playground', L('m11-murder-lesion'), { decision: MURDER_UTILITY }),
  story('utilities', 3, 'playground', C('newcomb'), { decision: true }),
  story('truth-table', 1, 'playground', L('m06-bow-a'), { defaultNotation: 'causal', initialInterventions: { X: 1 } }),
  story('truth-table', 2, 'playground', C('forest-fire-disjunctive'), { defaultNotation: 'causal' }),
  story('step-chips', 1, 'playground', L('m00-firing-squad-nervous'), {
    presets: [
      { label: '第 1 步：看到 A 沒開槍', observed: { A: 0 } },
      { label: '第 2 步：攔住 A', interventions: { A: 0 } },
    ],
  }),
  story('step-chips', 2, 'playground', C('forest-fire-disjunctive'), {
    presets: [{ label: '見證：固定 MD=0，L 改成 0', interventions: { L: 0 }, hold: { MD: 0 } }],
  }),
  story('trail', 1, 'playground', L('m02-collider'), { track: ['Y'] }),
  story('trail', 2, 'probability', L('m03-sprinkler'), {
    view: 'compare',
    pair: [
      { event: 'W=1', observe: 'S=1', intervene: { S: 1 } },
      { event: 'W=1', observe: 'S=0', intervene: { S: 0 } },
    ],
  }),
  story('cf-stepper', 1, 'probability', L('m00-firing-squad-nervous'), {
    view: 'counterfactual',
    counterfactual: { evidence: 'D=1', do: { A: 0 }, event: 'D=0' },
    actionLabel: '已知囚犯死了；若 A 沒開槍？',
  }),
  story('cf-stepper', 2, 'probability', L('m02-pearl-model1'), {
    view: 'counterfactual',
    counterfactual: { evidence: 'X=1 and Y=1', do: { X: 0 }, event: 'Y=0' },
    initialStep: 3,
  }),
  story('cf-stepper', 3, 'probability', L('m02-pearl-model2'), {
    view: 'counterfactual',
    counterfactual: { evidence: 'X=1 and Y=1', do: { X: 0 }, event: 'Y=0' },
    initialStep: 3,
  }),
  story('cf-mode', 1, 'playground', L('m00-firing-squad-nervous'), {
    track: ['D'],
    presets: [{ label: '已知 D=1；若 A 沒開槍', observed: { D: 1 }, interventions: { A: 0 } }],
  }),
  story('witness', 1, 'playground', C('forest-fire-disjunctive'), { verdicts: [{ cause: 'L=1', effect: 'FF=1' }] }),
  story('witness', 2, 'playground', L('m09-loaded-gun'), {
    verdicts: [
      { cause: 'A=1', effect: 'D=1' },
      { cause: 'C=1', effect: 'D=1' },
    ],
  }),
  story('defaults', 1, 'playground', L('m01-fire-oxygen'), {}),
  story('defaults', 2, 'playground', L('m01-fire-oxygen-lab'), {}),
  story('defaults', 3, 'playground', C('gardener-queen'), { verdicts: [{ cause: 'QW=0', effect: 'D=1' }] }),
  story('style', 1, 'playground', L('m05-frontdoor'), {}, ARCS),
  story('style', 2, 'playground', L('m05-frontdoor'), {}),
  story('style', 3, 'playground', L('m00-firing-squad-nervous'), {}),
  story('style', 4, 'playground', L('m00-firing-squad-nervous'), {}, { context: { U: false, W: true }, priors: null }),
  story('style', 5, 'playground', L('m05-frontdoor'), {}, { ...ARCS, ...NO_ARCS_CONTEXT }),
  story('style', 6, 'probability', L('m05-frontdoor'), { view: 'compare', pair: [{ event: 'Y=1', observe: 'X=1', intervene: { X: 1 } }] }, ARCS),
  story('dsep', 1, 'playground', L('m04-admission'), { dsep: [['G', 'M']] }),
  story('dsep', 2, 'playground', L('m04-tuned'), { dsep: [['X', 'Y']] }),
  story('dsep', 3, 'playground', L('m05-backdoor'), {
    dsep: [
      ['X', 'Y'],
      ['Z', 'C'],
    ],
  }),
  story('mediation', 1, 'probability', L('m08-pill'), { view: 'mediation', mediation: PILL, digits: 4 }),
  story('mediation', 2, 'probability', L('m08-pill'), { view: 'mediation', mediation: { ...PILL, formula: true }, initialStep: 3, digits: 4 }),
  story('mediation', 3, 'probability', L('m08-sex-department'), { view: 'mediation', mediation: ADMISSION, initialStep: 3, digits: 3 }),
  story('mediation', 4, 'probability', L('m08-sex-department-clean'), { view: 'mediation', mediation: ADMISSION, initialStep: 4, digits: 3 }),
  story('responsibility', 1, 'playground', L('m10-vote-5-0'), RESPONSIBLE('V1=1', 'W=1')),
  story('responsibility', 2, 'playground', L('m10-vote-3-2'), RESPONSIBLE('V1=1', 'W=1')),
  story('responsibility', 3, 'playground', L('m08-pill-jones'), RESPONSIBLE('X=1', 'Y=1')),
  story('responsibility', 4, 'playground', C('forest-fire-disjunctive'), RESPONSIBLE('L=1', 'FF=1')),
  story('blame', 1, 'playground', L('m10-doctor'), {
    blame: {
      cause: 'T=1',
      effect: 'D=1',
      states: [
        { label: { 'zh-TW': '他實際相信的（以為沒有副作用）', en: 'What he believed (no side effect)' }, prior: doctorBelieves(0) },
        { label: { 'zh-TW': '他應該知道的', en: 'What he should have known' } },
        { label: { 'zh-TW': '量完血壓之後', en: 'After testing the blood pressure' }, given: 'H=1' },
        { label: { 'zh-TW': '病人死了之後', en: 'After the patient died' }, given: 'D=1' },
      ],
    },
  }),
  story('blame', 2, 'playground', L('m10-suzy-blame'), { blame: { cause: 'ST=1', effect: 'BS=1' } }),
  story('blame', 3, 'playground', L('m10-faulkner'), {
    blame: {
      cause: 'M=1',
      effect: 'ES=1',
      states: [{}, { label: { 'zh-TW': '自殺之後', en: 'After the suicide' }, given: 'ES=1' }],
    },
  }),
]

export const STORIES: readonly Story[] = [...basics, ...lessons]

export function getStory(id: string): Story | undefined {
  return STORIES.find((s) => s.id === id)
}

/** The story a component opens on when picked: its `-basic` one. */
export function basicStory(component: ComponentId): Story {
  const found = STORIES.find((s) => s.id === `${component}-basic`)
  if (found === undefined) throw new Error(`no basic story for ${component}`)
  return found
}

export function storiesOf(component: ComponentId): readonly Story[] {
  return STORIES.filter((s) => s.component === component)
}
