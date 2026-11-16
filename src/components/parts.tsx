import type { ReactNode } from 'react'
import { useId, useState } from 'react'
import { useMessages } from './i18n.ts'

/** Small shared pieces: segmented control, disclosure, progress, icons, tags. */

export interface SegmentedProps<T extends string> {
  readonly label: string
  readonly options: readonly { readonly value: T; readonly label: string }[]
  readonly value: T
  readonly onChange: (value: T) => void
  readonly className?: string
}

export function Segmented<T extends string>({ label, options, value, onChange, className }: SegmentedProps<T>) {
  return (
    <div className={`ca-seg ${className ?? ''}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="ca-seg-item"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export interface DisclosureProps {
  /** Small label before the title; default 補充 / More. Empty for none. */
  readonly kicker?: string
  readonly title: ReactNode
  readonly children: ReactNode
  readonly defaultOpen?: boolean
  readonly className?: string
}

/** A box that stays closed until asked; the header button carries aria-expanded. */
export function Disclosure({ kicker: kickerProp, title, children, defaultOpen = false, className }: DisclosureProps) {
  const t = useMessages()
  const kicker = kickerProp ?? t.more
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  return (
    <section className={`ca-disclosure ${className ?? ''}`} data-open={open ? 'true' : 'false'}>
      <button
        type="button"
        className="ca-disclosure-head"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        {kicker !== '' && <span className="ca-disclosure-kicker">{kicker}</span>}
        <span className="ca-disclosure-title">{title}</span>
        <PlusMinus open={open} />
      </button>
      <div id={id} className="ca-disclosure-body" hidden={!open}>
        {open && children}
      </div>
    </section>
  )
}

export function PlusMinus({ open }: { readonly open: boolean }) {
  return (
    <svg className="ca-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d={open ? 'M2 8h12' : 'M2 8h12M8 2v12'} fill="none" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  )
}

export function Arrow() {
  return (
    <svg className="ca-icon ca-arrow" width="26" height="14" viewBox="0 0 26 14" aria-hidden="true">
      <path d="M1 7h23m-6-6l6 6l-6 6" fill="none" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  )
}

export function OkIcon({ size = 20 }: { readonly size?: number }) {
  return (
    <svg className="ca-icon ca-ok" width={size} height={size} viewBox="-10 -10 20 20" aria-hidden="true">
      <circle r="10" className="ca-fill-green" />
      <path d="M-5 0l4 4l6-8" fill="none" className="ca-stroke-on-green" strokeWidth="2" />
    </svg>
  )
}

export function NoIcon({ size = 20 }: { readonly size?: number }) {
  return (
    <svg className="ca-icon ca-no" width={size} height={size} viewBox="-11 -11 22 22" aria-hidden="true">
      <circle r="9.5" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path d="M-4 -4l8 8m0-8l-8 8" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  )
}

export function PartIcon({ size = 20 }: { readonly size?: number }) {
  return (
    <svg className="ca-icon ca-part" width={size} height={size} viewBox="-11 -11 22 22" aria-hidden="true">
      <circle r="9.5" fill="none" className="ca-stroke-green" strokeWidth="1.75" />
      <path d="M0 -9.5A9.5 9.5 0 0 1 0 9.5z" className="ca-fill-green" />
    </svg>
  )
}

export function Pin() {
  return (
    <svg className="ca-icon" width="10" height="14" viewBox="-5 -7 10 14" aria-hidden="true">
      <circle cy="-2.5" r="3.5" className="ca-fill-amber-mark" />
      <path d="M0 0v6.5" className="ca-stroke-amber" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
}

export function Progress({ step, total }: { readonly step: number; readonly total: number }) {
  const t = useMessages()
  return (
    <span className="ca-progress" role="img" aria-label={t.stepOf(step, total)}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className="ca-progress-dot" data-on={i < step ? 'true' : 'false'} />
      ))}
      <span className="ca-progress-text ca-mono" aria-hidden="true">
        {step}/{total}
      </span>
    </span>
  )
}

export type TagTone = 'fg' | 'slate' | 'accent' | 'chip' | 'line' | 'amber' | 'outline'

export function Tag({ tone, children, mono }: { readonly tone: TagTone; readonly children: ReactNode; readonly mono?: boolean }) {
  return <span className={`ca-tag ca-tag-${tone}${mono === true ? ' ca-mono' : ''}`}>{children}</span>
}
