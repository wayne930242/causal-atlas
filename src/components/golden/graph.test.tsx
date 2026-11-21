// Markup baseline of SignalGraph drawn directly: per case and lesson model, each way of reading it.
import type { ReactNode } from 'react'
import { listCases } from '../../data/index.ts'
import type { LoadedCase } from '../../data/load.ts'
import { docToCase } from '../../data/model-doc.ts'
import { LESSON_MODELS } from '../../demo/lesson-models.ts'
import type { Assignment } from '../../engine/index.ts'
import { getVariable } from '../../engine/index.ts'
import { dsepView } from '../model/dsep-view.ts'
import { solve } from '../model/model-state.ts'
import type { SignalGraphProps } from '../graph/SignalGraph.tsx'
import { SignalGraph } from '../graph/SignalGraph.tsx'
import { shownVariables } from '../model/shown-variables.ts'
import { flipValue } from '../model/assignments.ts'
import { targetValue } from '../model/probability-view.ts'
import { goldenSuite } from './harness.ts'

const noop = (): void => {}

function variantsFor(c: LoadedCase): Record<string, () => ReactNode> {
  const shown = shownVariables(c)
  const graph = (props: Partial<SignalGraphProps>) => () => <SignalGraph c={c} shown={shown} interventions={{}} removedEdges={[]} title="g" {...props} />
  const world = solve(c, {})
  const base = { values: world.values, original: world.original, probs: world.probs, dists: world.dists, removedEdges: world.removedEdges }
  const endogenous = shown.filter((id) => getVariable(c.model, id).kind === 'endogenous')
  const first = endogenous[0] ?? shown[0]
  const firstVar = getVariable(c.model, first)
  const out: Record<string, () => ReactNode> = {
    bare: graph({}),
    world: graph(base),
    compact: graph({ ...base, compact: true }),
    clamped: graph({ ...base, clamped: [first] }),
    interactive: graph({ ...base, onOpen: noop, onMove: noop }),
    pick: graph({ ...base, onPick: noop }),
  }
  const showcase = c.data.showcase[0]
  if (showcase !== undefined) {
    const after = solve(c, showcase.interventions)
    out.showcase = graph({ values: after.values, original: after.original, probs: after.probs, dists: after.dists, removedEdges: after.removedEdges, interventions: showcase.interventions, onOpen: noop })
  }
  const held: Assignment = { [first]: world.values?.[first] ?? targetValue(firstVar) }
  out['witness-hull'] = graph({ ...base, witness: held })
  out['witness-hold'] = graph({ ...base, witness: { [first]: flipValue(firstVar, held[first]) }, holdNotes: true, interventions: { [first]: flipValue(firstVar, held[first]) } })
  if (world.values !== undefined) {
    const defaults = c.normality ?? { [first]: flipValue(firstVar, held[first]) }
    out.defaults = graph({ ...base, defaults })
    const flipped = solve(c, { [first]: flipValue(firstVar, held[first]) })
    out.changed = graph({ values: flipped.values, original: world.values, removedEdges: flipped.removedEdges, interventions: { [first]: flipValue(firstVar, held[first]) }, defaults })
  }
  if (c.prior !== undefined && c.context === undefined) {
    const observedValues: Assignment = { [first]: targetValue(firstVar) }
    const seen = solve(c, {}, {}, observedValues)
    out.observed = graph({ probs: seen.probs, dists: seen.dists, removedEdges: seen.removedEdges, observed: [first], observedValues, onOpen: noop })
    out.evidence = graph({ probs: seen.probs, dists: seen.dists, removedEdges: seen.removedEdges, observed: [first], observedValues, evidence: true })
    out['prob-notes'] = graph({ ...base, probNotes: Object.fromEntries(shown.map((id, i) => [id, i % 2 === 0 ? '不變' : '0.50 → 0.75'])) })
    if (firstVar.domain.kind === 'boolean') {
      const mixed = solve(c, {}, { [first]: 0.3 })
      out.stochastic = graph({ probs: mixed.probs, dists: mixed.dists, removedEdges: mixed.removedEdges, stochastic: { [first]: 0.3 }, onOpen: noop })
    }
    if (endogenous.length >= 2) {
      const pair = [endogenous[0], endogenous[endogenous.length - 1]] as const
      out.dsep = graph({ ...base, paths: dsepView(c, pair, {}, {}, {}).marks })
      out['dsep-given'] = graph({ ...base, paths: dsepView(c, pair, observedValues, {}, {}).marks, observed: [first], observedValues })
    }
  }
  return out
}

const subjects: Record<string, Record<string, () => ReactNode>> = {}
for (const c of listCases()) subjects[`graph:case:${c.data.id}`] = variantsFor(c)
for (const [id, doc] of Object.entries(LESSON_MODELS)) subjects[`graph:lesson:${id}`] = variantsFor(docToCase(doc))

goldenSuite(import.meta.url, subjects)
