import type { ReactNode } from 'react'
import { CausalPlayground, ModelEditor, ProbabilityPanel } from '../components/index.ts'
import { FRONT_DOOR_STEPS } from './front-door-steps.ts'
import { lessonModel } from './lesson-models.ts'
import { SWITCH_RULE_THREE_EXCEPTION, SWITCH_RULE_TWO } from './switch-steps.ts'

/** The doctor's priors (Halpern Ex. 6.2.4) with the probability S that the drug has the side effect. */
const doctorBelieves = (s: number) => ({ independent: { S: s, H: 0.3, N: 0.05, U_T: 1 } })

const PILL = { treatment: 'X', mediators: ['Z'], outcome: 'Y=1', from: 0, to: 1 } as const
const ADMISSION = { treatment: 'X', mediators: ['Z'], outcome: 'Y=1', from: 0, to: 1, formula: true } as const

/**
 * The lesson figures with the interactions of 0.4.0 (and the exogenous node style and latent arcs), one section per item
 * (`#/interactions/<item>`, or all of them). Labels are the lessons' own, in Chinese; the epistemic states
 * of `blame` carry both languages.
 */
const ITEMS: Readonly<Record<string, () => ReactNode>> = {
  'adjust-calc': () => <ProbabilityPanel doc={lessonModel('m05-backdoor')} view="adjust" adjust={{ x: 'X', y: 'Y' }} />,
  editor: () => (
    <ModelEditor
      initial="forest-fire-conjunctive"
      syncUrl={false}
      tasks={[
        {
          id: 'disjunctive',
          title: '只改一條式子，把連言版森林大火改成選言版。',
          prompt: '把 FF 改成：閃電或丟菸蒂，任一個就起火。',
          start: 'forest-fire-conjunctive',
          goal: { equations: { FF: 'L or MD' } },
          predict: { cause: 'L=1', effect: 'FF=1' },
        },
      ]}
    />
  ),
  'cut-graphs': () => <ProbabilityPanel doc={{ ...lessonModel('m05-frontdoor'), latent_as_arcs: ['U'] }} view="rules" rules={FRONT_DOOR_STEPS} />,
  'switch-graphs': () => (
    <>
      <ProbabilityPanel doc={{ ...lessonModel('m05-frontdoor'), latent_as_arcs: ['U'] }} view="rules" rules={SWITCH_RULE_TWO} />
      <ProbabilityPanel doc={lessonModel('m06-rule3-exception')} view="rules" rules={SWITCH_RULE_THREE_EXCEPTION} />
    </>
  ),
  'confound-slider': () => <CausalPlayground caseId="smoking-lesion" sliders={['N_S1']} decision />,
  utilities: () => (
    <>
      <CausalPlayground
        caseId="newcomb"
        sliders={['D']}
        prior={{ D: 0.1, E: 0.1 }}
        decision={{
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
        }}
      />
      <CausalPlayground
        doc={lessonModel('m11-murder-lesion')}
        decision={{
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
        }}
      />
      <CausalPlayground caseId="newcomb" decision />
    </>
  ),
  'truth-table': () => (
    <>
      <CausalPlayground doc={lessonModel('m06-bow-a')} defaultNotation="causal" initialInterventions={{ X: 1 }} />
      <CausalPlayground caseId="forest-fire-disjunctive" defaultNotation="causal" />
    </>
  ),
  'step-chips': () => (
    <>
      <CausalPlayground
        doc={lessonModel('m00-firing-squad-nervous')}
        presets={[
          { label: '第 1 步：看到 A 沒開槍', observed: { A: 0 } },
          { label: '第 2 步：攔住 A', interventions: { A: 0 } },
        ]}
      />
      <CausalPlayground caseId="forest-fire-disjunctive" presets={[{ label: '見證：固定 MD=0，L 改成 0', interventions: { L: 0 }, hold: { MD: 0 } }]} />
    </>
  ),
  trail: () => (
    <>
      <CausalPlayground doc={lessonModel('m02-collider')} track={['Y']} />
      <ProbabilityPanel
        doc={lessonModel('m03-sprinkler')}
        view="compare"
        pair={[
          { event: 'W=1', observe: 'S=1', intervene: { S: 1 } },
          { event: 'W=1', observe: 'S=0', intervene: { S: 0 } },
        ]}
      />
    </>
  ),
  'cf-stepper': () => (
    <>
      <ProbabilityPanel
        doc={lessonModel('m00-firing-squad-nervous')}
        view="counterfactual"
        counterfactual={{ evidence: 'D=1', do: { A: 0 }, event: 'D=0' }}
        actionLabel="已知囚犯死了；若 A 沒開槍？"
      />
      <ProbabilityPanel doc={lessonModel('m02-pearl-model1')} view="counterfactual" counterfactual={{ evidence: 'X=1 and Y=1', do: { X: 0 }, event: 'Y=0' }} initialStep={3} />
      <ProbabilityPanel doc={lessonModel('m02-pearl-model2')} view="counterfactual" counterfactual={{ evidence: 'X=1 and Y=1', do: { X: 0 }, event: 'Y=0' }} initialStep={3} />
    </>
  ),
  'cf-mode': () => (
    <CausalPlayground
      doc={lessonModel('m00-firing-squad-nervous')}
      track={['D']}
      presets={[{ label: '已知 D=1；若 A 沒開槍', observed: { D: 1 }, interventions: { A: 0 } }]}
    />
  ),
  witness: () => (
    <>
      <CausalPlayground caseId="forest-fire-disjunctive" verdicts={[{ cause: 'L=1', effect: 'FF=1' }]} />
      <CausalPlayground
        doc={lessonModel('m09-loaded-gun')}
        verdicts={[
          { cause: 'A=1', effect: 'D=1' },
          { cause: 'C=1', effect: 'D=1' },
        ]}
      />
    </>
  ),
  defaults: () => (
    <>
      <CausalPlayground doc={lessonModel('m01-fire-oxygen')} />
      <CausalPlayground doc={lessonModel('m01-fire-oxygen-lab')} />
      <CausalPlayground caseId="gardener-queen" verdicts={[{ cause: 'QW=0', effect: 'D=1' }]} />
    </>
  ),
  style: () => (
    <>
      <CausalPlayground doc={{ ...lessonModel('m05-frontdoor'), latent_as_arcs: ['U'] }} />
      <CausalPlayground doc={lessonModel('m05-frontdoor')} />
      <CausalPlayground doc={lessonModel('m00-firing-squad-nervous')} />
      <CausalPlayground doc={{ ...lessonModel('m00-firing-squad-nervous'), context: { U: false, W: true }, priors: undefined }} />
      <CausalPlayground
        doc={{
          ...lessonModel('m05-frontdoor'),
          latent_as_arcs: ['U'],
          context: { U: true, N_X1: true, N_X0: false, N_Z1: true, N_Z0: false, N_Y11: true, N_Y10: false, N_Y01: false, N_Y00: false },
          priors: undefined,
        }}
      />
      <ProbabilityPanel doc={{ ...lessonModel('m05-frontdoor'), latent_as_arcs: ['U'] }} view="compare" pair={[{ event: 'Y=1', observe: 'X=1', intervene: { X: 1 } }]} />
    </>
  ),
  dsep: () => (
    <>
      <CausalPlayground doc={lessonModel('m04-admission')} dsep={['G', 'M']} />
      <CausalPlayground doc={lessonModel('m04-tuned')} dsep={['X', 'Y']} />
      <CausalPlayground
        doc={lessonModel('m05-backdoor')}
        dsep={[
          ['X', 'Y'],
          ['Z', 'C'],
        ]}
      />
    </>
  ),
  mediation: () => (
    <>
      <ProbabilityPanel doc={lessonModel('m08-pill')} view="mediation" mediation={PILL} digits={4} />
      <ProbabilityPanel doc={lessonModel('m08-pill')} view="mediation" mediation={{ ...PILL, formula: true }} initialStep={3} digits={4} />
      <ProbabilityPanel doc={lessonModel('m08-sex-department')} view="mediation" mediation={ADMISSION} initialStep={3} digits={3} />
      <ProbabilityPanel doc={lessonModel('m08-sex-department-clean')} view="mediation" mediation={ADMISSION} initialStep={4} digits={3} />
    </>
  ),
  responsibility: () => (
    <>
      <CausalPlayground doc={lessonModel('m10-vote-5-0')} verdicts={[{ cause: 'V1=1', effect: 'W=1', responsibility: true }]} />
      <CausalPlayground doc={lessonModel('m10-vote-3-2')} verdicts={[{ cause: 'V1=1', effect: 'W=1', responsibility: true }]} />
      <CausalPlayground doc={lessonModel('m08-pill-jones')} verdicts={[{ cause: 'X=1', effect: 'Y=1', responsibility: true }]} />
      <CausalPlayground caseId="forest-fire-disjunctive" verdicts={[{ cause: 'L=1', effect: 'FF=1', responsibility: true }]} />
    </>
  ),
  blame: () => (
    <>
      <CausalPlayground
        doc={lessonModel('m10-doctor')}
        blame={{
          cause: 'T=1',
          effect: 'D=1',
          states: [
            { label: { 'zh-TW': '他實際相信的（以為沒有副作用）', en: 'What he believed (no side effect)' }, prior: doctorBelieves(0) },
            { label: { 'zh-TW': '他應該知道的', en: 'What he should have known' } },
            { label: { 'zh-TW': '量完血壓之後', en: 'After testing the blood pressure' }, given: 'H=1' },
            { label: { 'zh-TW': '病人死了之後', en: 'After the patient died' }, given: 'D=1' },
          ],
        }}
      />
      <CausalPlayground doc={lessonModel('m10-suzy-blame')} blame={{ cause: 'ST=1', effect: 'BS=1' }} />
      <CausalPlayground
        doc={lessonModel('m10-faulkner')}
        blame={{
          cause: 'M=1',
          effect: 'ES=1',
          states: [{}, { label: { 'zh-TW': '自殺之後', en: 'After the suicide' }, given: 'ES=1' }],
        }}
      />
    </>
  ),
}

export function Interactions({ item }: { readonly item: string }) {
  const shown = item in ITEMS ? [item] : Object.keys(ITEMS)
  return (
    <div className="demo-article">
      {shown.map((key) => (
        <section key={key} id={key} data-item={key}>
          <h2>{key}</h2>
          {ITEMS[key]()}
        </section>
      ))}
    </div>
  )
}
