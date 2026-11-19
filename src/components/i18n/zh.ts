import type { ProblemWording } from '../../engine/errors.ts'
import { problemText } from '../../engine/errors.ts'
import type { Locale } from '../../engine/types.ts'
import type { DraftWording, NodeToggle } from './common.ts'
import { AUTHOR_EN, AUTHOR_ZH } from './common.ts'

/** The interface text in Traditional Chinese, the default; its shape is the {@link Messages} type every table follows. */

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
    'responsibility-butfor': () => '責任程度與責備程度只對 HP 定義成立，不適用於簡單反事實',
    'responsibility-single-event': (p) => `責任程度只對單一事件 X=x 有定義，${p.cause} 不是`,
    'blame-no-theories': () => '責備程度至少要指定一個定義',
    'blame-no-mass': () => '在這個機率分布下，原因（連同觀察）的機率是 0',
    'mediation-not-endogenous': (p) => `處置和中介都要是內生變項，${p.id} 不是`,
    'mediation-no-mediators': () => '至少要指定一個中介變項',
    'mediation-mediator-repeats': (p) => `中介變項 ${p.id} 列了兩次`,
    'mediation-treatment-is-mediator': (p) => `處置 ${p.id} 不能同時是中介變項`,
    'mediation-same-values': (p) => `效應要比較兩個不同的處置值，兩個都是 ${p.value}`,
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
    'arc-needs-children': (p) => `${p.id} 要畫成兩個子變項之間的弧線，所以至少要有兩個子變項`,
    'arc-also-node': (p) => `${p.id} 不能同時畫成弧線和節點（show_exogenous 或 layout 也列了它）`,
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

export const ZH = {
  locale: 'zh-TW' as Locale,
  problems: ZH_PROBLEMS,
  /** Splits a story into sentences. */
  sentences: (text: string): string[] => text.split(/(?<=[。？！])/),
  list: (items: readonly string[]): string => items.join('、'),
  /** Joins clauses of one line. */
  clauses: (items: readonly string[]): string => items.join('；'),
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
  ev: {
    title: '期望值',
    edt: '證據',
    cdt: '因果',
    choose: (acts: string, by: string | undefined): string => (by === undefined ? `選 ${acts}` : `選 ${acts}（多 ${by}）`),
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
  arc: {
    label: '不明共因',
    tip: (cause: string, a: string, b: string): string =>
      `${a} 與 ${b} 有一個看不見的共同原因 ${cause}。圖上不畫成節點，畫成虛線雙箭頭弧線，也不能觀察它。對 ${a} 或 ${b} 做 do()，就切斷那一端，弧線隨之消失。`,
  },
  was: (value: string): string => `原本 ${value}`,
  nodeReadout: {
    unknown: 'P(=1)',
    observed: (value: string): string => `已知 = ${value}`,
    intervened: (value: string): string => `do = ${value}`,
  },
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
                      : toggle === 'pick'
                        ? '按一下加進或移出已知集合'
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
  tt: {
    count: (n: number, setting: string): string => (setting === '' ? `${n} 列` : `${n} 列，在 ${setting} 下成立`),
    actual: (n: number): string => `${n} 列，在實際世界成立`,
    full: (n: number): string => `展開完整真值表（${n} 列）`,
    tip: '每列只寫會影響結果的變數，所有列合起來和完整真值表等價；只列出在目前的設定下可能成立的列。',
  },
  valueLegend: '實心＝發生（1）　空心＝沒發生（0）',
  probLegend: '填色的高度＝等於 1 的機率',
  probLegendFinite: '填色的高度＝等於 1 的機率；多值變項每個值一根長條，高度與取該值的機率成正比，最高的一根標出它的機率',
  probLegendBars: '每個值一根長條，高度與取該值的機率成正比，最高的一根標出它的機率',

  // probability panel
  unchanged: '不變',
  probEquations: '式子和機率',
  tabsLabel: '圖下方的內容',
  tab: { verdicts: '判定', dsep: 'd 分隔', strata: '分組表', background: '背景表', effects: '效應', blame: '責備' },
  jointOnly: '這個案例的機率是整張聯合分布，不能逐一調整。',
  sliderLabel: (label: string): string => `${label}的機率`,
  nodesShow: '節點顯示',
  zeroOne: '0／1',
  probGraphTitle: (title: string): string => `${title}：各變項等於 1 的機率`,
  observing: (event: string): string => `觀察 ${event}`,
  comparePick: '切換比較的值',
  notRecomputed: '尚未重算',
  readingLabel: '視角',
  dsep: {
    pairs: '路徑的兩端',
    pair: (x: string, y: string): string => `${x} 與 ${y}`,
    known: (ids: readonly string[]): string => (ids.length === 0 ? '已知：無' : `已知 {${ids.join(', ')}}`),
    open: '通',
    blocked: '堵住',
    delta: (value: string): string => `相依程度 ${value}`,
    pathSep: '：',
    adjacent: '直接相連',
    middlesUnknown: '中間點都未知',
    middleKnown: (id: string): string => `中間點 ${id} 已知`,
    colliderUnknown: (id: string): string => `對撞點 ${id} 和它的後代都未知`,
    colliderKnown: (id: string): string => `對撞點 ${id} 已知`,
    descendantKnown: (id: string, by: string): string => `對撞點 ${id} 的後代 ${by} 已知`,
    noPath: '沒有路徑',
    more: (n: number): string => `另 ${n} 條`,
    tip: '已知集合就是圖上觀察的變項；有干預時，用剪掉箭頭之後的圖判斷。相依程度：已知這些值時，各種取值組合裡 |P(x,y|z) − P(x|z)P(y|z)| 的最大值，0 表示獨立。',
  },
  adj: {
    tag: '調整',
    sets: '按哪些變數分組',
    by: (set: string): string => `分組：${set}`,
    none: '不分組',
    grouped: '分組',
    all: '全體',
    ok: '後門準則成立',
    descendant: (id: string, x: string): string => `${id} 是 ${x} 的後代`,
    opened: (by: string, path: string): string => `已知 ${by} 打開 ${path}`,
    backdoor: (path: string): string => `後門 ${path} 通`,
    equal: '＝ 干預值',
    differ: '≠ 干預值',
    group: '組',
    pGroup: 'P(組)',
    weighted: '加權和',
    doRow: '干預',
    tip: '後門準則（Pearl 2009，定義 3.3.1）：(i) 分組的變數都不是 X 的後代；(ii) 拿掉 X 出去的箭頭後，它們堵住 X 與 Y 之間的每一條路。兩條都成立，加權和就等於干預值。圖上只標非因果的路：通的亮起，堵住的畫虛線。一層的機率是 0，或那一層沒有某個 X 值，寫「—」：這一層沒有資料。',
  },
  rules: {
    rule: (n: number): string => `規則${['一', '二', '三'][n - 1] ?? String(n)}`,
    cut: (into: readonly string[], out: readonly string[]): string => {
      const parts = [into.length > 0 ? `指向 ${into.join('、')} 的` : '', out.length > 0 ? `${out.join('、')} 出去的` : ''].filter((x) => x !== '')
      return parts.length === 0 ? '不剪箭頭' : `剪掉${parts.join('、')}箭頭`
    },
    steps: '步驟',
    separated: '分隔',
    applies: (rule: string): string => `，${rule}適用`,
    notApplies: (rule: string): string => `，${rule}不適用`,
    graphTitle: (title: string, rule: string): string => `${title}：${rule}的截斷圖`,
    tip: '截斷圖照課文寫的剪法畫：被剪的箭頭畫成切斷，箭頭被剪掉的變數加上夾角；剪掉箭頭之後不再是原本的模型，圖上不寫機率。點節點把它加進或移出已知集合（不帶值）；按步驟鈕回到那一步原本的已知集合。等式的兩邊用完整模型算。規則三剪掉指向 Z(W) 的箭頭，Z(W) 也由課文寫明。',
  },
  normality: {
    kicker: '偏離預設值',
    deviant: (value: string): string => `偏離（預設 ${value}）`,
    default: (value: string): string => `預設 ${value}`,
    actualOnly: (deviant: string): string => `實際世界 ${deviant}`,
    compare: (world: string, actual: string, order: string): string => `這個世界 ${world}；實際世界 ${actual}，${order}`,
    order: { more: '更正常', same: '一樣正常', less: '較不正常', incomparable: '無法比較' },
    tip: '偏離：變項取了預設值以外的值。一個世界的偏離都在另一個世界的偏離之中，才算至少一樣正常；兩邊各有對方沒有的偏離，就無法比較。',
  },
  witness: {
    question: (cause: string, effect: string): string => `${cause} 是 ${effect} 的原因嗎？`,
    answer: { cause: '是', 'not-cause': '不是', 'part-of-cause': '原因的一部分' },
    now: '目前的世界',
    tip: '見證：把原因改成別的值、其餘設定的變項固定住之後，結果不發生。各版本對「固定」的要求不同：簡單反事實不固定任何變項，修正版只能固定在實際值，原始版與更新版可以固定在別的值，但要通過充分性檢查。',
    is: (ids: string): string => `是 ${ids} 的見證`,
    not: (reason: string): string => `不是，${reason}`,
    group: (names: string, sentence: string): string => `${names}：${sentence}`,
    join: (parts: readonly string[]): string => parts.map((p) => `${p}。`).join(''),
    failure: {
      notActual: (cause: string, effect: string): string => `${cause} 或 ${effect} 在實際世界不成立`,
      causeNotChanged: (ids: string): string => `${ids} 沒有改成別的值`,
      holdsOthers: (ids: string): string => `只改 ${ids}，不能固定其他變項`,
      notAtActual: (ids: string, values: string): string => `${ids} 沒有固定在實際值 ${values}`,
      effectHolds: (effect: string): string => `${effect} 還成立`,
      notSufficient: (cause: string, effect: string): string => `固定在這些值時，${cause} 不足以讓 ${effect} 成立`,
      lessNormal: '這個世界不比實際世界正常',
    },
    held: (value: string): string => `固定（實際 ${value}）`,
    heldActual: '固定（實際值）',
    heldPlain: '固定',
  },
  reading: { interventional: '干預', counterfactual: '反事實' },
  readingHint: { interventional: '點選的是干預之後看到的結果', counterfactual: '點選的是實際發生過的事，再問：假如當初……會怎樣' },
  actually: (value: string): string => `實際 ${value}`,
  cf: {
    kicker: '反事實',
    head: (evidence: string, doText: string): string => `${evidence} ⇒ 若 ${doText}`,
    steps: ['溯因', '行動', '預測'] as readonly string[],
    stepsLabel: '反事實的步驟',
    next: '下一步',
    caption: (step: number, evidence: string, assignment: string): string =>
      step === 1
        ? `溯因：已知 ${evidence}，每種背景的機率改成已知之後的機率；不可能的背景變成 0。`
        : step === 2
          ? `行動：換成 ${assignment}，剪掉指進它的箭頭；背景的機率不動。`
          : '預測：在每種背景下照式子重算，再按溯因後的機率加總。',
    background: (ids: readonly string[]): string => `背景（${ids.join('、')}）`,
    prior: '原本',
    given: (evidence: string): string => `已知 ${evidence} 後`,
    after: (doText: string, id: string): string => `${doText} 後的 ${id}`,
    hiddenZero: (n: number): string => `其他 ${n} 種背景機率為 0`,
    graphTitle: (title: string, step: string): string => `${title}：反事實的${step}`,
  },
  med: {
    kicker: '中介效應',
    head: (transition: string, outcome: string): string => `${transition}，看 ${outcome}`,
    steps: ['總效應', '受控直接', '自然直接', '自然間接'] as readonly string[],
    stepsLabel: '中介效應的步驟',
    next: '下一步',
    mediatorsLabel: '中介變項固定的值',
    caption: (step: number, treatment: string, from: string, to: string, mediators: string, z: string): string =>
      step === 1
        ? `總效應：把 ${treatment} 設成 ${to}，${mediators} 照式子重算；對照 ${treatment} 設成 ${from}。`
        : step === 2
          ? `受控直接效應：${treatment} 設成 ${to}，同時把 ${z} 固定成常數；對照 ${treatment} 設成 ${from}，${z} 一樣固定。經過 ${mediators} 的路被切斷。`
          : step === 3
            ? `自然直接效應：${treatment} 設成 ${to}，${mediators} 卻固定在 ${treatment}=${from} 時它自己會有的值（每種背景各算各的）；對照 ${treatment} 維持 ${from}。只有直接那條路看到改變。`
            : `自然間接效應：${treatment} 維持 ${from}，${mediators} 卻固定在 ${treatment}=${to} 時它會有的值；對照 ${treatment} 維持 ${from}。只有經過 ${mediators} 的路看到改變。`,
    graphTitle: (title: string, step: string): string => `${title}：中介效應的${step}`,
    effect: ['總效應 TE', '受控直接效應 CDE', '自然直接效應 NDE', '自然間接效應 NIE'] as readonly string[],
    result: '算式',
    effectsHead: { effect: '效應', value: '數值' },
    controlledAt: (z: string): string => `受控直接效應 CDE（${z}）`,
    reverse: '反向的間接效應 IE(reverse)',
    decomposition: 'TE = NDE − IE(reverse)',
    decomposes: (te: string, nde: string, ie: string): string => `${te} = ${nde} − (${ie})`,
    formulaDirect: '中介公式 (4.17)，直接',
    formulaIndirect: '中介公式 (4.18)，間接',
    equal: (name: string): string => `＝ ${name}`,
    differ: (name: string): string => `≠ ${name}`,
    undefinedCell: '—',
    missing: (cells: string): string => `沒有資料的格子：${cells}`,
    tip: '總效應 TE = P(Y_x*) − P(Y_x)。受控直接效應把中介變項當常數固定；自然直接效應 NDE = P(Y_{x*, Z_x}) − P(Y_x) 讓中介變項維持在 x 時它自己會有的值；自然間接效應 NIE = P(Y_{x, Z_x*}) − P(Y_x)。反向的間接效應 IE(reverse) = P(Y_{x*, Z_x}) − P(Y_x*)，Pearl（2009，4.15）：TE = NDE − IE(reverse)。中介公式（4.17、4.18）只用觀察到的分布，處置、中介變項與結果之間沒有未觀察的共同原因時（例如 X 隨機分派，且中介與結果沒有混淆）等於 NDE、NIE（Pearl 2009，p. 132）；某一格 P(x, z) 為 0 就算不出來，寫「—」。',
    background: { p: '機率', zAt: (ids: string, x: string): string => `${ids}(${x})`, yAt: (y: string, x: string): string => `${y}(${x})`, yAtZ: (y: string, x: string, z: string): string => `${y}(${x}, ${z})` },
    showAll: (n: number): string => `看全部 ${n} 種背景`,
    fewer: '收起',
  },
  resp: {
    cell: (degree: string): string => `責任 ${degree}`,
    tipZero: '責任程度（Halpern 2016，定義 6.1.1、6.1.6）：不是原因，也不是原因的一部分，所以是 0。',
    tip: (k: number, held: string, cause: string, normality: boolean): string =>
      `責任程度 1/k（Halpern 2016，定義 6.1.1、6.1.6）：k 是原因裡的變項，加上見證固定住的變項，取最小；被固定的變項不一定要改值（Halpern 例 6.1.4）。這裡 k = ${k}：${held === '' ? '見證不固定任何變項' : `見證固定 ${held}`}，原因是 ${cause}。${normality ? '只算不比實際世界更不正常的見證。' : ''}`,
  },
  blame: {
    question: (cause: string, effect: string): string => `${cause} 要為 ${effect} 負多少責備？`,
    state: '認知狀態',
    documentState: '文件裡的機率',
    given: (observation: string): string => `已知 ${observation}`,
    degree: '責備',
    contexts: (n: number): string => `${n} 種背景`,
    fold: (n: number): string => `每種背景的責任（${n} 種）`,
    background: (ids: readonly string[]): string => `背景（${ids.join('、')}）`,
    probability: '機率',
    responsibility: (theory: string): string => `責任（${theory}）`,
    tip: (cause: string): string =>
      `責備程度（Halpern 2016，定義 6.2.1）：每種背景的責任程度，乘上那種背景在這個認知狀態裡的機率，再加總。依 Halpern 的假設，認知狀態裡 ${cause} 一定發生，所以機率是以 ${cause} 為條件，已知的觀察再加進條件。同一個模型的不同認知狀態，只換機率，式子不變。`,
  },
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
  sliderEmbed: '滑桿的位置不會記進嵌入碼，嵌入的圖從原本的機率開始。',
  playgroundHintMore: (probabilistic: boolean): string =>
    probabilistic
      ? '觀察：先觀察到 1，再點換成 0，第三下取消。干預：設成 1，旁邊的滑桿可以改成 0 或其他機率；Esc 關掉滑桿。'
      : '先固定在目前的值，再點換成另一個值，第三下取消；多值的節點用滑桿選值。',
  moreInfo: '說明',
  cfHint: '點一下是實際世界的觀察；長按、右鍵或 Shift＋點是假設的干預。',
  cfHintMore: '先依觀察回推背景，再在同樣的背景下套上干預。節點顯示假設世界的機率，「實際 v」是實際世界的值；同一個節點可以既是觀察又是干預。',
  trail: '軌跡',
  trailStep: (value: string, setting: string): string => (setting === '' ? value : `${value}（${setting}）`),
  trailLine: (id: string, steps: readonly string[], dropped: boolean): string =>
    `${id}：${dropped ? '…' : ''}${steps.reduce((acc, s, i) => (i === 0 ? s : `${acc}${acc.endsWith('）') ? '→ ' : ' → '}${s}`), '')}`,
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
    recomputedNote: '你改過模型：「你的模型」一欄依改過的式子重算。',
    task: {
      label: (n: number): string => `任務 ${n}`,
      start: '從它開始',
      guess: (cause: string, effect: string): string => `先猜：哪些定義會判 ${cause} 是 ${effect} 的原因？`,
      check: '檢查',
      same: (ids: string): string => `✓ ${ids} 的式子和目標相同。`,
      score: (right: number, all: number): string => `你猜對 ${right} / ${all}：`,
      counter: (at: string, id: string, yours: string, goal: string): string => `${at} 時，你的 ${id} 是 ${yours}，目標是 ${goal}。`,
      missing: (id: string): string => `模型裡沒有 ${id}，或它沒有式子。`,
      broken: '模型還有錯，先修好再檢查。',
    },
    copyNote: '選一個案例，就從它的副本改起',
    intuitionIs: '一般人的判斷',
    verdictTable: {
      heading: '各理論的判定',
      theory: '標準',
      query: '問題',
      expected: '案例記錄',
      engine: '引擎算出',
      yours: '你的模型',
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
