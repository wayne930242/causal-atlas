import type { Locale } from '../../engine/types.ts'
import { useLocale } from '../../components/i18n/messages.ts'
import type { ModalProblem } from '../engine/errors.ts'
import { modalProblemOf, modalProblemText } from '../engine/errors.ts'
import { MODAL_EN } from './en.ts'
import type { ModalMessages } from './zh.ts'
import { MODAL_ZH } from './zh.ts'

/**
 * The modal components' text, in Traditional Chinese (zh.ts, the default) and English (en.ts). The
 * language comes from the same {@link useLocale} as the causal components, so one `LocaleProvider`
 * sets both; the tables stay apart so neither family loads the other's.
 */

export type { ModalMessages }

export const MODAL_MESSAGES: Readonly<Record<Locale, ModalMessages>> = { 'zh-TW': MODAL_ZH, en: MODAL_EN }

export function useModalMessages(): ModalMessages {
  return MODAL_MESSAGES[useLocale()]
}

export function modalProblemMessage(p: ModalProblem, t: ModalMessages): string {
  return modalProblemText(p, t.problems)
}

/** Any thrown value as text: our problems per locale, anything else by its own message. */
export function modalErrorMessage(error: unknown, t: ModalMessages): string {
  const p = modalProblemOf(error)
  if (p !== undefined) return modalProblemMessage(p, t)
  return error instanceof Error ? error.message : String(error)
}
