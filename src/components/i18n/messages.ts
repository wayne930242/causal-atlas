import type { ReactNode } from 'react'
import { createContext, createElement, useContext } from 'react'
import type { Problem } from '../../engine/errors.ts'
import { problemText } from '../../engine/errors.ts'
import type { Locale } from '../../engine/types.ts'
import type { DraftIssue } from './common.ts'
import { EN } from './en.ts'
import type { Messages } from './zh.ts'
import { ZH } from './zh.ts'

/**
 * Every piece of interface text, in Traditional Chinese (the default, zh.ts) and English (en.ts).
 * Components take their table from {@link useMessages}; pure helpers take it as an argument.
 */

export type { Locale }
export type { DraftIssue, NodeToggle } from './common.ts'
export { AUTHOR_EN, AUTHOR_ZH } from './common.ts'
export type { Messages } from './zh.ts'

export const DEFAULT_LOCALE: Locale = 'zh-TW'

/** Each language by its own name, for language switches. */
export const LANGUAGE_NAMES: Readonly<Record<Locale, string>> = { 'zh-TW': '中文', en: 'English' }

export const MESSAGES: Readonly<Record<Locale, Messages>> = { 'zh-TW': ZH, en: EN }

export function messagesFor(locale: Locale): Messages {
  return MESSAGES[locale]
}

/** A problem from the engine or the data layer, worded in the table's language. */
export function problemMessage(p: Problem, t: Messages): string {
  return problemText(p, t.problems)
}

/** Any thrown value as text: our problems per locale, anything else by its own message. */
export function errorMessage(error: unknown, t: Messages): string {
  if (typeof error === 'object' && error !== null && 'problem' in error) {
    return problemMessage((error as { problem: Problem }).problem, t)
  }
  return error instanceof Error ? error.message : String(error)
}

export function draftIssueMessage(issue: DraftIssue, t: Messages): string {
  return (t.draft[issue.code] as (i: DraftIssue) => string)(issue)
}

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE)

/** Sets the language for every causal-atlas component inside it; a component's own `locale` prop wins. */
export function LocaleProvider({ locale, children }: { readonly locale: Locale; readonly children?: ReactNode }) {
  return createElement(LocaleContext.Provider, { value: locale }, children)
}

/** Wraps `children` in `locale` when given, else leaves the surrounding language in force. */
export function LocaleScope({ locale, children }: { readonly locale?: Locale; readonly children?: ReactNode }) {
  return locale === undefined ? children : createElement(LocaleContext.Provider, { value: locale }, children)
}

export function useMessages(): Messages {
  return MESSAGES[useContext(LocaleContext)]
}
