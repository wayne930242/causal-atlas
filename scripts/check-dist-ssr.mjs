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
  ['causal-atlas', 'CausalPlayground', { caseId: 'rock-throwing' }, 'ca-graph'],
  ['causal-atlas/playground', 'CausalPlayground', { caseId: 'rock-throwing' }, 'ca-graph'],
  ['causal-atlas/probability', 'ProbabilityPanel', { caseId: 'smoking-lesion', view: 'compare' }, 'data-level'],
  ['causal-atlas/identify', 'IdentifyPanel', { caseId: 'smoking-lesion' }, 'ca-identify'],
  ['causal-atlas/lanes', 'WorldLanes', { caseId: 'rock-throwing', interventions: { SH: 0 }, initialStep: 2 }, 'data-lane="cf"'],
  ['causal-atlas/case', 'CasePage', { caseId: 'rock-throwing', initialStep: 3 }, 'ca-graph'],
  ['causal-atlas/extension', 'ConservativeExtension', { models: ['rock-throwing', 'rock-throwing'] }, 'ca-graph'],
  ['causal-atlas/editor', 'ModelEditor', { initial: 'rock-throwing' }, 'ca-editor'],
]

// The modal figures take their documents as props: the example models from the demo.
const md = (id) => JSON.parse(readFileSync(new URL(`../src/demo/modal-models/${id}.json`, import.meta.url), 'utf8'))
checks.push(
  ['causal-atlas/modal', 'IntensionTable', { model: md('md-rain-intension') }, 'ca-modal-intension'],
  ['causal-atlas/modal', 'KripkeView', { model: md('md-rain-access') }, 'data-mark="counter"'],
  ['causal-atlas/modal', 'FrameConditions', { frame: md('md-time') }, 'data-condition="transitive"'],
  ['causal-atlas/modal', 'StrictImplication', { model: md('md-strict'), antecedent: 'rain', consequent: 'wet' }, 'data-kind="strict"'],
  ['causal-atlas/modal', 'TcsCheck', { items: [{ pattern: 'strengthening', model: md('md-umbrella'), a: 'rain', b: 'umbrella', c: 'stolen' }] }, 'data-counterexample="true"'],
  ['causal-atlas/modal', 'SphereView', { model: md('md-programmer'), locale: 'en' }, 'data-sphere="1"'],
  ['causal-atlas/modal', 'SurgeryVsSimilarity', { model: md('md-nixon') }, 'data-agree="false"'],
)

const failures = []
for (const [entry, name, props, expected] of checks) {
  const mod = await import(entry)
  const html = renderToString(createElement(mod[name], props))
  if (!html.includes(expected)) failures.push(`${entry} ${name}: markup lacks ${expected}`)
}
// The modal entry's own LocaleProvider sets its figures' language.
const modal = await import('causal-atlas/modal')
const english = renderToString(createElement(modal.LocaleProvider, { locale: 'en' }, createElement(modal.KripkeView, { model: md('md-rain-access') })))
if (!english.includes('a counterexample')) failures.push('causal-atlas/modal LocaleProvider: markup is not in English')
if (failures.length > 0) {
  console.error(`server render check failed:\n  ${failures.join('\n  ')}`)
  process.exit(1)
}
console.log(`server render check passed (${checks.length} figures)`)
