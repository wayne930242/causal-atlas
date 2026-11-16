import { useId, useRef, useState } from 'react'
import type { ExportFormat, ExportSource, ExportTheme } from './export-image.ts'
import { exportImage, pageTheme } from './export-image.ts'
import { Segmented } from './parts.tsx'

export interface ExportMenuProps {
  /** Collects what to draw at click time; undefined when nothing is on screen. */
  readonly source: () => ExportSource | undefined
  /** Link in the watermark. */
  readonly url?: string
}

const FORMATS = [
  { value: 'png', label: 'PNG（2×）' },
  { value: 'svg', label: 'SVG' },
] as const satisfies readonly { value: ExportFormat; label: string }[]

const THEMES = [
  { value: 'light', label: '淺色' },
  { value: 'dark', label: '深色' },
] as const satisfies readonly { value: ExportTheme; label: string }[]

/** 「下載圖片」: format and theme (default: the page's theme), then download. Client only on click. */
export function ExportMenu({ source, url }: ExportMenuProps) {
  const [open, setOpen] = useState(false)
  const [format, setFormat] = useState<ExportFormat>('png')
  const [theme, setTheme] = useState<ExportTheme>('light')
  const [error, setError] = useState<string | undefined>(undefined)
  const root = useRef<HTMLDivElement>(null)
  const id = useId()

  const toggle = (): void => {
    if (!open) setTheme(pageTheme(root.current))
    setError(undefined)
    setOpen((o) => !o)
  }
  const download = (): void => {
    const s = source()
    if (s === undefined || s.panels.length === 0) {
      setError('畫面上沒有圖可以下載')
      return
    }
    exportImage(s, { theme, format, url }).catch((e: unknown) =>
      setError(`下載失敗：${e instanceof Error ? e.message : String(e)}`),
    )
  }

  return (
    <div className="ca-export" ref={root}>
      <button type="button" className="ca-link" aria-expanded={open} aria-controls={id} onClick={toggle}>
        下載圖片
      </button>
      {open && (
        <div className="ca-export-menu" id={id} role="group" aria-label="圖片設定">
          <Segmented label="格式" options={FORMATS} value={format} onChange={setFormat} />
          <Segmented label="主題" options={THEMES} value={theme} onChange={setTheme} />
          <button type="button" className="ca-btn ca-btn-primary ca-export-go" onClick={download}>
            下載
          </button>
          {error !== undefined && (
            <p className="ca-small ca-export-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
