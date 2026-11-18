import type { ReactNode } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import type { Problem } from '../../engine/index.ts'
import { problemMessage, useMessages } from '../i18n/messages.ts'

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

export interface TipProps {
  /** What the tooltip explains; shown on hover, keyboard focus or a tap. */
  readonly tip: ReactNode
  /** The trigger's own content; default a small ⓘ mark. */
  readonly children?: ReactNode
  /** Accessible name of the default mark. */
  readonly label?: string
  readonly className?: string
}

/**
 * The one tooltip primitive: a focusable trigger described by (`aria-describedby`) a
 * `role="tooltip"` element. Hover or focus shows it, a tap or click toggles it, Escape or leaving
 * hides it. Short on-graph notes stay as they are; anything longer goes in here.
 */
export function Tip({ tip, children, label, className }: TipProps) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (e: Event): void => {
      if (e.target instanceof Node && ref.current?.contains(e.target) !== true) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  return (
    <span className={`ca-tip ${className ?? ''}`} ref={ref} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <span
        className={`ca-tip-trigger${children === undefined ? ' is-mark' : ''}`}
        role={children === undefined ? 'button' : undefined}
        tabIndex={0}
        aria-label={children === undefined ? label : undefined}
        aria-describedby={id}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false)
          else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen((o) => !o)
          }
        }}
      >
        {children ?? <span aria-hidden="true">ⓘ</span>}
      </span>
      <span id={id} role="tooltip" className="ca-tip-body" hidden={!open}>
        {tip}
      </span>
    </span>
  )
}

function PlusMinus({ open }: { readonly open: boolean }) {
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

/** A model document that could not be drawn: every problem with its stable code (and the first as `data-code`). */
export function DocProblems({ problems }: { readonly problems: readonly Problem[] }) {
  const t = useMessages()
  return (
    <div className="ca-root not-prose ca-editor-errors ca-doc-error" role="alert" data-code={problems[0]?.code} lang={t.locale}>
      <p>{t.docInvalid}</p>
      <ul>
        {problems.map((p, i) => (
          <li key={`${p.code}-${i}`}>
            <code className="ca-mono">{p.code}</code> {problemMessage(p, t)}
          </li>
        ))}
      </ul>
    </div>
  )
}
