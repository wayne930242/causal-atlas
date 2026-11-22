import type { RuleStep } from '../components/probability/rules-view.ts'

/** Lesson 06's switch graphs, as the lesson passes them to view="rules": rule 2 on the front door, rule 3's exception. */
export const SWITCH_RULE_TWO: readonly RuleStep[] = [
  {
    label: '規則二：依開關',
    rule: 2,
    pair: ['F_Z', 'Y'],
    given: ['X', 'Z'],
    switches: ['Z'],
    equal: [
      { event: 'Y=1', given: 'X=1', do: { Z: 1 } },
      { event: 'Y=1', given: 'X=1 and Z=1' },
    ],
  },
  {
    label: '規則三：依開關',
    rule: 3,
    pair: ['F_Z', 'X'],
    given: [],
    switches: ['Z'],
    equal: [{ event: 'X=1', do: { Z: 1 } }, { event: 'X=1' }],
  },
]

export const SWITCH_RULE_THREE_EXCEPTION: readonly RuleStep[] = [
  {
    label: '開關',
    rule: 3,
    pair: ['F_Z', 'Y'],
    given: ['W'],
    switches: ['Z'],
    equal: [
      { event: 'Y=1', given: 'W=1', do: { Z: 1 } },
      { event: 'Y=1', given: 'W=1' },
    ],
  },
]
