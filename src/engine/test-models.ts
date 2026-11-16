import type { CausalModel } from './model.ts'
import { buildModel } from './model.ts'
import type { Domain, Variable, VariableKind } from './types.ts'

/** Small models shared by the engine's unit tests. */

export function variable(id: string, kind: VariableKind, domain: Domain = { kind: 'boolean' }): Variable {
  return { id, label: { 'zh-TW': id, en: id }, kind, domain }
}

/** Halpern & Pearl rock throwing with SH/BH (Actual Causality, Example 2.3.3). */
export function rockThrowing(): CausalModel {
  return buildModel({
    variables: [
      variable('U_ST', 'exogenous'),
      variable('U_BT', 'exogenous'),
      variable('ST', 'endogenous'),
      variable('BT', 'endogenous'),
      variable('SH', 'endogenous'),
      variable('BH', 'endogenous'),
      variable('BS', 'endogenous'),
    ],
    equations: { ST: 'U_ST', BT: 'U_BT', SH: 'ST', BH: 'BT and not SH', BS: 'SH or BH' },
  })
}

export function forestFire(connective: 'or' | 'and'): CausalModel {
  return buildModel({
    variables: [
      variable('U_L', 'exogenous'),
      variable('U_MD', 'exogenous'),
      variable('L', 'endogenous'),
      variable('MD', 'endogenous'),
      variable('FF', 'endogenous'),
    ],
    equations: { L: 'U_L', MD: 'U_MD', FF: `L ${connective} MD` },
  })
}

/** Gardener and Queen omission: the flower dies if nobody waters it. */
export function flower(): CausalModel {
  return buildModel({
    variables: [
      variable('U_G', 'exogenous'),
      variable('U_Q', 'exogenous'),
      variable('GW', 'endogenous'),
      variable('QW', 'endogenous'),
      variable('D', 'endogenous'),
    ],
    equations: { GW: 'U_G', QW: 'U_Q', D: 'not GW and not QW' },
  })
}
