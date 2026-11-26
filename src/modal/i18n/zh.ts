import type { Locale } from '../../engine/types.ts'
import type { ModalProblemWording } from '../engine/errors.ts'
import type { FrameCondition, ModalSystem } from '../engine/frames.ts'
import type { TcsPattern } from '../engine/inference.ts'

/** The modal components' interface text in Traditional Chinese, the default; its shape is the {@link ModalMessages} type. */

const list = (xs: readonly string[]): string => xs.join('、')
const set = (xs: readonly string[]): string => (xs.length === 0 ? '∅' : `{${xs.join(', ')}}`)
const pos = (p: { readonly position: number }): string => `（第 ${p.position + 1} 個字）`

const ZH_PROBLEMS: ModalProblemWording = {
  join: (where, message) => `${where}：${message}`,
  messages: {
    'parse-unexpected-character': (p) => `看不懂字元 ${p.character}${pos(p)}`,
    'parse-unexpected-token': (p) => `多出了 ${p.token}${pos(p)}`,
    'parse-unexpected-end': (p) => `公式還沒寫完${pos(p)}`,
    'parse-expected': (p) => `這裡要有 ${p.expected}${pos(p)}`,
    'ambiguous-mix': (p) => `${p.operators} 並列時要加括號${pos(p)}`,
    'reserved-atom': (p) => `${p.atom} 是保留字，不能當原子`,
    'unknown-atom': (p) => `沒有原子 ${p.atom}`,
    'unknown-world': (p) => `沒有世界 ${p.world}`,
    'duplicate-world': (p) => `世界 ${p.world} 重複了`,
    'duplicate-atom': (p) => `原子 ${p.atom} 重複了`,
    'no-worlds': () => '模型裡沒有世界',
    'too-many-worlds': (p) => `有 ${p.count} 個世界，上限是 ${p.limit} 個`,
    'missing-position': (p) => `手動版面需要世界 ${p.world} 的位置`,
    'no-sphere-system': (p) => `世界 ${p.world} 沒有同心球系統`,
    'spheres-not-nested': (p) => `${p.world} 的第 ${p.index} 層同心球沒有包含內層`,
    'empty-sphere': (p) => `${p.world} 的第 ${p.index} 層同心球是空的`,
    centering: (p) => (p.centering === 'strong' ? `${p.world} 的最內層同心球必須恰為 {${p.world}}` : `${p.world} 的最內層同心球必須包含 ${p.world}`),
    'spheres-source': () => '同心球只能用一種方式給：center 加 spheres、center 加 similarity，或 systems',
    'not-unique': (p) => `Stalnaker 的選擇在 ${p.world} 沒有定義：最接近的前件世界有 ${list(p.candidates)}`,
    'too-many-assignments': (p) => `要窮舉 ${p.count.toLocaleString('en-US')} 種指派，上限是 ${p.limit.toLocaleString('en-US')} 種`,
    'cyclic-equations': (p) => `方程繞成一圈：${p.cycle.join(' → ')}`,
    'not-truth-functional': (p) => `${p.formula} 只能用真值函數連接詞（不能有 □、◇ 或 >）`,
    'surgery-antecedent': (p) => `小手術需要原子或否定原子的連言，${p.formula} 不是`,
    'needs-similarity': () => '這張圖需要有 center、similarity 與 structural 結構方程的同心球文件',
    'not-json': (p) => `不是 JSON：${p.detail}`,
    'too-large': () => '文件太大了',
    'wrong-kind': (p) => `這張圖需要 ${p.expected.join(' 或 ')} 文件，不是 ${p.kind}`,
    schema: (p) => p.message['zh-TW'],
  },
}

export const MODAL_ZH = {
  locale: 'zh-TW' as Locale,
  problems: ZH_PROBLEMS,
  docInvalid: '這個模型無法繪出：',
  trueWord: '真',
  falseWord: '假',
  world: '世界',
  formula: '公式',
  formulas: '公式',
  truthSet: '真值集合',
  intensionCaption: '內涵：每個世界各給句子一個真值',
  selectWorld: (w: string) => `選擇世界 ${w}`,
  selectFormula: (f: string) => `選擇公式 ${f}`,
  worldGraph: (n: number) => `可能世界圖，${n} 個世界`,
  worldState: (w: string, atoms: readonly string[]) => (atoms.length === 0 ? `世界 ${w}：沒有原子為真` : `世界 ${w}：${list(atoms)} 為真`),
  atomsHeading: '原子',
  at: (w: string) => `在 ${w}`,
  noAccess: (w: string) => `${w} 沒有可及的世界`,
  boxTrue: (w: string, arg: string, seen: readonly string[]) =>
    seen.length === 0 ? `${w} 沒有可及的世界，所以 □${arg} 空真。` : `${w} 可及的每個世界（${list(seen)}）都使 ${arg} 為真。`,
  boxFalse: (w: string, arg: string, v: string) => `${w} 可及 ${v}，而 ${arg} 在 ${v} 為假：這是反例。`,
  diaTrue: (w: string, arg: string, v: string) => `${w} 可及 ${v}，而 ${arg} 在 ${v} 為真：這是證人。`,
  diaFalse: (w: string, arg: string, seen: readonly string[]) =>
    seen.length === 0 ? `${w} 沒有可及的世界，所以 ◇${arg} 為假。` : `${w} 可及的世界（${list(seen)}）都使 ${arg} 為假。`,
  plainValue: (w: string, value: boolean) => `在 ${w} 為${value ? '真' : '假'}。`,
  customFormula: '自己輸入公式',
  add: '加入',
  editHeading: '編輯模型',
  accessHeading: '可及關係',
  accessToggle: (a: string, b: string) => `${a} 可及 ${b}`,
  atomToggle: (w: string, atom: string) => `${atom} 在 ${w} 為真`,
  showFalse: '也列出為假的原子',
  // frames
  conditionHeading: '框架條件',
  holdsHeading: '成立',
  axiomHeading: '對應公理',
  validHeading: '在框架上有效',
  conditionName: { serial: '序列的', reflexive: '自反的', transitive: '遞移的', symmetric: '對稱的', euclidean: '歐氏的' } as Readonly<Record<FrameCondition, string>>,
  conditionRule: {
    serial: '每個世界至少可及一個世界',
    reflexive: '每個世界都可及自己',
    transitive: '若 wRv 且 vRu，則 wRu',
    symmetric: '若 wRv，則 vRw',
    euclidean: '若 wRv 且 wRu，則 vRu',
  } as Readonly<Record<FrameCondition, string>>,
  conditionWitness: (c: FrameCondition, w: readonly string[]): string => {
    const [a = '', b = '', d = ''] = w
    switch (c) {
      case 'serial':
        return `${a} 看不到任何世界`
      case 'reflexive':
        return `${a} 看不到自己`
      case 'symmetric':
        return `${a}R${b}，但沒有 ${b}R${a}`
      case 'transitive':
        return `${a}R${b}、${b}R${d}，但沒有 ${a}R${d}`
      case 'euclidean':
        return `${a}R${b}、${a}R${d}，但沒有 ${b}R${d}`
    }
  },
  axiomName: (name: string) => (name === 'M' ? 'M（又稱 T）' : name),
  axiomCounterexample: (trueAt: Readonly<Record<string, readonly string[]>>, w: string) =>
    `${Object.entries(trueAt)
      .map(([a, ws]) => `${a} 只在 ${set(ws)} 為真`)
      .join('、')}時，公理在 ${w} 為假`,
  yes: '是',
  no: '否',
  systemName: (s: ModalSystem) => (s === 'M' ? 'M（又稱 T）' : s),
  systemsLine: (names: readonly string[]) => `這個框架屬於 ${list(names)} 的框架類。`,
  // strict implication
  materialHeading: '實質蘊涵',
  strictHeading: '嚴格蘊涵',
  strictTrue: (w: string) => `${w} 可及的每個前件為真的世界，後件也為真。`,
  strictFalse: (w: string, bad: readonly string[]) => `${w} 可及的 ${list(bad)} 使前件為真、後件為假。`,
  materialTrue: (w: string, aFalse: boolean) => (aFalse ? `在 ${w} 前件為假，所以實質條件句為真。` : `在 ${w} 前件與後件都為真。`),
  materialFalse: (w: string) => `在 ${w} 前件為真、後件為假。`,
  // TCS
  patternName: { transitivity: '傳遞', contraposition: '換質換位', strengthening: '加強前件' } as Readonly<Record<TcsPattern, string>>,
  exampleTitle: (pattern: string, title: string) => `${pattern}：${title}`,
  premise: '前提',
  conclusion: '結論',
  counterfactualHeading: '同心球（反事實條件句）',
  collapse: '壓成一層',
  collapseHint: '把所有同心球壓成最外層的一個：每個前件都用同一個可及範圍，反事實條件句就變成嚴格蘊涵。',
  inferenceCounterexample: (w: string) => `在 ${w} 前提都為真、結論為假：推論失效。`,
  inferenceHolds: (w: string) => `在 ${w} 沒有前提真而結論假：推論成立。`,
  inferenceVacuous: (w: string) => `在 ${w} 前提不全為真，這裡找不到反例。`,
  // spheres
  semanticsLabel: '條件句語意',
  sphereName: (i: number) => `S${i + 1}`,
  center: '中心',
  antecedentWorlds: '前件世界',
  closestWorlds: '最接近的前件世界',
  closestList: (ws: readonly string[]) => `最接近的前件世界：${list(ws)}`,
  vacuous: '沒有任何同心球含前件世界，所以條件句空真。',
  smallestSphere: (s: string, ws: readonly string[]) => `含前件世界的最小同心球是 ${s}，其中的前件世界是 ${list(ws)}。`,
  cfTrue: '最接近的前件世界都使後件為真，所以條件句為真。',
  cfFalse: (ws: readonly string[]) => `${list(ws)} 使後件為假，所以條件句為假。`,
  notUnique: (ws: readonly string[]) => `Stalnaker 的選擇函數在這裡沒有定義：最接近的前件世界有 ${list(ws)}，不只一個。條件排中律因此不保證成立。`,
  needsConditional: '請選擇一個 A > B 形式的公式。',
  // surgery
  similarityHeading: '依相似度（Lewis）',
  surgeryHeading: '小手術（Pearl）',
  weightsHeading: '權重',
  weightLabel: (atom: string) => `與實際的 ${atom} 不同`,
  lawLabel: (law: string) => `違反 ${law}`,
  distance: '距離',
  approxNote: '以權重加總計算距離，只是 Lewis（1979）相似度優先序的數值近似。',
  intervention: (vals: string) => `干預：把 ${vals} 換成常數，其他方程保留；沒有方程的原子固定在中心世界的值。`,
  solution: '子模型的解',
  solutionWorld: (w: string | undefined) => (w === undefined ? '模型裡沒有與這個解相同的世界。' : `這個解就是世界 ${w}。`),
  agree: '兩種語意給出相同的判斷。',
  diverge: '兩種語意給出不同的判斷。',
  equationsHeading: '結構方程',
} as const

export type ModalMessages = {
  readonly [K in keyof typeof MODAL_ZH]: K extends 'locale'
    ? Locale
    : (typeof MODAL_ZH)[K] extends (...args: infer A) => infer R ? (...args: A) => R extends string ? string : R : (typeof MODAL_ZH)[K] extends string ? string : (typeof MODAL_ZH)[K]
}
