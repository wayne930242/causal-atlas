import { DEFAULT_URL } from '../../components/export/cite.ts'

export type ComponentId = 'playground' | 'probability' | 'identify' | 'lanes' | 'case' | 'editor' | 'cite'

/** How a prop travels in the hash: raw text, a number, a boolean, or JSON. */
export type PropKind = 'string' | 'number' | 'boolean' | 'json'

export interface PropDef {
  readonly name: string
  readonly kind: PropKind
  /** The component's own default; a snippet leaves a prop equal to it out. */
  readonly default?: unknown
}

export type SourceKind = 'lesson' | 'case' | 'blank'

export interface ComponentDef {
  readonly id: ComponentId
  /** The exported component's name. */
  readonly jsx: string
  readonly sources: readonly SourceKind[]
  /** Props in the component's own order: the order a snippet writes them. */
  readonly props: readonly PropDef[]
  /** The blog wrapper `CausalModel`'s `as` for a lesson model; undefined: no `as` (the playground), or no wrapper at all. */
  readonly blogAs?: 'probability' | 'lanes'
  /** The blog has `CausalModel` (and `CausalModelEditor`, which takes only `locale` and `tasks`) for this component. */
  readonly blog: 'model' | 'editor' | 'none'
}

const NOTATION: PropDef = { name: 'defaultNotation', kind: 'string', default: 'propositional' }
const DIGITS: PropDef = { name: 'digits', kind: 'number', default: 2 }

export const COMPONENTS: readonly ComponentDef[] = [
  {
    id: 'playground',
    jsx: 'CausalPlayground',
    sources: ['lesson', 'case'],
    blog: 'model',
    props: [
      NOTATION,
      { name: 'initialInterventions', kind: 'json' },
      { name: 'presets', kind: 'json', default: true },
      DIGITS,
      { name: 'track', kind: 'json' },
      { name: 'verdicts', kind: 'json' },
      { name: 'blame', kind: 'json' },
      { name: 'normality', kind: 'boolean', default: true },
      { name: 'dsep', kind: 'json' },
      { name: 'sliders', kind: 'json' },
      { name: 'prior', kind: 'json' },
      { name: 'decision', kind: 'json' },
      { name: 'openPanel', kind: 'string' },
      { name: 'focusSliders', kind: 'json' },
    ],
  },
  {
    id: 'probability',
    jsx: 'ProbabilityPanel',
    sources: ['lesson', 'case'],
    blogAs: 'probability',
    blog: 'model',
    props: [
      { name: 'view', kind: 'string', default: 'sliders' },
      { name: 'pair', kind: 'json' },
      { name: 'counterfactual', kind: 'json' },
      { name: 'mediation', kind: 'json' },
      { name: 'adjust', kind: 'json' },
      { name: 'rules', kind: 'json' },
      { name: 'actionLabel', kind: 'string' },
      { name: 'initialStep', kind: 'number' },
      NOTATION,
      DIGITS,
    ],
  },
  {
    id: 'identify',
    jsx: 'IdentifyPanel',
    sources: ['lesson', 'case'],
    blog: 'none',
    props: [{ name: 'query', kind: 'json' }],
  },
  {
    id: 'lanes',
    jsx: 'WorldLanes',
    sources: ['lesson', 'case'],
    blogAs: 'lanes',
    blog: 'model',
    props: [NOTATION, { name: 'interventions', kind: 'json' }, { name: 'actionLabel', kind: 'string' }, { name: 'witness', kind: 'json' }, { name: 'initialStep', kind: 'number' }],
  },
  {
    id: 'case',
    jsx: 'CasePage',
    sources: ['case'],
    blog: 'none',
    props: [
      { name: 'heading', kind: 'boolean', default: true },
      { name: 'initialStep', kind: 'number', default: 1 },
      NOTATION,
      DIGITS,
      { name: 'lessonHref', kind: 'string' },
      { name: 'lessonLabel', kind: 'string' },
      { name: 'next', kind: 'json' },
    ],
  },
  {
    id: 'editor',
    jsx: 'ModelEditor',
    sources: ['lesson', 'case', 'blank'],
    blog: 'editor',
    props: [NOTATION, DIGITS, { name: 'tasks', kind: 'json' }],
  },
  {
    id: 'cite',
    jsx: 'CiteBlock',
    sources: [],
    blog: 'none',
    props: [{ name: 'url', kind: 'string', default: DEFAULT_URL }],
  },
]

export function component(id: ComponentId): ComponentDef {
  const found = COMPONENTS.find((c) => c.id === id)
  if (found === undefined) throw new Error(`no component ${id}`)
  return found
}

export function isComponentId(text: string): text is ComponentId {
  return COMPONENTS.some((c) => c.id === text)
}

/**
 * Hash parameters the explorer owns. `case`, `model`, `do` and `pdo` belong to the model editor's own
 * address (use-hash-sync.ts); none of them is ever a prop or a reserved word of ours.
 */
export const RESERVED: readonly string[] = ['c', 's', 'src', 'patch', 'unset', 'lang', 'theme']
export const EDITOR_PARAMS: readonly string[] = ['case', 'model', 'do', 'pdo']

export const PROBABILITY_VIEWS = ['sliders', 'compare', 'counterfactual', 'adjust', 'rules', 'mediation'] as const
export const NOTATIONS = ['propositional', 'cases', 'arithmetic', 'causal'] as const
export const THEORIES = ['butfor', 'hp-original', 'hp-updated', 'hp-modified', 'hp-normality'] as const
