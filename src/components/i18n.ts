import type { ReactNode } from 'react'
import { createContext, createElement, useContext } from 'react'
import type { Problem, ProblemWording } from '../engine/errors.ts'
import { PROBLEMS_EN, problemText } from '../engine/errors.ts'
import type { Locale } from '../engine/types.ts'

/**
 * Every piece of interface text, in Traditional Chinese (the default) and English. Components
 * take their table from {@link useMessages}; pure helpers take it as an argument.
 */

export type { Locale }

export const DEFAULT_LOCALE: Locale = 'zh-TW'

/** Each language by its own name, for language switches. */
export const LANGUAGE_NAMES: Readonly<Record<Locale, string>> = { 'zh-TW': '中文', en: 'English' }

export const AUTHOR_ZH = '洪偉'
export const AUTHOR_EN = 'Wei Hung'

const ZH_PROBLEMS: ProblemWording = {
  messages: {
    'parse-unterminated-string': (p) => `字串少了結尾的引號（第 ${p.position + 1} 個字）`,
    'parse-unexpected-character': (p) => `看不懂字元 ${p.character}（第 ${p.position + 1} 個字）`,
    'parse-unexpected-token': (p) => `多出了 ${p.token}（第 ${p.position + 1} 個字）`,
    'parse-expected': (p) => `這裡要有 ${p.options.join(' 或 ')}（第 ${p.position + 1} 個字）`,
    'parse-intervention-not-allowed': (p) => `[X←x] 只能用在干預式裡（第 ${p.position + 1} 個字）`,
    'parse-expected-variable': (p) => `這裡要有變項代號（第 ${p.position + 1} 個字）`,
    'parse-expected-value': (p) => `這裡要有一個值（第 ${p.position + 1} 個字）`,
    'not-boolean': (p) => `${p.id === undefined ? '' : `${p.id}：`}要是 0 或 1，卻是 ${p.value}`,
    'not-in-domain': (p) => `${p.id} 的值 ${p.value} 不在值域 ${p.values} 裡`,
    'no-value': (p) => `${p.id} 沒有值`,
    'unknown-variable': (p) => `沒有變項 ${p.id}`,
    'reserved-name': (p) => `${p.id} 是保留字，不能當變項代號`,
    'duplicate-variable': (p) => `變項 ${p.id} 重複了`,
    'empty-domain': (p) => `${p.id} 的值域是空的`,
    'equation-for-unknown': (p) => `有一條式子屬於不存在的變項 ${p.id}`,
    'equation-for-exogenous': (p) => `外生變項 ${p.id} 不能有式子`,
    'intervention-in-equation': () => '式子裡不能有干預',
    'missing-equation': (p) => `內生變項 ${p.id} 沒有式子`,
    cyclic: (p) => `式子繞成一圈：${p.cycle.join(' → ')}`,
    'lookup-row-length': (p) => `表的一列有 ${p.got} 個輸入，應該是 ${p.expected} 個`,
    'lookup-duplicate': (p) => `表裡的輸入 (${p.key}) 出現兩次`,
    'lookup-no-row': (p) => `(${p.inputs}) 的表沒有 (${p.values}) 這一列`,
    'intervention-needs-model': () => '[X←x] 要在模型和脈絡之下才能算',
    'context-missing': (p) => `脈絡裡沒有外生變項 ${p.id} 的值`,
    'invalid-probability': (p) => `${p.p} 不是有效的機率`,
    'probabilities-sum': (p) => `機率加起來是 ${p.total}，不是 1`,
    'too-many-contexts': (p) => `要列舉的脈絡太多：${p.count.toLocaleString('en-US')} 個（上限 ${p.limit.toLocaleString('en-US')}）；請減少外生變項或它們的值`,
    'joint-row-missing': (p) => `聯合機率的一列沒有 ${p.id} 的值`,
    'joint-endogenous': (p) => `聯合機率給了內生變項 ${p.id} 值`,
    'joint-duplicate': (p) => `聯合機率把脈絡 ${p.key} 列了兩次`,
    'marginal-missing': (p) => `外生變項 ${p.id} 沒有機率`,
    'marginal-duplicate': (p) => `${p.key} 列了兩次`,
    'marginal-endogenous': (p) => `內生變項 ${p.id} 不能給機率`,
    'zero-probability-evidence': () => '證據的機率是 0',
    'cause-not-conjunction': (p) => `原因 ${p.cause} 要寫成 X=x 的連言`,
    'cause-repeats': (p) => `原因裡 ${p.id} 出現兩次`,
    'cause-not-endogenous': (p) => `原因變項 ${p.id} 要是內生變項`,
    'cause-empty': () => '原因是空的',
    'search-budget': (p) => `${p.theory} 的搜尋要超過 ${p.limit.toLocaleString('en-US')} 次運算；這個模型的內生變項對這個定義來說太多了`,
    'too-many-endogenous': (p) => `實際因果的搜尋最多只處理 ${p.limit} 個內生變項`,
    'effect-has-intervention': () => '結果裡不能有干預',
    'normality-missing': () => '「HP 加上常態」需要常態值',
    'utility-row-length': () => '效用表一列的值數目不對',
    'utility-no-row': (p) => `效用表沒有 ${p.values} 這一列`,
    'prior-no-mass': () => '機率分布的總和是 0',
    'arithmetic-intervention': () => '[X←x] 沒有數學式寫法',
    'arithmetic-non-number': (p) => `${p.value} 不是數字，不能做算術`,
    'arithmetic-no-case': () => '沒有一種情況成立',
    'row-empty': () => '這一列是空的',
    'not-a-number': (p) => `要是數字，卻是 ${p.value}`,
    'table-row-length': (p) => `${p.id} 的表：每一列要有 ${p.inputs} 個輸入和一個輸出`,
    'bare-prior-not-boolean': (p) => `${p.id} 的機率：只有 0／1 變項能只寫一個數字`,
    'joint-row-length': () => '聯合機率一列的長度不對',
    'case-missing': (p) => `案例沒有 ${p.what}`,
    'no-such-act': (p) => `沒有行動 ${p.act}`,
    'not-identifier': () => '代號要用英文字母開頭，只能有英文字母、數字和底線',
    'not-exogenous': (p) => `${p.id} 不是外生變項`,
    'needs-context-or-priors': () => '需要脈絡或機率',
    'too-large': () => '資料過大',
    'not-json': (p) => `不是 JSON：${p.detail}`,
    'share-version': (p) => `分享連結的版本 ${p.version === '' ? '（無）' : p.version} 不支援`,
    'share-damaged': () => '分享連結的資料損壞',
    'story-sentence-missing': (p) => `story_tags 的句子在故事（${p.locale}）裡找不到`,
    schema: (p) => p.message['zh-TW'],
  },
  where: (w) => {
    switch (w.kind) {
      case 'equation':
        return `${w.id} 的式子`
      case 'formula':
        return w.text === '' ? '式子' : `式子 ${w.text}`
      case 'operator':
        return w.op
      case 'marginal':
        return `${w.id} 的機率`
      case 'joint-prior':
        return '聯合機率'
      case 'table':
        return `${w.id} 的表`
      case 'utility':
        return '效用表'
      case 'path':
        return w.path === '' ? '（根）' : w.path
    }
  },
  join: (where, message) => `${where}：${message}`,
}

/** A problem the editor finds in what the user typed, before the model is built. */
export type DraftIssue =
  | { readonly code: 'id-invalid' }
  | { readonly code: 'id-reserved'; readonly id: string }
  | { readonly code: 'id-duplicate'; readonly id: string }
  | { readonly code: 'values-few' }
  | { readonly code: 'values-repeat' }
  | { readonly code: 'equation-empty' }
  | { readonly code: 'equation-parse'; readonly problem: Problem }
  | { readonly code: 'equation-invalid'; readonly problem: Problem }
  | { readonly code: 'value-not-in-domain'; readonly id: string; readonly value: string }
  | { readonly code: 'prior-range'; readonly id: string }
  | { readonly code: 'prior-weights'; readonly id: string }
  | { readonly code: 'normal-not-in-domain'; readonly id: string; readonly value: string }
  | { readonly code: 'cycle'; readonly cycle: readonly string[] }
  | { readonly code: 'model'; readonly problems: readonly Problem[] }

type DraftWording = { readonly [K in DraftIssue['code']]: (issue: Extract<DraftIssue, { code: K }>) => string }

/**
 * What a click on a node does: set or release a boolean one; choose or adjust the value of a
 * multi-valued one; choose or adjust P*(X=1) of a boolean one in probability mode.
 */
export type NodeToggle = 'set' | 'release' | 'choose' | 'adjust' | 'chooseProb' | 'adjustProb' | 'observe' | 'observeOnly'

const ZH = {
  locale: 'zh-TW' as Locale,
  problems: ZH_PROBLEMS,
  /** Splits a story into sentences. */
  sentences: (text: string): string[] => text.split(/(?<=[。？！])/),
  list: (items: readonly string[]): string => items.join('、'),
  sourceList: (items: readonly string[]): string => items.join('；'),

  // case page
  family: { actual: '實際因果', omission: '不作為與責任', norms: '規範與預設值', law: '法律', decision: '因果決策' },
  stepOf: (step: number, total: number): string => `第 ${step} 步，共 ${total} 步`,
  story: '故事',
  storyTags: (ids: string): string => `對應變項 ${ids}`,
  explanation: '模型記了什麼',
  steps: '步驟',
  next: {
    graph: '畫成圖',
    toProbability: '把 0／1 改成機率',
    intervene: '干預',
    compare: '比較觀察和行動',
    verdicts: '定義評判',
  },
  startOver: '從頭再看',
  back: '上一步',
  placeholder: '?',
  sources: '來源',
  noteClickToIntervene: '點圖上的節點，套上干預，看其他變項怎麼重算。',
  notePreset: (doText: string, label: string, ids: string): string =>
    `現在套上 ${doText}（${label}）：${ids} 的式子換成常數，其餘照式子重算。`,
  noteClickOther: '點圖上的節點，可以改別的變項。',
  noteProbability: ['外生變項原本只取 0 或 1。這一步把它們改成機率 p。', '節點裡填色的高度，是這個變項等於 1 的機率。', '拉滑桿，圖上的數字會跟著變。'],
  noteSee: (phrase: string): string => `左邊是看到${phrase}之後的機率。`,
  phrase: {
    seeOn: (name: string, text: string): string => `${name}（${text}）`,
    seeOff: (name: string, text: string): string => `${name}沒有發生（${text}）`,
    doOn: (name: string, text: string): string => `${name}（${text}）`,
    doOff: (name: string, text: string): string => `${name}不發生（${text}）`,
    other: (name: string, text: string): string => `${text}（${name}）`,
  },
  noteDo: (doText: string): string => `右邊是以行動設定 ${doText} 之後的機率。`,
  noteVerdicts: '下面列出各個標準的判定，一個標準一列。',

  // verdicts
  theory: {
    butfor: '簡單反事實',
    'hp-original': 'HP 原始定義',
    'hp-updated': 'HP 更新定義',
    'hp-modified': 'HP 修正定義',
    'hp-normality': 'HP 加上常態',
  },
  verdict: { cause: '算', 'not-cause': '不算', 'part-of-cause': '算一部分' },
  decisionName: { edt: '證據決策論（EDT）', cdt: '因果決策論（CDT）' },
  decisionShort: { edt: '證據決策論', cdt: '因果決策論' },
  changeItem: (id: string, value: string): string => `${id} 改成 ${value}`,
  fixItem: (id: string, value: string): string => `${id} 固定在 ${value}`,
  outcomeIs: (id: string, value: string): string => `${id} 是 ${value}`,
  notActual: (cause: string, effect: string): string => `${cause} 或 ${effect} 在實際世界不成立。`,
  witnessSentence: (fix: string | undefined, allActual: boolean, change: string, outcome: string): string =>
    fix === undefined ? `把 ${change}，${outcome}。` : `先把 ${fix}${allActual ? '（實際值）' : ''}，再把 ${change}，${outcome}。`,
  partOfCause: (cause: string): string => `單獨不算；它是 ${cause} 這個原因的一部分。`,
  smallerCause: (cause: string): string => `其中 ${cause} 單獨就夠了，多出來的部分不算。`,
  lessNormal: '能讓結果不發生的情況，沒有一個至少和實際世界一樣正常。',
  butForSentence: (change: string, outcome: string): string => `只問一件事：少了它，結果還會不會發生。把 ${change}，${outcome}。`,
  anyFixSentence: (change: string, outcome: string): string => `固定哪些變項都一樣：把 ${change}，${outcome}。`,
  verdictHeading: (causeLabel: string, cause: string, effectLabel: string, effect: string): string =>
    `${causeLabel}（${cause}）算不算${effectLabel}（${effect}）的原因`,
  intuitionSummary: (differ: readonly string[], agree: readonly string[]): string | undefined => {
    const parts: string[] = []
    if (differ.length > 0) parts.push(`${differ.join('、')}和直覺不一致`)
    if (agree.length > 0) parts.push(`${agree.join('、')}和直覺一致`)
    return parts.length === 0 ? undefined : `${parts.join('；')}。`
  },
  againstIntuition: '和直覺不合',
  intuition: '直覺',
  choose: '選',
  witnessHold: (assignment: string): string => `見證：固定 ${assignment}`,
  holds: '成立',
  showOnGraph: '在圖上看',
  probabilities: '機率',
  counterfactualNote: '反事實：先依證據回推，再干預、預測',
  whatToChoose: '該怎麼選',
  utility: (act: string, eu: string): string => `${act}：${eu}`,
  utilitySep: '　',
  hpConditions: 'HP 定義的三個條件',
  twoUtilities: '兩種期望效用',
  more: '補充',
  hp: {
    intro: '在模型 M 和脈絡 u 之下，X=x 是 φ 的實際原因，要三個條件都成立。',
    ac1: 'X=x 和 φ 在實際世界都成立。',
    ac2: '有一組變項 W 和另一個值 x′：把 W 固定在實際值 w*，再把 X 設成 x′，φ 就不成立。',
    ac3: 'X 的任何真子集都不能同時滿足 AC1 和 AC2。',
    lesson: '形式系列：實際因果',
    applied: '套到這個案例',
    causeIs: 'X=x 是',
    witnessIs: (w: string, values: string): string => `W 是 {${w}}，w* 是 ${values}`,
    effectIs: 'φ 是',
    ref: 'Halpern 2016，第 2 章',
  },
  eu: {
    edt: '：看到自己做了 a 之後，結果的機率。',
    cdt: '：採取行動 a 之後，結果的機率。',
    lesson: '形式系列：因果決策',
  },

  // graphs, equations and legends
  notation: { propositional: '邏輯式', arithmetic: '數學式', causal: '干預式' },
  notationLabel: '式子的寫法',
  equations: '式子',
  copyLatex: '複製 LaTeX',
  latexCopied: '已複製',
  actualWorld: '實際世界',
  probability: '機率',
  afterDo: '干預後',
  removeDo: (doText: string): string => `取消 ${doText}`,
  backToActual: '回到實際世界',
  graphTitle: (title: string): string => `${title}的因果圖`,
  cut: '切斷',
  was: (value: string): string => `原本 ${value}`,
  nodeValue: (value: string): string => `值 ${value}`,
  nodeAria: (who: string, state: string, forced: string | undefined, before: string | undefined, seen?: string): string =>
    `${who}，${state}${forced === undefined ? '' : `，已干預成 ${forced}`}${seen === undefined ? '' : `，已觀察到 ${seen}`}${before === undefined ? '' : `，原本 ${before}`}`,
  nodeHint: (toggle: NodeToggle | undefined, movable: boolean): string =>
    [
      toggle === undefined
        ? ''
        : toggle === 'release'
          ? '按一下取消干預'
          : toggle === 'choose'
            ? '按一下選擇要設成的值'
            : toggle === 'adjust'
              ? '按一下改選干預的值或放開'
              : toggle === 'chooseProb'
                ? '按一下設定干預後等於 1 的機率'
                : toggle === 'adjustProb'
                  ? '按一下改設干預後等於 1 的機率或放開'
                  : toggle === 'observe'
                    ? '按一下觀察（再按換值，第三下取消）；長按、右鍵或 Shift 加按一下是干預'
                    : toggle === 'observeOnly'
                      ? '按一下觀察（再按換值，第三下取消）'
                      : '按一下套上干預',
      movable ? '拖曳或用方向鍵移動' : '',
    ]
      .filter((h) => h !== '')
      .join('；'),
  doRelease: '放開',
  doPickLabel: (who: string): string => `${who}：選擇干預的值`,
  doProbLabel: (who: string): string => `${who}：干預後等於 1 的機率`,
  barMax: (p: string): string => `最高 ${p}`,
  withHint: (aria: string, hint: string): string => (hint === '' ? aria : `${aria}。${hint}`),
  setDirectly: (parents: readonly string[], value: string): string =>
    `${parents.length === 0 ? '' : `切斷 ${parents.join("、")}，`}直接設成 ${value}`,
  setByChance: (parents: readonly string[], p: string): string =>
    `${parents.length === 0 ? '' : `切斷 ${parents.join("、")}，`}以機率 ${p} 設成 1，否則設成 0`,
  afterDoNote: (doText: string, label: string, value: string): string => `${doText} 之後，${label}：${value}`,
  readBrackets: '讀法：先做方括號裡的干預，再看圓括號裡的事成不成立。',
  readCausal: '讀法：[X←x](Y=y) 是把 X 設成 x 之後，Y 等於 y。',
  valueLegend: '實心＝發生（1）　空心＝沒發生（0）',
  probLegend: '填色的高度＝等於 1 的機率',
  probLegendFinite: '填色的高度＝等於 1 的機率；多值變項每個值一根長條，高度與取該值的機率成正比，最高的一根標出它的機率',
  probLegendBars: '每個值一根長條，高度與取該值的機率成正比，最高的一根標出它的機率',

  // probability panel
  unchanged: '不變',
  probEquations: '式子和機率',
  jointOnly: '這個案例的機率是整張聯合分布，不能逐一調整。',
  sliderLabel: (label: string): string => `${label}的機率`,
  nodesShow: '節點顯示',
  zeroOne: '0／1',
  probGraphTitle: (title: string): string => `${title}：各變項等於 1 的機率`,
  observing: (event: string): string => `觀察 ${event}`,
  observed: '看到的',
  setByDo: '設定的',
  zeroObservation: '這個觀察的機率是 0，無法以它為條件。',
  afterObserving: (event: string): string => `觀察 ${event} 之後的機率`,
  seeText: (phrase: string): string => `看到${phrase}，會改變對其他變項的猜測，上游的也會跟著變。`,
  afterSetting: (doText: string): string => `${doText} 之後的機率`,
  doText: (phrase: string): string => `以行動讓${phrase}，指進它的箭頭被剪斷，只有下游會變。`,

  // world lanes
  lanes: {
    region: '世界分道（可左右捲動）',
    context: (ctx: string): string => `脈絡 ${ctx}`,
    counterfactual: '反事實世界',
    recomputed: '其餘照式子重算',
    witness: 'HP 見證世界',
    /** The witness's held variables: those at their actual value, and those at another value (original and updated HP allow it). */
    held: (atActual: string, notActual: string): string =>
      [atActual === '' ? '' : `${atActual} 固定在實際值`, notActual === '' ? '' : `${notActual} 固定在非實際值`].filter((x) => x !== '').join('；'),
    outcomeNo: (label: string): string => `${label}：沒有`,
    sameAsActual: '和實際一樣',
    differsFromActual: '和實際不同',
    diff: '差異',
    sameCell: '＝',
    same: '一樣',
    different: '不同',
    summaryLane: (name: string, cells: readonly string[]): string => `${name}：${cells.join('，')}`,
    summaryJoin: (lanes: readonly string[]): string => lanes.join('。'),
    apply: (doText: string): string => `套上 ${doText}`,
    addWitness: '加上 HP 見證',
    hideEquations: '收起式子',
    showEquations: '看式子',
    again: '重來',
  },

  // playground
  playgroundHint: (probabilistic: boolean): string =>
    probabilistic ? '點一下節點是觀察；長按、右鍵或 Shift＋點是干預。' : '點一下節點是干預。',
  playgroundHintMore: (probabilistic: boolean): string =>
    probabilistic
      ? '觀察：先觀察到 1，再點換成 0，第三下取消。干預：設成 1，旁邊的滑桿可以改成 0 或其他機率；Esc 關掉滑桿。'
      : '先固定在目前的值，再點換成另一個值，第三下取消；多值的節點用滑桿選值。',
  moreInfo: '說明',
  afterObserve: '觀察後',
  afterDoObserve: '干預並觀察後',
  clearSettings: (text: string): string => `取消 ${text}`,
  backToPrior: '回到原本的機率',
  observeImpossible: (event: string): string => `在目前的設定下，${event} 不可能發生，無法以它為條件。`,
  presets: '預設的干預',
  docInvalid: '這份模型文件無法顯示：',

  // export
  export: {
    open: '下載圖片',
    settings: '圖片設定',
    format: '格式',
    theme: '主題',
    language: '語言',
    light: '淺色',
    dark: '深色',
    png: 'PNG（2×）',
    download: '下載',
    nothing: '畫面上沒有圖可以下載',
    failed: (message: string): string => `下載失敗：${message}`,
    caseSource: (origin: string): string => `案例出處：${origin}`,
    style: '樣式',
    styleColor: '彩色（含浮水印）',
    styleAcademic: '學術版（黑白線條）',
    citeLead: '引用本圖請註明：',
    reminderHeading: '學術版沒有浮水印，請在圖說或參考文獻裡引用：',
    reminderOrigins: '這個案例的原始出處也請一併引用：',
    copyAuthorYear: '複製作者年份',
    copyOrigins: '複製案例出處',
    copied: '已複製',
    embedLead: '嵌入到其他網頁：複製的程式碼含可操作的圖（目前的觀察與干預一併帶過去）與引用文字，請一併保留。',
    copyEmbed: '複製嵌入碼',
    embedOpen: '在原文中開啟',
    embedTitle: (title: string): string => `${title}｜causal-atlas`,
    embedLicence: (dataLicense: string): string => `資料與教學文字以 ${dataLicense} 授權。`,
    embedSources: (origins: readonly string[]): string => `案例出處：${origins.join('；')}`,
  },

  // citation
  cite: {
    heading: '如何引用',
    lead: '學術或教學使用請引用：',
    copied: '已複製',
    copyBibtex: '複製 BibTeX',
    licence: (dataLicense: string): string =>
      `程式碼以 MIT 授權；案例資料與教學文字以 ${dataLicense} 授權，轉用請標示「${AUTHOR_ZH}（${AUTHOR_EN}）」與出處。`,
    authorYear: (year: number, project: string, version: string, url: string): string =>
      `${AUTHOR_ZH}（${AUTHOR_EN}）（${year}）。${project}（${version} 版）。${url}`,
    watermark: (project: string, dataLicense: string, url: string): string =>
      `${AUTHOR_ZH}（${AUTHOR_EN}）· ${project} · ${dataLicense} · ${url}`,
  },

  // model editor
  editor: {
    defaultTitle: '我的模型',
    modes: { value: '確定值', probability: '機率' },
    blank: '空白模型',
    blankSearch: 'blank 空白模型 blank model',
    pickCase: '選案例',
    caseList: '案例清單',
    familyFilter: '依類別篩選',
    allFamilies: '全部',
    customModel: '自訂模型',
    close: '關閉',
    title: '模型名稱',
    shareUnreadable: '分享連結讀不出來：',
    incomplete: '模型還不完整：',
    lastGood: '模型有問題，圖上是上一次能算的版本：',
    addFirst: '先在「變項」裡加一個變項',
    fillEquations: '補上式子，圖就會出現',
    hint: '機率圖上，點一下節點是觀察，長按（或按住 Shift 再點）是干預；只有一組值的圖，點一下就是干預。拖曳節點（或選取後按方向鍵）可以調整位置。',
    variables: '變項',
    varId: (n: number): string => `第 ${n} 個變項：代號`,
    varZh: (n: number): string => `第 ${n} 個變項：中文名稱`,
    zhPlaceholder: '中文名稱',
    varEn: (n: number): string => `第 ${n} 個變項：英文名稱`,
    enPlaceholder: '英文名稱（可留空）',
    varKind: (n: number): string => `第 ${n} 個變項：種類`,
    exogenous: '外生',
    endogenous: '內生',
    varDomain: (n: number): string => `第 ${n} 個變項：值域`,
    domainBoolean: '0／1',
    domainList: '列舉',
    varValues: (n: number): string => `第 ${n} 個變項：可能的值`,
    valuesPlaceholder: '例如 one, two',
    varShown: (n: number): string => `第 ${n} 個變項：畫在圖上`,
    shown: '畫在圖上',
    removeVar: (n: number): string => `刪除第 ${n} 個變項`,
    remove: '刪除',
    addVar: '加一個變項',
    syntax: { lead: '寫法：', sep: '、', compare: '，比較用 ', quote: '，文字值加引號，例如 ', end: '。' },
    noEquation: (ids: string): string => `外生變項沒有式子：${ids}`,
    equationOf: (id: string): string => `${id} 的式子`,
    exogenousValues: '外生變項的值',
    exogenousLabel: '外生變項',
    valueModeNote: '每個外生變項取一個值，圖上畫出實際世界。',
    probabilityModeNote: '每個外生變項給機率，節點裡填色的高度是等於 1 的機率。',
    valueOf: (id: string): string => `${id} 的值`,
    normality: '常態',
    normalityNote: '每個變項平常是什麼值。「HP 加上常態」的定義會用到；不設就是沒有預設。',
    normalOf: (id: string): string => `${id} 的常態值`,
    unset: '不設',
    saveShare: '存檔與分享',
    summaryVariable: (id: string, message: string): string => `變項 ${id}：${message}`,
    summaryEquation: (id: string, message: string): string => `${id} 的式子：${message}`,
    summaryValue: (id: string, message: string): string => `${id}：${message}`,
    cannotCompute: (message: string): string => `算不出來：${message}`,
    fixFirst: '模型有問題，修好之後才能分享或下載。',
    makeLink: '產生分享連結',
    downloadJson: '下載 JSON',
    shareLink: '分享連結',
    copied: '已複製',
    copy: '複製',
    importJson: '匯入 JSON',
    pasteJson: '貼上 JSON',
    pastePlaceholder: '貼上模型 JSON，或整個案例檔',
    import: '匯入',
    chooseFile: '選擇 JSON 檔',
    imported: '已匯入',
    unusable: '這份 JSON 不能用：',
    search: '搜尋案例',
    searchPlaceholder: '名稱或代號，中英文皆可',
    matches: (n: number): string => `${n} 個符合`,
    noMatch: '沒有符合的項目',
    lessonModels: '講義模型',
    caseLinks: '講義中用到這個案例',
    modelLinks: '講義中用到這個模型',
    casePanel: (title: string): string => `案例：${title}`,
    modelPanel: (title: string): string => `模型：${title}`,
    editedNote: '你改過模型；下面的判定仍是案例原本的模型算出來的。',
    intuitionIs: '一般人的判斷',
    verdictTable: {
      heading: '各理論的判定',
      theory: '標準',
      query: '問題',
      expected: '案例記錄',
      engine: '引擎算出',
      match: '是否一致',
      agree: '一致',
      disagree: '不一致',
      failed: '算不出來',
    },
    counterfactual: '反事實',
    bestAct: (id: string): string => `${id} 選哪個`,
    expectedUtilityOf: (act: string): string => `${act} 的期望效用`,
    tie: (acts: string): string => `並列：${acts}`,
    sourceRole: { origin: '出處', treatment: '分析', reference: '參考' },
    pages: (pages: string): string => `第 ${pages} 頁`,
  },
  draft: {
    'id-invalid': () => '代號要用英文字母開頭，只能有英文字母、數字和底線',
    'id-reserved': (i) => `${i.id} 是保留字，不能當代號`,
    'id-duplicate': (i) => `代號 ${i.id} 重複了`,
    'values-few': () => '列舉的值至少要兩個',
    'values-repeat': () => '列舉的值有重複',
    'equation-empty': () => '還沒寫式子',
    'equation-parse': (i) => `看不懂這條式子：${problemText(i.problem, ZH_PROBLEMS)}`,
    'equation-invalid': (i) => `式子有誤：${problemText(i.problem, ZH_PROBLEMS)}`,
    'value-not-in-domain': (i) => `${i.id} 的值 ${i.value} 不在值域裡`,
    'prior-range': (i) => `P(${i.id}=1) 要在 0 到 1 之間`,
    'prior-weights': (i) => `${i.id} 的機率要是非負數，加起來大於 0`,
    'normal-not-in-domain': (i) => `${i.id} 的常態值 ${i.value} 不在值域裡`,
    cycle: (i) => `式子繞成一圈：${i.cycle.join(' → ')}`,
    model: (i) => i.problems.map((p) => problemText(p, ZH_PROBLEMS)).join('；'),
  } satisfies DraftWording as DraftWording,
}

export type Messages = typeof ZH

const enList = (items: readonly string[]): string => items.join(', ')
const and = (items: readonly string[]): string =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`

const EN: Messages = {
  locale: 'en',
  problems: PROBLEMS_EN,
  sentences: (text) => text.split(/(?<=[.?!])\s+/),
  list: enList,
  sourceList: (items) => items.join('; '),

  family: { actual: 'Actual causation', omission: 'Omission and responsibility', norms: 'Norms and defaults', law: 'Law', decision: 'Causal decision theory' },
  stepOf: (step, total) => `Step ${step} of ${total}`,
  story: 'Story',
  storyTags: (ids) => `Variables ${ids}`,
  explanation: 'What the model records',
  steps: 'Steps',
  next: {
    graph: 'Draw it as a graph',
    toProbability: 'Turn 0/1 into probabilities',
    intervene: 'Intervene',
    compare: 'Compare seeing and doing',
    verdicts: 'Judge by each definition',
  },
  startOver: 'Start over',
  back: 'Back',
  placeholder: '?',
  sources: 'Sources',
  noteClickToIntervene: 'Click a node on the graph to intervene on it, and see how the other variables are recomputed.',
  notePreset: (doText, label, ids) =>
    `Now ${doText} is applied (${label}): the equation for ${ids} becomes a constant, and the rest are recomputed from their equations.`,
  noteClickOther: 'Click a node on the graph to change another variable.',
  noteProbability: [
    'So far the exogenous variables took only 0 or 1. This step gives them probabilities p.',
    'The height of the fill inside a node is the probability that the variable equals 1.',
    'Drag a slider, and the numbers on the graph change with it.',
  ],
  noteSee: (phrase) => `On the left: the probabilities after seeing ${phrase}.`,
  phrase: {
    seeOn: (name, text) => `that “${name}” (${text})`,
    seeOff: (name, text) => `that “${name}” did not happen (${text})`,
    doOn: (name, text) => `“${name}” (${text})`,
    doOff: (name, text) => `“${name}” not happen (${text})`,
    other: (name, text) => `${text} (${name})`,
  },
  noteDo: (doText) => `On the right: the probabilities after setting ${doText}.`,
  noteVerdicts: "Below is each standard's verdict, one standard per row.",

  theory: {
    butfor: 'But-for test',
    'hp-original': 'HP original definition',
    'hp-updated': 'HP updated definition',
    'hp-modified': 'HP modified definition',
    'hp-normality': 'HP with normality',
  },
  verdict: { cause: 'Cause', 'not-cause': 'Not a cause', 'part-of-cause': 'Part of a cause' },
  decisionName: { edt: 'Evidential decision theory (EDT)', cdt: 'Causal decision theory (CDT)' },
  decisionShort: { edt: 'evidential decision theory', cdt: 'causal decision theory' },
  changeItem: (id, value) => `${id} to ${value}`,
  fixItem: (id, value) => `${id} at ${value}`,
  outcomeIs: (id, value) => `${id} is ${value}`,
  notActual: (cause, effect) => `${cause} or ${effect} does not hold in the actual world.`,
  witnessSentence: (fix, allActual, change, outcome) =>
    fix === undefined ? `Set ${change}: ${outcome}.` : `Hold ${fix}${allActual ? ' (the actual values)' : ''}, then set ${change}: ${outcome}.`,
  partOfCause: (cause) => `Not on its own; it is part of the cause ${cause}.`,
  smallerCause: (cause) => `${cause} alone is enough; the rest does not count.`,
  lessNormal: 'No situation in which the outcome does not occur is at least as normal as the actual world.',
  butForSentence: (change, outcome) => `It asks one thing: without it, would the outcome still occur? Set ${change}: ${outcome}.`,
  anyFixSentence: (change, outcome) => `Holding variables fixed changes nothing: set ${change}: ${outcome}.`,
  verdictHeading: (causeLabel, cause, effectLabel, effect) => `Is ${causeLabel} (${cause}) a cause of ${effectLabel} (${effect})?`,
  intuitionSummary: (differ, agree) => {
    const parts: string[] = []
    if (differ.length > 0) parts.push(`${and(differ)} ${differ.length === 1 ? 'disagrees' : 'disagree'} with intuition`)
    if (agree.length > 0) parts.push(`${and(agree)} ${agree.length === 1 ? 'agrees' : 'agree'} with it`)
    if (parts.length === 0) return undefined
    const text = parts.join('; ')
    return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`
  },
  againstIntuition: 'Against intuition',
  intuition: 'Intuition',
  choose: 'Choose',
  witnessHold: (assignment) => `Witness: hold ${assignment}`,
  holds: 'Holds',
  showOnGraph: 'Show on the graph',
  probabilities: 'Probabilities',
  counterfactualNote: 'Counterfactual: infer back from the evidence, then intervene and predict',
  whatToChoose: 'What to choose',
  utility: (act, eu) => `${act}: ${eu}`,
  utilitySep: '   ',
  hpConditions: 'The three conditions of the HP definition',
  twoUtilities: 'Two kinds of expected utility',
  more: 'More',
  hp: {
    intro: 'In model M and context u, X=x is an actual cause of φ when all three conditions hold.',
    ac1: 'X=x and φ both hold in the actual world.',
    ac2: 'There is a set of variables W and another value x′ such that, holding W at its actual values w* and setting X to x′, φ no longer holds.',
    ac3: 'No proper subset of X satisfies both AC1 and AC2.',
    lesson: 'Formal series: actual causation',
    applied: 'Applied to this case',
    causeIs: 'X=x is',
    witnessIs: (w, values) => `W is {${w}}, w* is ${values}`,
    effectIs: 'φ is',
    ref: 'Halpern 2016, chapter 2',
  },
  eu: {
    edt: ': the probability of each outcome on seeing yourself do a.',
    cdt: ': the probability of each outcome on doing a.',
    lesson: 'Formal series: causal decision theory',
  },

  notation: { propositional: 'Logic', arithmetic: 'Arithmetic', causal: 'Intervention' },
  notationLabel: 'Notation',
  equations: 'Equations',
  copyLatex: 'Copy LaTeX',
  latexCopied: 'Copied',
  actualWorld: 'Actual world',
  probability: 'Probability',
  afterDo: 'After intervention',
  removeDo: (doText) => `Remove ${doText}`,
  backToActual: 'Back to the actual world',
  graphTitle: (title) => `Causal graph: ${title}`,
  cut: 'cut',
  was: (value) => `was ${value}`,
  nodeValue: (value) => `value ${value}`,
  nodeAria: (who, state, forced, before, seen) =>
    `${who}, ${state}${forced === undefined ? '' : `, set by intervention to ${forced}`}${seen === undefined ? '' : `, observed as ${seen}`}${before === undefined ? '' : `, was ${before}`}`,
  nodeHint: (toggle, movable) =>
    [
      toggle === undefined
        ? ''
        : toggle === 'release'
          ? 'click to release the intervention'
          : toggle === 'choose'
            ? 'click to choose the value to set it to'
            : toggle === 'adjust'
              ? 'click to change the value or release it'
              : toggle === 'chooseProb'
                ? 'click to set the probability of 1 by intervention'
                : toggle === 'adjustProb'
                  ? 'click to change the probability of 1 set by intervention, or release it'
                  : toggle === 'observe'
                    ? 'click to observe (again for the other value, a third time to release); long-press, right-click or Shift+click to intervene'
                    : toggle === 'observeOnly'
                      ? 'click to observe (again for the other value, a third time to release)'
                      : 'click to intervene',
      movable ? 'drag or use the arrow keys to move' : '',
    ]
      .filter((h) => h !== '')
      .join('; '),
  doRelease: 'Release',
  doPickLabel: (who) => `${who}: value to set it to`,
  doProbLabel: (who) => `${who}: probability of 1 set by intervention`,
  barMax: (p) => `max ${p}`,
  withHint: (aria, hint) => (hint === '' ? aria : `${aria}. ${hint.charAt(0).toUpperCase()}${hint.slice(1)}`),
  setDirectly: (parents, value) => `${parents.length === 0 ? '' : `ignores ${enList(parents)}; `}set directly to ${value}`,
  setByChance: (parents, p) => `${parents.length === 0 ? '' : `ignores ${enList(parents)}; `}set to 1 with probability ${p}, else to 0`,
  afterDoNote: (doText, label, value) => `After ${doText}, ${label}: ${value}`,
  readBrackets: 'How to read it: first make the interventions in square brackets, then check whether what is in parentheses holds.',
  readCausal: 'How to read it: [X←x](Y=y) says that once X is set to x, Y equals y.',
  valueLegend: 'Filled = happened (1)   Hollow = did not happen (0)',
  probLegend: 'Fill height = probability of 1',
  probLegendFinite:
    'Fill height = probability of 1; a many-valued variable has one bar per value, height in proportion to the probability of that value, the tallest bar labelled with its probability',
  probLegendBars: 'One bar per value, height in proportion to the probability of that value; the tallest bar is labelled with its probability',

  unchanged: 'unchanged',
  probEquations: 'Equations and probabilities',
  jointOnly: "This case's probabilities form one joint distribution and cannot be set one by one.",
  sliderLabel: (label) => `Probability: ${label}`,
  nodesShow: 'Nodes show',
  zeroOne: '0/1',
  probGraphTitle: (title) => `${title}: the probability that each variable equals 1`,
  observing: (event) => `Observing ${event}`,
  observed: 'observed',
  setByDo: 'set',
  zeroObservation: 'This observation has probability 0, so we cannot condition on it.',
  afterObserving: (event) => `Probabilities after observing ${event}`,
  seeText: (phrase) => `Seeing ${phrase} changes what we expect of the other variables, upstream ones included.`,
  afterSetting: (doText) => `Probabilities after ${doText}`,
  doText: (phrase) => `Making ${phrase} cuts the arrows into it; only what lies downstream changes.`,

  lanes: {
    region: 'World lanes (scroll sideways)',
    context: (ctx) => `Context ${ctx}`,
    counterfactual: 'Counterfactual world',
    recomputed: 'The rest follow their equations',
    witness: 'HP witness world',
    held: (atActual, notActual) =>
      [atActual === '' ? '' : `${atActual} held at actual values`, notActual === '' ? '' : `${notActual} held at non-actual values`]
        .filter((x) => x !== '')
        .join('; '),
    outcomeNo: (label) => `${label}: no`,
    sameAsActual: 'Same as actual',
    differsFromActual: 'Differs from actual',
    diff: 'Diff',
    sameCell: '=',
    same: 'Same',
    different: 'Different',
    summaryLane: (name, cells) => `${name}: ${cells.join(', ')}`,
    summaryJoin: (lanes) => `${lanes.join('. ')}.`,
    apply: (doText) => `Apply ${doText}`,
    addWitness: 'Add the HP witness',
    hideEquations: 'Hide equations',
    showEquations: 'Show equations',
    again: 'Start again',
  },

  playgroundHint: (probabilistic) =>
    probabilistic ? 'Click a node to observe it; long-press, right-click or Shift+click to intervene.' : 'Click a node to intervene on it.',
  playgroundHintMore: (probabilistic) =>
    probabilistic
      ? 'Observing: first as 1, again as 0, a third time to release. Intervening sets it to 1, and the slider beside it sets 0 or a probability in between; Esc closes the slider.'
      : 'First at its current value, again at the other value, a third time to release; on a node with more than two values, pick the value with the slider.',
  moreInfo: 'Details',
  afterObserve: 'After observing',
  afterDoObserve: 'After intervening and observing',
  clearSettings: (text) => `Remove ${text}`,
  backToPrior: 'Back to the prior probabilities',
  observeImpossible: (event) => `With what is set now, ${event} cannot happen, so it cannot be observed.`,
  presets: 'Preset interventions',
  docInvalid: 'This model document cannot be shown:',

  export: {
    open: 'Download image',
    settings: 'Image settings',
    format: 'Format',
    theme: 'Theme',
    language: 'Language',
    light: 'Light',
    dark: 'Dark',
    png: 'PNG (2×)',
    download: 'Download',
    nothing: 'There is no graph on screen to download',
    failed: (message) => `Download failed: ${message}`,
    caseSource: (origin) => `Case source: ${origin}`,
    style: 'Style',
    styleColor: 'Colour (watermarked)',
    styleAcademic: 'Academic (B/W line art)',
    citeLead: 'Please cite this figure as:',
    reminderHeading: 'The academic version has no watermark. Please cite it in the caption or the references:',
    reminderOrigins: 'Please also cite the case’s original sources:',
    copyAuthorYear: 'Copy author-year',
    copyOrigins: 'Copy case sources',
    copied: 'Copied',
    embedLead:
      'Embed it in another page: the code holds the interactive figure (with what is observed and set now) and the citation; please keep both.',
    copyEmbed: 'Copy embed code',
    embedOpen: 'Open the original page',
    embedTitle: (title) => `${title} | causal-atlas`,
    embedLicence: (dataLicense) => `Data and teaching text: ${dataLicense}.`,
    embedSources: (origins) => `Case sources: ${origins.join('; ')}`,
  },

  cite: {
    heading: 'How to cite',
    lead: 'Please cite it in academic or teaching use:',
    copied: 'Copied',
    copyBibtex: 'Copy BibTeX',
    licence: (dataLicense) =>
      `Code under the MIT licence; case data and teaching text under ${dataLicense}. When reusing them, credit “${AUTHOR_EN} (${AUTHOR_ZH})” and the source.`,
    authorYear: ZH.cite.authorYear,
    watermark: (project, dataLicense, url) => `${AUTHOR_EN} (${AUTHOR_ZH}) · ${project} · ${dataLicense} · ${url}`,
  },

  editor: {
    defaultTitle: 'My model',
    modes: { value: 'Fixed values', probability: 'Probabilities' },
    blank: 'Blank model',
    blankSearch: ZH.editor.blankSearch,
    pickCase: 'Choose a case',
    caseList: 'Cases',
    familyFilter: 'Filter by family',
    allFamilies: 'All',
    customModel: 'Custom model',
    close: 'Close',
    title: 'Model name',
    shareUnreadable: 'The share link could not be read:',
    incomplete: 'The model is not complete yet:',
    lastGood: 'The model has problems; the graph shows the last version that worked:',
    addFirst: 'Add a variable under “Variables” first',
    fillEquations: 'Fill in the equations and the graph will appear',
    hint: 'With probabilities, click a node to observe it and long-press (or Shift+click) it to intervene; with one set of values, a click intervenes. Drag a node (or select it and press the arrow keys) to move it.',
    variables: 'Variables',
    varId: (n) => `Variable ${n}: id`,
    varZh: (n) => `Variable ${n}: Chinese name`,
    zhPlaceholder: 'Chinese name',
    varEn: (n) => `Variable ${n}: English name`,
    enPlaceholder: 'English name (optional)',
    varKind: (n) => `Variable ${n}: kind`,
    exogenous: 'Exogenous',
    endogenous: 'Endogenous',
    varDomain: (n) => `Variable ${n}: domain`,
    domainBoolean: '0/1',
    domainList: 'List',
    varValues: (n) => `Variable ${n}: values`,
    valuesPlaceholder: 'e.g. one, two',
    varShown: (n) => `Variable ${n}: draw on the graph`,
    shown: 'On the graph',
    removeVar: (n) => `Delete variable ${n}`,
    remove: 'Delete',
    addVar: 'Add a variable',
    syntax: { lead: 'Syntax: ', sep: ', ', compare: '; compare with ', quote: '; put text values in quotes, e.g. ', end: '.' },
    noEquation: (ids) => `Exogenous variables have no equation: ${ids}`,
    equationOf: (id) => `Equation for ${id}`,
    exogenousValues: 'Values of exogenous variables',
    exogenousLabel: 'Exogenous variables',
    valueModeNote: 'Each exogenous variable takes one value; the graph shows the actual world.',
    probabilityModeNote: 'Each exogenous variable gets probabilities; the fill height in a node is the probability of 1.',
    valueOf: (id) => `Value of ${id}`,
    normality: 'Normality',
    normalityNote: 'The usual value of each variable. The “HP with normality” definition uses it; leave it unset for no default.',
    normalOf: (id) => `Normal value of ${id}`,
    unset: 'Unset',
    saveShare: 'Save and share',
    summaryVariable: (id, message) => `Variable ${id}: ${message}`,
    summaryEquation: (id, message) => `Equation for ${id}: ${message}`,
    summaryValue: (id, message) => `${id}: ${message}`,
    cannotCompute: (message) => `Cannot compute: ${message}`,
    fixFirst: 'Fix the model before sharing or downloading it.',
    makeLink: 'Make a share link',
    downloadJson: 'Download JSON',
    shareLink: 'Share link',
    copied: 'Copied',
    copy: 'Copy',
    importJson: 'Import JSON',
    pasteJson: 'Paste JSON',
    pastePlaceholder: 'Paste a model as JSON, or a whole case file',
    import: 'Import',
    chooseFile: 'Choose a JSON file',
    imported: 'Imported',
    unusable: 'This JSON cannot be used:',
    search: 'Search cases',
    searchPlaceholder: 'Name or id, in either language',
    matches: (n) => `${n} ${n === 1 ? 'match' : 'matches'}`,
    noMatch: 'Nothing matches',
    lessonModels: 'Lesson models',
    caseLinks: 'Lessons that use this case',
    modelLinks: 'Lessons that use this model',
    casePanel: (title) => `Case: ${title}`,
    modelPanel: (title) => `Model: ${title}`,
    editedNote: 'You have changed the model; the verdicts below are still those of the case’s own model.',
    intuitionIs: 'What most people say',
    verdictTable: {
      heading: 'Each theory’s verdict',
      theory: 'Standard',
      query: 'Question',
      expected: 'Case record',
      engine: 'Engine',
      match: 'Agree?',
      agree: 'Agrees',
      disagree: 'Disagrees',
      failed: 'Cannot compute',
    },
    counterfactual: 'Counterfactual',
    bestAct: (id) => `Which ${id} to choose`,
    expectedUtilityOf: (act) => `Expected utility of ${act}`,
    tie: (acts) => `Tie: ${acts}`,
    sourceRole: { origin: 'Origin', treatment: 'Analysis', reference: 'Reference' },
    pages: (pages) => (/[–,-]/.test(pages) ? `pp. ${pages}` : `p. ${pages}`),
  },
  draft: {
    'id-invalid': () => 'An id must start with a letter and use only letters, digits and underscores',
    'id-reserved': (i) => `${i.id} is a reserved word and cannot be an id`,
    'id-duplicate': (i) => `The id ${i.id} is used twice`,
    'values-few': () => 'List at least two values',
    'values-repeat': () => 'The listed values repeat',
    'equation-empty': () => 'No equation yet',
    'equation-parse': (i) => `Cannot read this equation: ${problemText(i.problem)}`,
    'equation-invalid': (i) => `The equation is wrong: ${problemText(i.problem)}`,
    'value-not-in-domain': (i) => `The value ${i.value} of ${i.id} is not in its domain`,
    'prior-range': (i) => `P(${i.id}=1) must be between 0 and 1`,
    'prior-weights': (i) => `The probabilities of ${i.id} must be non-negative and add up to more than 0`,
    'normal-not-in-domain': (i) => `The normal value ${i.value} of ${i.id} is not in its domain`,
    cycle: (i) => `The equations go round in a circle: ${i.cycle.join(' → ')}`,
    model: (i) => i.problems.map((p) => problemText(p)).join('; '),
  },
}

export const MESSAGES: Readonly<Record<Locale, Messages>> = { 'zh-TW': ZH, en: EN }

export function messagesFor(locale: Locale): Messages {
  return MESSAGES[locale]
}

/** A problem from the engine or the data layer, worded in the table's language. */
export function problemMessage(p: Problem, t: Messages): string {
  return problemText(p, t.problems)
}

/** Any thrown value as text: our problems per locale, anything else by its own message. */
export function errorMessage(error: unknown, t: Messages): string {
  if (typeof error === 'object' && error !== null && 'problem' in error) {
    return problemMessage((error as { problem: Problem }).problem, t)
  }
  return error instanceof Error ? error.message : String(error)
}

export function draftIssueMessage(issue: DraftIssue, t: Messages): string {
  return (t.draft[issue.code] as (i: DraftIssue) => string)(issue)
}

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE)

/** Sets the language for every causal-atlas component inside it; a component's own `locale` prop wins. */
export function LocaleProvider({ locale, children }: { readonly locale: Locale; readonly children?: ReactNode }) {
  return createElement(LocaleContext.Provider, { value: locale }, children)
}

/** Wraps `children` in `locale` when given, else leaves the surrounding language in force. */
export function LocaleScope({ locale, children }: { readonly locale?: Locale; readonly children?: ReactNode }) {
  return locale === undefined ? children : createElement(LocaleContext.Provider, { value: locale }, children)
}

export function useLocale(): Locale {
  return useContext(LocaleContext)
}

export function useMessages(): Messages {
  return MESSAGES[useContext(LocaleContext)]
}
