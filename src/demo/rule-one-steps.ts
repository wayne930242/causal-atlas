import type { RuleStep } from '../components/probability/rules-view.ts'

/** Lesson 06's rule 1: the advice can be dropped when the drug is set and the illness is known. */
export const RULE_ONE_STEPS: readonly RuleStep[] = [
  {
    label: '已知病情',
    rule: 1,
    pair: ['Z', 'Y'],
    given: ['X', 'W'],
    cutIn: ['X'],
    equal: [
      { event: 'Y=1', given: 'Z=1 and W=1', do: { X: 1 } },
      { event: 'Y=1', given: 'W=1', do: { X: 1 } },
    ],
  },
  {
    label: '不知道病情',
    rule: 1,
    pair: ['Z', 'Y'],
    given: ['X'],
    cutIn: ['X'],
    equal: [
      { event: 'Y=1', given: 'Z=1', do: { X: 1 } },
      { event: 'Y=1', do: { X: 1 } },
    ],
  },
]
