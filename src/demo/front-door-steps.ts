import type { RuleStep } from '../components/probability/rules-view.ts'

/** Lesson 06's front-door derivation, step by step, as a lesson passes it to view="rules". */
export const FRONT_DOOR_STEPS: readonly RuleStep[] = [
  {
    label: '2',
    rule: 2,
    pair: ['X', 'Z'],
    given: [],
    cutOut: ['X'],
    equal: [
      { event: 'Z=1', do: { X: 1 } },
      { event: 'Z=1', given: 'X=1' },
    ],
  },
  {
    label: '3',
    rule: 2,
    pair: ['Z', 'Y'],
    given: ['X'],
    cutIn: ['X'],
    cutOut: ['Z'],
    equal: [
      { event: 'Y=1', given: 'Z=1', do: { X: 1 } },
      { event: 'Y=1', do: { X: 1, Z: 1 } },
    ],
  },
  {
    label: '4',
    rule: 3,
    pair: ['X', 'Y'],
    given: ['Z'],
    cutIn: ['X', 'Z'],
    equal: [
      { event: 'Y=1', do: { X: 1, Z: 1 } },
      { event: 'Y=1', do: { Z: 1 } },
    ],
  },
  {
    label: '5a',
    rule: 3,
    pair: ['Z', 'X'],
    given: [],
    cutIn: ['Z'],
    equal: [{ event: 'X=1', do: { Z: 1 } }, { event: 'X=1' }],
  },
  {
    label: '5b',
    rule: 2,
    pair: ['Z', 'Y'],
    given: ['X'],
    cutOut: ['Z'],
    equal: [
      { event: 'Y=1', given: 'X=1', do: { Z: 1 } },
      { event: 'Y=1', given: 'X=1 and Z=1' },
    ],
  },
  {
    label: '7',
    rule: 2,
    pair: ['X', 'Y'],
    given: [],
    cutOut: ['X'],
    equal: [
      { event: 'Y=1', do: { X: 1 } },
      { event: 'Y=1', given: 'X=1' },
    ],
  },
]
