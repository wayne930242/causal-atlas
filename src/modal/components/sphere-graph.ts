import type { Box, Placed } from '../../components/graph/graph-labels.ts'
import { around, firstClear, textBox } from '../../components/graph/graph-labels.ts'
import { textWidth } from '../../components/text/text-measure.ts'

/**
 * The geometry of a system of spheres around one world: concentric circles, innermost first, each
 * world drawn as a dot in the ring between the smallest sphere holding it and the one inside, with its
 * name and true atoms beside it where no other dot or label sits. Pure; no DOM.
 */

export interface SphereWorld {
  readonly id: string
  readonly name: string
  /** A second, smaller line: the atoms true there. */
  readonly detail: string
}

export interface PlacedSphereWorld extends SphereWorld {
  readonly x: number
  readonly y: number
  /** Index of the smallest sphere holding it. */
  readonly ring: number
  readonly label: Placed
  readonly detailAt: { readonly x: number; readonly y: number }
}

export interface SphereLayout {
  readonly radii: readonly number[]
  readonly worlds: readonly PlacedSphereWorld[]
  readonly sphereLabels: readonly { readonly x: number; readonly y: number }[]
  readonly viewBox: string
  readonly width: number
}

const DOT = 6
const NAME = 13
const DETAIL = 11
const GAP = 58
const MARGIN = 12

export function layoutSpheres(spheres: readonly (readonly string[])[], center: string, worlds: readonly SphereWorld[]): SphereLayout {
  const innerAlone = spheres[0]?.length === 1 && spheres[0][0] === center
  const r0 = innerAlone ? 24 : 52
  // Many spheres (a similarity with many distances) sit closer together.
  const gap = spheres.length > 4 ? Math.max(34, GAP - (spheres.length - 4) * 6) : GAP
  const radii = spheres.map((_, i) => r0 + i * gap)
  const ringOf = (id: string): number => spheres.findIndex((s) => s.includes(id))
  const byId = new Map(worlds.map((w) => [w.id, w]))
  const placed: { w: SphereWorld; x: number; y: number; ring: number }[] = []
  const push = (id: string, r: number, a: number, ring: number): void => {
    const w = byId.get(id)
    if (w !== undefined) placed.push({ w, x: r * Math.cos(a), y: r * Math.sin(a), ring })
  }
  spheres.forEach((s, i) => {
    const fresh = s.filter((id) => ringOf(id) === i)
    if (i === 0) {
      if (fresh.includes(center)) push(center, 0, 0, 0)
      const rest = fresh.filter((id) => id !== center)
      rest.forEach((id, k) => push(id, r0 * 0.6, -Math.PI / 2 + (2 * Math.PI * k) / rest.length, 0))
      return
    }
    const r = ((radii[i - 1] as number) + (radii[i] as number)) / 2
    fresh.forEach((id, k) => push(id, r, -Math.PI / 2 + i * 0.55 + (2 * Math.PI * k) / fresh.length, i))
  })
  const obstacles: Box[] = placed.map((p) => around(p.x, p.y, DOT + 1))
  const out: PlacedSphereWorld[] = placed.map((p) => {
    const width = Math.max(textWidth(p.w.name, NAME), textWidth(p.w.detail, DETAIL))
    const tall = p.w.detail === '' ? NAME : NAME + DETAIL + 3
    const make = (x: number, y: number, anchor: 'start' | 'middle' | 'end'): Placed => ({
      x,
      y,
      anchor,
      box: { ...textBox(x, y, anchor, width, NAME), y1: y + tall - NAME + NAME * 0.25 },
    })
    const label = firstClear(
      [make(p.x + DOT + 4, p.y + 4, 'start'), make(p.x - DOT - 4, p.y + 4, 'end'), make(p.x, p.y - DOT - 6 - (tall - NAME), 'middle'), make(p.x, p.y + DOT + NAME + 2, 'middle')],
      obstacles,
    )
    obstacles.push(label.box)
    return { ...p.w, x: p.x, y: p.y, ring: p.ring, label, detailAt: { x: label.x, y: label.y + DETAIL + 3 } }
  })
  const outer = radii[radii.length - 1] ?? r0
  const sphereLabels = radii.map((r) => ({ x: r * Math.cos(-Math.PI / 4) + 3, y: r * Math.sin(-Math.PI / 4) - 3 }))
  const boxes = [...obstacles, { x0: -outer, y0: -outer, x1: outer, y1: outer }, ...sphereLabels.map((l) => textBox(l.x, l.y, 'start', 22, 12))]
  const x0 = Math.min(...boxes.map((b) => b.x0)) - MARGIN
  const y0 = Math.min(...boxes.map((b) => b.y0)) - MARGIN
  const x1 = Math.max(...boxes.map((b) => b.x1)) + MARGIN
  const y1 = Math.max(...boxes.map((b) => b.y1)) + MARGIN
  const f = (v: number) => Math.round(v * 10) / 10
  return { radii, worlds: out, sphereLabels, viewBox: `${f(x0)} ${f(y0)} ${f(x1 - x0)} ${f(y1 - y0)}`, width: Math.round(x1 - x0) }
}
