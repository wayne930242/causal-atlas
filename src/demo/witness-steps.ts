import type { PlaygroundPreset } from '../components/playground/playground-options.ts'

export const GUN_STEPS: readonly PlaygroundPreset[] = [
  { label: '必要性', interventions: { A: 0 }, hold: { B: 1, C: 0 }, expect: { D: 0 } },
  { label: '原始版的充分性', interventions: { A: 1 }, hold: { B: 1, C: 0 }, expect: { D: 1 } },
  { label: '只保留 C 的固定', interventions: { A: 1 }, hold: { C: 0 }, test: '更新版的充分性', expect: { D: 1 } },
]

export const ROCK_STEPS: readonly PlaygroundPreset[] = [
  { label: '小比：必要性', interventions: { BT: 0 }, hold: { SH: 0 }, expect: { BS: 0 } },
  { label: '小比：石頭設回沒打中', interventions: { BT: 1, BH: 0 }, hold: { SH: 0 }, test: '充分性', expect: { BS: 1 } },
]
