/**
 * The height of `root` as an embed page draws it: with only the `initial` block open (none when
 * undefined), whatever the reader has open now. Panels are unhidden and hidden again in the same
 * task, so nothing is painted in between.
 */
export function heightAtInitialBlock(root: HTMLElement | null, initial: string | undefined, fallback: number): number {
  if (root === null) return fallback
  const panels = [...root.querySelectorAll<HTMLElement>('[data-tab-panel]')]
  const was = panels.map((p) => p.hidden)
  for (const p of panels) p.hidden = p.dataset.tabPanel !== initial
  const height = root.offsetHeight
  panels.forEach((p, i) => {
    p.hidden = was[i]
  })
  return height
}
