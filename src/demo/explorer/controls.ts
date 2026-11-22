import type { Locale } from '../../engine/index.ts'
import { TEXT } from './explorer-text.ts'
import type { ModelInfo, VariableInfo } from './model-info.ts'
import type { ComponentId } from './registry.ts'
import { NOTATIONS, PROBABILITY_VIEWS, THEORIES } from './registry.ts'

export type ControlKind =
  | 'select'
  | 'toggle'
  | 'number'
  | 'text'
  | 'event'
  | 'variables'
  | 'assignment'
  | 'priors'
  | 'json'
  | 'list'
  | 'group'
  | 'modes'
  | 'value'

export interface Option {
  readonly value: string
  readonly label: string
}

export interface Mode {
  readonly id: string
  readonly label: string
  readonly value: unknown
  readonly disabled?: boolean
}

export interface ControlSpec {
  readonly key: string
  readonly label: string
  readonly kind: ControlKind
  /** The one-line reason this model (or view) cannot use the control. */
  readonly disabled?: string
  readonly options?: readonly Option[]
  readonly min?: number
  readonly max?: number
  /** `group`: the object's fields; `list`: each item's fields. */
  readonly fields?: readonly ControlSpec[]
  /** `list`: items are arrays, fields keyed `0`, `1`. */
  readonly tuple?: boolean
  readonly modes?: readonly Mode[]
  /** Suggestions for an event text, `X=1`. */
  readonly events?: readonly string[]
  readonly vars?: readonly VariableInfo[]
  /** What a `group` or `list` item starts as when added. */
  readonly init?: unknown
  /** `value`: the sibling field naming the variable whose domain gives the options. */
  readonly domainOf?: string
}

const NO_VARS: readonly VariableInfo[] = []

function opts(ids: readonly string[], info: ModelInfo | undefined): Option[] {
  return ids.map((id) => {
    const name = info?.variables.find((v) => v.id === id)?.name
    return { value: id, label: name === undefined || name === id ? id : `${id} ${name}` }
  })
}

function eventHints(info: ModelInfo | undefined): string[] {
  return (info?.variables ?? NO_VARS).flatMap((v) => v.values.map((value) => `${v.id}=${String(value)}`))
}

export function controlsFor(id: ComponentId, info: ModelInfo | undefined, args: Readonly<Record<string, unknown>>, locale: Locale): ControlSpec[] {
  const t = TEXT[locale]
  const all = info?.variables.map((v) => v.id) ?? []
  const endo = info?.endogenous ?? []
  const vars = info?.variables ?? NO_VARS
  const events = eventHints(info)
  const label = (key: string): string => t.props[key] ?? key
  const sub = (key: string): string => t.sub[key] ?? key
  const reason = (key: string): string => t.reasons[key] ?? key
  const notOn = (when: boolean, why: string): string | undefined => (when ? why : undefined)
  const isProb = info?.kind === 'probability'
  const isVals = info?.kind === 'values'
  const firstEvent = (i: number): string => (endo.length > 0 ? `${endo[Math.min(i, endo.length - 1)]}=1` : '')

  const notation: ControlSpec = { key: 'defaultNotation', label: label('defaultNotation'), kind: 'select', options: NOTATIONS.map((n) => ({ value: n, label: n })) }
  const digits: ControlSpec = { key: 'digits', label: label('digits'), kind: 'number', min: 1, max: 6 }
  const ev = (key: string, text: string): ControlSpec => ({ key, label: sub(text), kind: 'event', events })
  const assignment = (key: string, text: string): ControlSpec => ({ key, label: text, kind: 'assignment', vars })
  const theoryOptions: Option[] = THEORIES.map((x) => ({ value: x, label: x }))

  switch (id) {
    case 'playground':
      return [
        notation,
        assignment('initialInterventions', label('initialInterventions')),
        {
          key: 'presets',
          label: label('presets'),
          kind: 'modes',
          modes: [
            { id: 'case', label: t.modes.case, value: true },
            { id: 'off', label: t.modes.off, value: false },
          ],
        },
        digits,
        { key: 'track', label: label('track'), kind: 'variables', options: opts(endo, info) },
        {
          key: 'verdicts',
          label: label('verdicts'),
          kind: 'list',
          disabled: notOn(isProb, reason('values')),
          init: { cause: firstEvent(0), effect: firstEvent(99) },
          fields: [
            ev('cause', 'cause'),
            ev('effect', 'effect'),
            { key: 'theories', label: sub('theories'), kind: 'variables', options: theoryOptions },
            { key: 'responsibility', label: sub('responsibility'), kind: 'toggle' },
          ],
        },
        {
          key: 'blame',
          label: label('blame'),
          kind: 'group',
          disabled: notOn(isVals, reason('probability')),
          init: { cause: firstEvent(0), effect: firstEvent(99) },
          fields: [
            ev('cause', 'cause'),
            ev('effect', 'effect'),
            { key: 'theories', label: sub('theories'), kind: 'variables', options: theoryOptions.slice(1) },
            { key: 'states', label: sub('states'), kind: 'json' },
          ],
        },
        { key: 'normality', label: label('normality'), kind: 'toggle', disabled: notOn(info !== undefined && !info.hasNormality, reason('normality')) },
        {
          key: 'dsep',
          label: label('dsep'),
          kind: 'list',
          tuple: true,
          disabled: notOn(isVals, reason('probability')),
          init: [all[0] ?? '', all[1] ?? ''],
          fields: [
            { key: '0', label: sub('a'), kind: 'select', options: opts(all, info) },
            { key: '1', label: sub('b'), kind: 'select', options: opts(all, info) },
          ],
        },
        { key: 'sliders', label: label('sliders'), kind: 'variables', options: opts(info?.sliderable ?? [], info), disabled: notOn(isVals, reason('probability')) },
        { key: 'prior', label: label('prior'), kind: 'priors', vars: vars.filter((v) => v.exogenous), disabled: notOn(isVals, reason('probability')) },
        {
          key: 'decision',
          label: label('decision'),
          kind: 'modes',
          disabled: notOn(isVals, reason('probability')),
          modes: [
            { id: 'none', label: t.modes.none, value: undefined },
            { id: 'own', label: t.modes.own, value: true, disabled: info !== undefined && !info.hasDecision },
          ],
        },
        { key: 'focusSliders', label: label('focusSliders'), kind: 'variables', options: opts(info?.sliderable ?? [], info), disabled: notOn(isVals, reason('probability')) },
        {
          key: 'openPanel',
          label: label('openPanel'),
          kind: 'modes',
          modes: [
            { id: 'default', label: t.modes.case, value: undefined },
            { id: 'probabilities', label: 'probabilities', value: 'probabilities' },
            { id: 'equations', label: 'equations', value: 'equations' },
          ],
        },
      ]
    case 'probability': {
      const view = typeof args.view === 'string' ? args.view : 'sliders'
      const only = (v: string): string | undefined => (view === v ? undefined : reason('view').replace('{view}', v))
      const stepMax = view === 'mediation' ? 4 : 3
      const stepOff = view === 'counterfactual' || view === 'mediation' ? undefined : reason('view').replace('{view}', 'counterfactual / mediation')
      return [
        { key: 'view', label: label('view'), kind: 'select', options: PROBABILITY_VIEWS.map((v) => ({ value: v, label: v })) },
        notation,
        digits,
        {
          key: 'pair',
          label: label('pair'),
          kind: 'list',
          disabled: only('compare'),
          init: { event: firstEvent(99), observe: firstEvent(0), intervene: {} },
          fields: [ev('event', 'event'), ev('observe', 'observe'), assignment('intervene', sub('intervene'))],
        },
        {
          key: 'counterfactual',
          label: label('counterfactual'),
          kind: 'group',
          disabled: only('counterfactual'),
          init: { evidence: firstEvent(99), do: {}, event: firstEvent(99) },
          fields: [ev('evidence', 'evidence'), assignment('do', sub('do')), ev('event', 'event')],
        },
        {
          key: 'mediation',
          label: label('mediation'),
          kind: 'group',
          disabled: only('mediation'),
          init: { treatment: endo[0] ?? '', mediators: endo.length > 2 ? [endo[1]] : [], outcome: firstEvent(99), from: 0, to: 1 },
          fields: [
            { key: 'treatment', label: sub('treatment'), kind: 'select', options: opts(endo, info) },
            { key: 'mediators', label: sub('mediators'), kind: 'variables', options: opts(endo, info) },
            ev('outcome', 'outcome'),
            { key: 'from', label: sub('from'), kind: 'value', vars, domainOf: 'treatment' },
            { key: 'to', label: sub('to'), kind: 'value', vars, domainOf: 'treatment' },
            { key: 'formula', label: sub('formula'), kind: 'toggle' },
          ],
        },
        {
          key: 'adjust',
          label: label('adjust'),
          kind: 'group',
          disabled: only('adjust'),
          init: { x: endo[0] ?? '', y: endo[endo.length - 1] ?? '' },
          fields: [
            { key: 'x', label: sub('x'), kind: 'select', options: opts(endo, info) },
            { key: 'y', label: sub('y'), kind: 'select', options: opts(endo, info) },
            { key: 'sets', label: sub('sets'), kind: 'json' },
          ],
        },
        { key: 'rules', label: label('rules'), kind: 'json', disabled: only('rules') },
        { key: 'actionLabel', label: label('actionLabel'), kind: 'text', disabled: stepOff },
        { key: 'initialStep', label: label('initialStep'), kind: 'number', min: 1, max: stepMax, disabled: stepOff },
      ]
    }
    case 'lanes': {
      const off = notOn(isProb, reason('lanes'))
      return [
        notation,
        { ...assignment('interventions', label('interventions')), disabled: off },
        { key: 'actionLabel', label: label('actionLabel'), kind: 'text', disabled: off },
        {
          key: 'witness',
          label: label('witness'),
          kind: 'group',
          disabled: off,
          init: { cause: firstEvent(0), effect: firstEvent(99) },
          fields: [ev('cause', 'cause'), ev('effect', 'effect'), { key: 'theory', label: sub('theory'), kind: 'select', options: theoryOptions }],
        },
        { key: 'initialStep', label: label('initialStep'), kind: 'number', min: 1, max: 3, disabled: off },
      ]
    }
    case 'case':
      return [
        { key: 'heading', label: label('heading'), kind: 'toggle' },
        { key: 'initialStep', label: label('initialStep'), kind: 'number', min: 1, max: 4 },
        notation,
        digits,
        { key: 'lessonHref', label: label('lessonHref'), kind: 'text' },
        { key: 'lessonLabel', label: label('lessonLabel'), kind: 'text' },
        { key: 'next', label: label('next'), kind: 'json' },
      ]
    case 'editor':
      return [notation, digits, { key: 'tasks', label: label('tasks'), kind: 'json' }]
    case 'cite':
      return [{ key: 'url', label: label('url'), kind: 'text' }]
  }
}
