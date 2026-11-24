import type * as ExportImageModule from './export-image.ts'

/**
 * The image export (SVG building, rasterizing, palettes) is its own chunk: a figure loads it when its
 * 「下載圖片」 menu opens, not with the page.
 */
export type ExportImage = typeof ExportImageModule

let loaded: ExportImage | undefined
let loading: Promise<ExportImage> | undefined

/** Start loading the image export; resolves to the module (at once when already loaded). */
export function loadExportImage(): Promise<ExportImage> {
  loading ??= import('./export-image.ts').then(
    (m) => (loaded = m),
    (error: unknown) => {
      loading = undefined
      throw error
    },
  )
  return loading
}

/** Run `run` with the image export: synchronously when it is loaded, after loading otherwise. */
export function withExportImage<T>(run: (m: ExportImage) => T | Promise<T>): Promise<T> {
  if (loaded !== undefined) {
    try {
      return Promise.resolve(run(loaded))
    } catch (error) {
      return Promise.reject(error)
    }
  }
  return loadExportImage().then(run)
}
