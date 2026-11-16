/** A value a variable can take. Boolean variables use `true`/`false`. */
export type Value = boolean | number | string

/** A (partial or full) assignment of values to variables, keyed by variable id. */
export type Assignment = Readonly<Record<string, Value>>

export interface LocalizedText {
  readonly zh: string
  readonly en: string
}

export interface BooleanDomain {
  readonly kind: 'boolean'
}

export interface FiniteDomain {
  readonly kind: 'finite'
  readonly values: readonly (number | string)[]
}

export type Domain = BooleanDomain | FiniteDomain

export type VariableKind = 'exogenous' | 'endogenous'

export interface Variable {
  readonly id: string
  readonly label: LocalizedText
  readonly kind: VariableKind
  readonly domain: Domain
}

export interface Edge {
  readonly from: string
  readonly to: string
}
