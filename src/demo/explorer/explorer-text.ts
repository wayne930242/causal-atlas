import type { Locale } from '../../engine/index.ts'
import type { ComponentId } from './registry.ts'

interface Text {
  readonly title: string
  readonly nav: string
  readonly pick: string
  readonly close: string
  readonly components: Readonly<Record<ComponentId, string>>
  readonly stories: string
  readonly storiesCustom: string
  readonly model: string
  readonly modelSearch: string
  readonly modelNone: string
  readonly lessonModels: string
  readonly blank: string
  readonly controls: string
  readonly page: string
  readonly language: string
  readonly theme: string
  readonly light: string
  readonly dark: string
  readonly snippet: string
  readonly jsx: string
  readonly mdx: string
  readonly copy: string
  readonly copied: string
  readonly copyLink: string
  readonly linkCopied: string
  readonly canvas: string
  readonly errorTitle: string
  readonly unset: string
  readonly add: string
  readonly remove: string
  readonly on: string
  readonly off: string
  readonly jsonError: string
  readonly blogDiffers: string
  readonly sourceKept: string
  readonly resetStory: string
  readonly notice: Readonly<Record<'component' | 'story' | 'model' | 'patch' | 'param' | 'value', string>>
  readonly props: Readonly<Record<string, string>>
  readonly sub: Readonly<Record<string, string>>
  readonly modes: Readonly<Record<string, string>>
  readonly reasons: Readonly<Record<string, string>>
}

export const TEXT: Readonly<Record<Locale, Text>> = {
  'zh-TW': {
    title: '元件瀏覽器',
    nav: '元件與模型',
    pick: '選元件／模型',
    close: '關閉',
    components: { playground: 'CausalPlayground 遊樂場', probability: 'ProbabilityPanel 機率面板', identify: 'IdentifyPanel 識別實驗', lanes: 'WorldLanes 世界分道', case: 'CasePage 案例頁', editor: 'ModelEditor 模型編輯器', cite: 'CiteBlock 引用' },
    stories: '現成的圖',
    storiesCustom: '自己調（不套現成的圖）',
    model: '模型',
    modelSearch: '搜尋模型',
    modelNone: '沒有符合的模型',
    lessonModels: '講義模型',
    blank: '空白模型',
    controls: '設定',
    page: '頁面',
    language: '語言',
    theme: '外觀',
    light: '淺色',
    dark: '深色',
    snippet: '複製用的寫法',
    jsx: 'JSX',
    mdx: '部落格 MDX',
    copy: '複製',
    copied: '已複製',
    copyLink: '複製連結',
    linkCopied: '連結已複製',
    canvas: '畫面',
    errorTitle: '這組設定畫不出來',
    unset: '不設定',
    add: '新增',
    remove: '移除',
    on: '開',
    off: '關',
    jsonError: 'JSON 格式有誤：',
    blogDiffers: '部落格裡這個講義模型的內容和示範站的副本不同，用 id 寫出來的圖可能略有差異。',
    sourceKept: '',
    resetStory: '回到現成的圖',
    notice: {
      component: '網址裡的元件不存在，改用預設元件：',
      story: '網址裡的現成圖不存在或不屬於這個元件：',
      model: '網址裡的模型不存在或這個元件不能用，改用預設模型：',
      patch: '網址裡的模型覆寫不是 JSON 物件：',
      param: '網址裡有不認得的參數，已略過：',
      value: '網址裡這個設定的值讀不懂，改用預設值：',
    },
    props: {
      defaultNotation: '式子的寫法',
      initialInterventions: '一開始的 do()',
      presets: '步驟按鈕',
      digits: '小數位數',
      track: '追蹤的變數',
      verdicts: '實際原因的問題',
      blame: '責備',
      normality: '預設值（常態）',
      dsep: 'd 分隔的變數對',
      sliders: '拉桿',
      prior: '外生變數的機率',
      decision: '決策長條',
      focusSliders: '先顯示的拉桿',
      openPanel: '一開始打開的區塊',
      view: '檢視',
      pair: '看見 vs. do() 的組合',
      counterfactual: '反事實',
      mediation: '中介',
      adjust: '調整（後門）',
      rules: 'do 演算的步驟',
      query: '初始識別查詢',
      actionLabel: '問題的文字',
      initialStep: '起始步驟',
      interventions: 'do()',
      witness: '見證世界',
      heading: '標題',
      lessonHref: '補充連結',
      lessonLabel: '補充連結文字',
      next: '最後一步的下一步',
      tasks: '引導任務',
      url: '網址',
    },
    sub: {
      cause: '原因事件',
      effect: '結果事件',
      theories: '定義',
      responsibility: '算責任程度',
      states: '認知狀態',
      event: '事件',
      observe: '看見',
      intervene: 'do()',
      evidence: '已知（證據）',
      do: 'do()',
      treatment: '處理 X',
      mediators: '中介 Z',
      outcome: '結果事件',
      from: '從',
      to: '到',
      formula: '中介公式',
      x: '原因 x',
      y: '結果 y',
      sets: '分組',
      theory: '定義',
      variable: '變數',
      value: '值',
      a: '第一個變數',
      b: '第二個變數',
    },
    modes: { case: '案例自己的', off: '關閉', custom: '自訂（JSON）', own: '案例自己的', none: '不用' },
    reasons: {
      values: '這個模型有機率，評判需要只有一組值的圖。',
      probability: '這個模型只有一組值，這個設定需要有機率的圖（priors、沒有 context）。',
      normality: '這個模型沒有預設值（normality）。',
      decision: '這個模型沒有自己的決策。',
      lanes: '世界分道需要只有一組值的圖。',
      view: '這個設定只在「{view}」檢視用。',
      step3: '這個檢視只有 3 步。',
    },
  },
  en: {
    title: 'Component explorer',
    nav: 'Components and models',
    pick: 'Pick component / model',
    close: 'Close',
    components: { playground: 'CausalPlayground', probability: 'ProbabilityPanel', identify: 'IdentifyPanel', lanes: 'WorldLanes', case: 'CasePage', editor: 'ModelEditor', cite: 'CiteBlock' },
    stories: 'Ready-made figures',
    storiesCustom: 'Free (no ready-made figure)',
    model: 'Model',
    modelSearch: 'Search models',
    modelNone: 'No model matches',
    lessonModels: 'Lesson models',
    blank: 'Blank model',
    controls: 'Controls',
    page: 'Page',
    language: 'Language',
    theme: 'Theme',
    light: 'Light',
    dark: 'Dark',
    snippet: 'Snippets',
    jsx: 'JSX',
    mdx: 'Blog MDX',
    copy: 'Copy',
    copied: 'Copied',
    copyLink: 'Copy link',
    linkCopied: 'Link copied',
    canvas: 'Figure',
    errorTitle: 'This combination cannot be drawn',
    unset: 'Not set',
    add: 'Add',
    remove: 'Remove',
    on: 'On',
    off: 'Off',
    jsonError: 'Invalid JSON: ',
    blogDiffers: "The blog's copy of this lesson model differs from this demo's copy; a figure written with its id may look slightly different.",
    sourceKept: '',
    resetStory: 'Back to the ready-made figure',
    notice: {
      component: 'The component in the address does not exist; using the default: ',
      story: 'The ready-made figure in the address does not exist or belongs to another component: ',
      model: 'The model in the address does not exist or this component cannot use it; using the default: ',
      patch: 'The model patch in the address is not a JSON object: ',
      param: 'Unknown parameter in the address, ignored: ',
      value: 'The value of this setting in the address could not be read; using the default: ',
    },
    props: {
      defaultNotation: 'Equation notation',
      initialInterventions: 'Initial do()',
      presets: 'Step buttons',
      digits: 'Decimals',
      track: 'Tracked variables',
      verdicts: 'Actual-cause questions',
      blame: 'Blame',
      normality: 'Defaults (normality)',
      dsep: 'd-separation pairs',
      sliders: 'Sliders',
      prior: 'Exogenous probabilities',
      decision: 'Decision bars',
      focusSliders: 'Sliders shown first',
      openPanel: 'Block open at load',
      view: 'View',
      pair: 'See vs. do() pairs',
      counterfactual: 'Counterfactual',
      mediation: 'Mediation',
      adjust: 'Adjustment (back door)',
      rules: 'Do-calculus steps',
      query: 'Initial identification query',
      actionLabel: 'Question text',
      initialStep: 'Initial step',
      interventions: 'do()',
      witness: 'Witness world',
      heading: 'Heading',
      lessonHref: 'Supplement link',
      lessonLabel: 'Supplement link text',
      next: 'Next after the last step',
      tasks: 'Guided tasks',
      url: 'URL',
    },
    sub: {
      cause: 'Cause event',
      effect: 'Effect event',
      theories: 'Definitions',
      responsibility: 'Degree of responsibility',
      states: 'Epistemic states',
      event: 'Event',
      observe: 'Observe',
      intervene: 'do()',
      evidence: 'Evidence',
      do: 'do()',
      treatment: 'Treatment X',
      mediators: 'Mediators Z',
      outcome: 'Outcome event',
      from: 'From',
      to: 'To',
      formula: 'Mediation formula',
      x: 'Cause x',
      y: 'Effect y',
      sets: 'Groupings',
      theory: 'Definition',
      variable: 'Variable',
      value: 'Value',
      a: 'First variable',
      b: 'Second variable',
    },
    modes: { case: "The case's own", off: 'Off', custom: 'Custom (JSON)', own: "The case's own", none: 'None' },
    reasons: {
      values: 'This model has probabilities; verdicts need a graph with a single set of values.',
      probability: 'This model has one set of values; this setting needs a probability graph (priors, no context).',
      normality: 'This model has no defaults (normality).',
      decision: 'This model has no decision of its own.',
      lanes: 'World lanes need a graph with a single set of values.',
      view: 'This setting is used only by the "{view}" view.',
      step3: 'This view has only 3 steps.',
    },
  },
}
