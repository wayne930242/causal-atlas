import type { Locale } from './i18n.ts'
import { LocaleScope } from './i18n.ts'
import type { DisclosureProps } from './parts.tsx'
import { Disclosure } from './parts.tsx'

export interface SupplementProps extends DisclosureProps {
  /** Language of the default kicker (補充 / More). Default: the surrounding LocaleProvider's, else zh-TW. */
  readonly locale?: Locale
}

/** A box for supplementary material that stays closed until asked. */
export function Supplement({ locale, ...props }: SupplementProps) {
  return (
    <LocaleScope locale={locale}>
      <Disclosure {...props} />
    </LocaleScope>
  )
}
