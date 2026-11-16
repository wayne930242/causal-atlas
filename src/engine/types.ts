/** A value a variable can take. Boolean variables use `true`/`false`. */
export type Value = boolean | number | string

/** A (partial or full) assignment of values to variables, keyed by variable id. */
export type Assignment = Readonly<Record<string, Value>>

/** The interface and data languages: Traditional Chinese (the default) and English. */
export type Locale = 'zh-TW' | 'en'

/** A text in both languages. */
export type LocalizedText = { readonly [L in Locale]: string }

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
