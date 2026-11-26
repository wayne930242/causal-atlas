import type { Locale } from '../components/index.ts'
import { FrameConditions, IntensionTable, KripkeView, SphereView, StrictImplication, SurgeryVsSimilarity, TcsCheck } from '../modal/index.ts'
import { modalModel } from './modal-models.ts'

/** The `#/modal` demo page: the seven `logic-atlas/modal` figures on the example models. */

const TEXT = {
  'zh-TW': {
    heading: '模態邏輯圖（logic-atlas/modal）',
    intro: '附錄 D 用到的七張圖。模型都是 src/demo/modal-models/ 下的範例，部落格會用自己的模型 JSON。',
    intension: '內涵表（IntensionTable）',
    kripke: 'Kripke 模型（KripkeView，可編輯）',
    frame: '框架條件（FrameConditions）',
    strict: '實質與嚴格蘊涵（StrictImplication）',
    tcs: '傳遞、換質換位、加強前件（TcsCheck）',
    spheres: '同心球（SphereView）',
    surgery: '小手術與相似度（SurgeryVsSimilarity）',
  },
  en: {
    heading: 'Modal logic figures (logic-atlas/modal)',
    intro: 'The seven figures appendix D uses, on the example models in src/demo/modal-models/; the blog brings its own model JSON.',
    intension: 'Intension table (IntensionTable)',
    kripke: 'Kripke model (KripkeView, editable)',
    frame: 'Frame conditions (FrameConditions)',
    strict: 'Material and strict implication (StrictImplication)',
    tcs: 'Transitivity, contraposition, strengthening (TcsCheck)',
    spheres: 'Spheres (SphereView)',
    surgery: 'Surgery against similarity (SurgeryVsSimilarity)',
  },
} as const

export function ModalDemo({ locale }: { readonly locale: Locale }) {
  const d = TEXT[locale]
  return (
    <div className="demo-modal">
      <h1>{d.heading}</h1>
      <p className="demo-muted">{d.intro}</p>
      <h2>{d.intension}</h2>
      <IntensionTable model={modalModel('md-rain-intension')} />
      <h2>{d.kripke}</h2>
      <KripkeView model={modalModel('md-rain-access')} editable />
      <h2>{d.frame}</h2>
      <FrameConditions frame={modalModel('md-time')} initial="reflexive" />
      <h2>{d.strict}</h2>
      <StrictImplication model={modalModel('md-strict')} antecedent="rain" consequent="wet" />
      <h2>{d.tcs}</h2>
      <TcsCheck
        items={[
          { pattern: 'transitivity', model: modalModel('md-carter'), a: 'died', b: '~lost', c: '~reagan' },
          { pattern: 'contraposition', model: modalModel('md-lawn'), a: 'rain', b: '~water' },
          { pattern: 'strengthening', model: modalModel('md-umbrella'), a: 'rain', b: 'umbrella', c: 'stolen' },
        ]}
      />
      <h2>{d.spheres}</h2>
      <SphereView model={modalModel('md-programmer')} />
      <h2>{d.surgery}</h2>
      <SurgeryVsSimilarity model={modalModel('md-nixon')} />
    </div>
  )
}
