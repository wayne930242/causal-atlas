// Server rendering from the built package, as a host such as Astro runs it under Node: each component
// entry renders a bundled case by id with the figure in the markup, because `#case-preload` resolves to
// every case under Node; each modal figure renders an example model passed as a prop. Run after
// `pnpm build:lib`: `node scripts/check-dist-ssr.mjs`.
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'

const { preloadedCaseFiles } = await import('#case-preload')
if (preloadedCaseFiles === undefined || Object.keys(preloadedCaseFiles).length === 0) {
  throw new Error('#case-preload resolved to the browser target under Node')
}

const checks = [
  ['logic-atlas/causal', 'CausalPlayground', { caseId: 'rock-throwing' }, 'ca-graph'],
  ['logic-atlas/causal/playground', 'CausalPlayground', { caseId: 'rock-throwing' }, 'ca-graph'],
  ['logic-atlas/causal/probability', 'ProbabilityPanel', { caseId: 'smoking-lesion', view: 'compare' }, 'data-level'],
  ['logic-atlas/causal/identify', 'IdentifyPanel', { caseId: 'smoking-lesion' }, 'ca-identify'],
  ['logic-atlas/causal/lanes', 'WorldLanes', { caseId: 'rock-throwing', interventions: { SH: 0 }, initialStep: 2 }, 'data-lane="cf"'],
  ['logic-atlas/causal/case', 'CasePage', { caseId: 'rock-throwing', initialStep: 3 }, 'ca-graph'],
  ['logic-atlas/causal/extension', 'ConservativeExtension', { models: ['rock-throwing', 'rock-throwing'] }, 'ca-graph'],
  ['logic-atlas/causal/editor', 'ModelEditor', { initial: 'rock-throwing' }, 'ca-editor'],
]

// The modal figures take their documents as props: the example models from the demo.
const md = (id) => JSON.parse(readFileSync(new URL(`../src/demo/modal-models/${id}.json`, import.meta.url), 'utf8'))
checks.push(
  ['logic-atlas/modal', 'IntensionTable', { model: md('md-rain-intension') }, 'ca-modal-intension'],
  ['logic-atlas/modal', 'KripkeView', { model: md('md-rain-access') }, 'data-mark="counter"'],
  ['logic-atlas/modal', 'FrameConditions', { frame: md('md-time') }, 'data-condition="transitive"'],
  ['logic-atlas/modal', 'StrictImplication', { model: md('md-strict'), antecedent: 'rain', consequent: 'wet' }, 'data-kind="strict"'],
  ['logic-atlas/modal', 'TcsCheck', { items: [{ pattern: 'strengthening', model: md('md-umbrella'), a: 'rain', b: 'umbrella', c: 'stolen' }] }, 'data-counterexample="true"'],
  ['logic-atlas/modal', 'SphereView', { model: md('md-programmer'), locale: 'en' }, 'data-sphere="1"'],
  ['logic-atlas/modal', 'SurgeryVsSimilarity', { model: md('md-nixon') }, 'data-agree="false"'],
)

const failures = []
for (const [entry, name, props, expected] of checks) {
  const mod = await import(entry)
  const html = renderToString(createElement(mod[name], props))
  if (!html.includes(expected)) failures.push(`${entry} ${name}: markup lacks ${expected}`)
}
// The modal entry's own LocaleProvider sets its figures' language.
const modal = await import('logic-atlas/modal')
const english = renderToString(createElement(modal.LocaleProvider, { locale: 'en' }, createElement(modal.KripkeView, { model: md('md-rain-access') })))
if (!english.includes('a counterexample')) failures.push('logic-atlas/modal LocaleProvider: markup is not in English')
if (failures.length > 0) {
  console.error(`server render check failed:\n  ${failures.join('\n  ')}`)
  process.exit(1)
}
console.log(`server render check passed (${checks.length} figures)`)
