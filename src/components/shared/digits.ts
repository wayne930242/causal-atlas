import type { ReactNode } from 'react'
import { createContext, createElement, useContext } from 'react'

/** Decimals a node's probability is written to when `digits` is not given. */
export const DEFAULT_DIGITS = 2
/** The most decimals `digits` may ask for. */
export const MAX_DIGITS = 6

/** `digits` as a whole number of decimals, 1 to MAX_DIGITS; anything else throws. */
export function checkDigits(digits: unknown): number {
  if (typeof digits !== 'number' || !Number.isInteger(digits) || digits < 1 || digits > MAX_DIGITS) {
    throw new Error(`digits must be a whole number from 1 to ${MAX_DIGITS}, got ${String(digits)}`)
  }
  return digits
}

const DigitsContext = createContext<number>(DEFAULT_DIGITS)

/** Sets the decimals of every node readout inside it when `digits` is given (and checks it); else leaves the surrounding setting. */
export function DigitsScope({ digits, children }: { readonly digits?: number; readonly children?: ReactNode }) {
  return digits === undefined ? children : createElement(DigitsContext.Provider, { value: checkDigits(digits) }, children)
}

/** The decimals node readouts are written to here. */
export function useDigits(): number {
  return useContext(DigitsContext)
}
