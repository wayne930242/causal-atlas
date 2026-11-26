# Components and API

- [Package](#package)
- [Conservative extensions](#conservative-extensions)
- [Identification experiment](#identification-experiment)
- [Probability views](#probability-views)

## Package

`causal-atlas` (0.24.1) ships ESM with type declarations and one CSS file:
[see the package entries](../README.md#entries).

React 19 is a peer dependency. Importing the components touches no browser globals, so they render on
the server; interaction needs a client island, e.g. in Astro MDX:

```mdx
import { CasePage, WorldLanes } from 'causal-atlas'
import 'causal-atlas/style.css'

<CasePage client:visible caseId="rock-throwing" heading={false} />
<WorldLanes client:visible caseId="rock-throwing" interventions={{ SH: 0 }} actionLabel="攔下小蘇的石頭" />
<CasePage client:visible caseId="rock-throwing" locale="en" />
```

A component entry carries only its component's code; importing from `causal-atlas` gives the same
result when the bundler tree-shakes, as Vite does. Every name of an entry is the same value as the
root's, so the two can be mixed on one page.

The bundled cases load one at a time. Each case file is its own chunk; a component given `caseId` (or
a document whose `from` names a case) imports that chunk and nothing else. The package's own
`#case-preload` import (package.json `imports`) decides what is ready before the first render:

- Under Node (the `node` condition, as when Astro or a script renders on the server) it resolves to
  every case, so the server renders the figure at once and its markup holds the graph.
- Elsewhere (`default`: the browser) it resolves to nothing. A component whose case has not arrived
  suspends, as `React.lazy` does, and adds no Suspense boundary of its own, so the markup does not
  depend on whether the case was ready. Hydrating server markup (an Astro `client:visible` island),
  React keeps that markup on screen until the case arrives, then hydrates it; the figure never blanks.
  A client-only render (`client:only`, or a `createRoot` app) waits at the nearest `<Suspense>` the
  host gives, or renders at once after `await preloadCase('rock-throwing')`. A synchronous render
  (`flushSync`) of a case not yet loaded needs one of the two.
- A server render outside Node with `renderToString` has no case preloaded; there, `await
  preloadCase(id)` first, or render with a streaming API, which waits for the case.

`causal-atlas/data` keeps its synchronous `getCase` and `listCases` and bundles every case; a case it
returns is ready for the components too.

Equations are typeset with [KaTeX](https://katex.org) on the server and in the browser. KaTeX is a
dependency, but its stylesheet is not bundled into `style.css` (that would duplicate the copy most
hosts already load, and drag its fonts in): load it once, for example
`import 'katex/dist/katex.min.css'` or a `<link>` to `katex.min.css`. Without it the formulas show
unstyled. Each formula keeps a plain-text form in `aria-label` and `data-text`.
Every variable name the components print is typeset the same way: in the page as KaTeX (`N_S1` is an
italic N with a subscript S1, `A=0` and `do(A=0)` are formulas), inside the graph and world-lane
SVG as a lowered, smaller tspan. Form fields and attributes keep the plain id.

Every component speaks Traditional Chinese (`zh-TW`, the default) or English (`en`). Pass `locale` to
one component, or wrap a page in `<LocaleProvider locale="en">`; a component's own `locale` wins. The
language covers the interface text, the case texts (title, subtitle, story, explanation, intuition,
variable and preset labels) and the error messages. All interface text lives in
`src/components/i18n/` (`zh.ts`, `en.ts`); a test fails when a component holds a Chinese literal of its own.

Nodes show their probability to two decimals. Pass `digits` (1 to 6) to `CausalPlayground`,
`ProbabilityPanel`, `CasePage` or `ModelEditor` to write them to the digits the text quotes:
`<CausalPlayground caseId="smoking-lesion" digits={3} />`. Equations, tables and verdicts keep their own
precision; see 0.6.0 for what it covers.

Errors from the engine and the data layer carry a stable `problem`: `{ code, params, where? }`
(`CausalAtlasError`, its subclasses `ModelError` and `ParseError`; `problemOf(error)` reads it).
`Error.message` is the English wording, `problemText(problem)` gives it again, and the components word
the same codes in Chinese. `parseModelJson` and `decodeShare` return such problems in `errors`.

The components read only the host's colour tokens (`--background`, `--foreground`, `--accent`,
`--accent-foreground`, `--muted`, `--muted-foreground`, `--border`) and define their own `--ca-*`
colours (slate, amber, green) with dark values under `[data-theme="dark"]`. Fonts inherit; numerals use
`--font-mono` when the host defines it.

`ModelEditor` lets readers build their own model: variables (id, Chinese and English label, either
of which may stay empty and then shows the id, exogenous or endogenous, `0／1` or a list of values), equations in the authoring syntax with parse and cycle errors
shown inline, context values or priors, normality defaults, and node positions by dragging (or arrow
keys). It starts from any bundled case or a blank model, exports and imports JSON validated by
`modelDocSchema` (a whole case file also imports), and shares the model in the URL hash as
`#model=1.<base64url(deflate-raw(JSON))>`; the leading `1` is the format version. Props: `initial`
(case id, `extraModels` id or `blank`), `hash`, `syncUrl`, `shareHref(value)`, `exportUrl`, `digits`, `locale`,
`caseLinks`, `extraModels`, `modelsLabel`.

The address follows the editor (`syncUrl`, default on): `#case=<id>` while a bundled case or host
model is unedited, `#model=…` once it is edited (written 400 ms after the last change), with
`&do=ST:0,…` for the interventions, all through `history.replaceState`, so no history entries and no
scrolling. A hash route such as `#/editor?lang=en` keeps its path and other parameters. Loading the
page with `#case=<id>` opens that case; an unknown id opens the default. With `syncUrl={false}`, or
when the host passes `hash`, the editor only reads the address and never writes it.

The layout follows the editor's own width (container queries, so the host's column decides). From
760 px up, the case list is a sticky sidebar (240–280 px, its own scroll) to the left of the model;
`--ca-sticky-top` (default 16 px) sets its offset under a fixed host header. Narrower, the list
collapses into a 「選案例」 button with the current title, which opens the same list in a full-height
modal sheet (Escape or a pick closes it and returns focus to the button). Right of the list come a
header with the model's title and family, the graph and equations, the case panel, then the editing
panels; when that right side is 960 px or wider, the graph and equations sit left of the case and
editing panels.

The case list groups the bundled cases by family and the host's models by group, each row with its
title and subtitle, the current one marked. The search matches titles and subtitles in both
languages, ids and group names; the chips narrow it to one family or host group, and a live region
reads the number of matches. Keyboard: ArrowDown from the search enters the list (a `listbox`),
arrow keys, Home and End move, Enter or Space loads, typing goes back to the search; Enter in the
search loads the first match, Escape clears it. Choosing a case shows its panel below the model:
story, intuition, what the model encodes, a table of each verdict in the case file with the
engine's result beside it, and the sources with their pages (URLs and DOIs in a citation become
links).

```tsx
<ModelEditor
  caseLinks={{ 'rock-throwing': [{ title: '形式 08：先發制人', href: '/blog/formal-08/' }] }}
  extraModels={[{ id: 'm08-rock-coarse', title: '丟石頭的粗模型', group: '第 8 講', doc, links: [...] }]}
/>
```

- `caseLinks`: per case id, links listed in its panel under 「講義中用到這個案例」.
- `extraModels`: `{ id, title, group?, doc, links? }`; `title` and `group` are a string or
  `{ 'zh-TW', en }`, `doc` is a model document as `CausalPlayground` takes it. Choosing one loads the
  document (an invalid one starts blank and shows its problem codes) and shows its title and `links`.
  The case list gives all of them one filter chip (label `modelsLabel`, default 講義模型 / Lesson models);
  inside the list each `group` stays a heading.

A custom model need not go through the editor. `CausalPlayground`, `ProbabilityPanel` and `WorldLanes`
take `doc` (a `modelDocSchema` value, e.g. one exported from the editor) instead of `caseId`;
`ModelEditor` takes `initialDoc`, which wins over `initial`:

```mdx
import doc from './my-model.json'
import { CausalPlayground, ModelEditor } from 'causal-atlas'

<CausalPlayground client:visible doc={doc} />
<CausalPlayground client:visible doc={doc} presets={[{ label: '關掉下雨', interventions: { R: false } }]} />
<ModelEditor client:visible initialDoc={doc} />
```

- `<CausalPlayground doc>`: graph, notation toggle (`defaultNotation`: `propositional` 邏輯式, `cases` 分段式, `arithmetic` 數學式, `causal` 干預式), observation and do() on the nodes (see 0.3.13) and the export menu, server-rendered
  with values, no editor chrome. A click on a node opens its menu (see 0.9.0): observe (probability
  graphs) or do() at each value, release, a random-intervention slider (P*(X=1)), the node's own sliders; no long-press or
  right-click binding. No hint lines under the graph (see 0.10.0); the menu's ⓘ opens the
  observe-versus-intervene details in a tooltip (hover, keyboard focus or a tap; `aria-describedby`).
- `presets` (step buttons) is `true` (a bundled case's own; a document has none), `false`, or a list of
  `{ label: string | { 'zh-TW', en }, interventions?, observed?, hold?, test?, expect? }`. One press sets exactly
  those do()s and observations; `observed` needs a probability graph (on a graph with values it
  throws), `hold` sets do() too but draws the held variables in the amber witness hull (固定). The
  buttons sit inside the figure's frame under the graph; the one that matches what is set is
  `aria-pressed`. For a lesson step:
  `presets={[{ label: '第 1 步：看到 A 沒開槍', observed: { A: 0 } }, { label: '第 2 步：攔住 A', interventions: { A: 0 } }]}`.
  On a graph with an actual context, `expect: { BS: 1 }` compares the solved value of `BS` with 1
  after the reader presses the button. List several outcomes to require all of them. `test` names
  the check (a string or `{ 'zh-TW', en }`; the button label if omitted). The line reports the
  required and resulting values and whether they match. Changing the setting clears it.
- Every probability graph writes 原本 v (grey) under each 0/1 node whose number moved by 0.005 or more
  from the prior, the same rule as the compare panel; a node that did not move gets nothing.
  `track={['Y']}` adds one line per tracked node under the graph with its reading after each change
  of what is set, `Y：0.50 → 0.67（Z=1）→ 0.50（Z=1, X=1）` (the last five; 「回到原本」 and the step
  buttons start it again; on a graph with values it follows the value).
- `verdicts={[{ cause: 'L=1', effect: 'FF=1' }]}` (graphs with values; a probability graph throws):
  under the graph, per query 「L=1 是 FF=1 的原因嗎？」 and one cell per standard (but-for, HP original,
  updated, modified, and HP with normality when the model has defaults; or the query's `theories`),
  each 是／不是／原因的一部分, with 在圖上看 where the engine found a witness: it sets x⃗′ and holds W⃗ at
  w⃗. A last line, 目前的世界, says per standard whether the world on the graph is a witness and if
  not why (`HP 修正定義：不是，MD 沒有固定在實際值 1`), from `witnessStatus` in the engine, the same
  check `actualCause` makes for each candidate; its ⓘ 說明 opens what holding means for each
  standard. Only a step's `hold` and the shown witness's W⃗ are drawn held: in the amber hull with
  固定為 w（實際 v） under its label, or 固定（實際值） when held at its actual value; every other do(),
  the reader's own included, is a clamp. A line under the graph names the marks on it (紅色框角,
  琥珀色虛線框, 原本). After 在圖上看 the line answers that witness's query; otherwise the query with
  the most cause variables set, at least one away from its actual value.
  `actualGroups(t, c, queries)` takes the same queries.
- `verdicts={[{ cause: 'V1=1', effect: 'W=1', responsibility: true }]}`: each Halpern–Pearl cell (the
  original, updated and modified definitions, and HP with normality when the model has defaults)
  adds 責任 1/3 (en "responsibility 1/3"), the degree of responsibility of the single event
  `cause` (Halpern 2016, Def. 6.1.1 and 6.1.6: 1/k, k the fewest variables in the cause plus the
  ones its witness holds; held variables need not change value, Ex. 6.1.4); its ⓘ says which k, which variables the witness holds fixed and which cause
  attains it. The but-for cell has none. Without the flag the cells are unchanged. A cause of more
  than one event throws the engine's `responsibility-single-event` problem. `responsibility` in the
  engine takes the same query.
- `blame={{ cause: 'T=1', effect: 'D=1', states?, theories? }}`: a 責備 tab under the graph (a
  probability graph with the document's `priors`, or a graph with values and priors), the degree of
  blame (Halpern 2016, Def. 6.2.1): one row per epistemic state, one column per standard (default
  the three HP definitions, and HP with normality when the model has defaults), each state's
  backgrounds with their probabilities and responsibilities behind a fold. `states` are
  `{ label?: string | { 'zh-TW', en }, prior?, given? }`: `prior` takes the model document's `priors`
  format (default the document's own, which the sliders move; without document priors every state
  must give one, else it throws), `given` an observation that narrows the state (the outcome seen
  after acting, `D=1`). Halpern's blame conditions on the cause holding, so the probabilities are
  conditioned on it. `blame` in the engine takes the same query and a prior.
- Defaults: when the model has `normality`, a graph with values marks each node off its default
  with a dashed 偏離（預設 v） under its label (nothing on the others), a line under the graph compares
  this world's deviant variables with the actual world's, `這個世界 {GW, QW}；實際世界 {GW, D}，無法比較`
  (更正常／一樣正常／較不正常／無法比較, `atLeastAsNormal` both ways; before any do() only the actual
  world's), and each equation says 預設 v. HP with normality gives the same sentence as its reason
  when a world is less normal. `normality={false}` hides all of it.
- `dsep={['G', 'M']}` (or several pairs, switched in the head) on a probability graph: every path
  between the two in the graph after do() is drawn lit (accent) when open and dashed when blocked,
  the two ends ringed; the known set is what the reader observed. A line under the graph gives
  `G 與 M　已知 {L} → 通　相依程度 0.1736` and up to three paths with why
  (`G→A←M：對撞點 A 的後代 L 已知`; the rest counted). 相依程度 is lesson 04's
  δ(X, Y | z) = max |P(x,y|z) − P(x|z)P(y|z)| given the observed values, so the tuned parameters read
  通 · 0.000. The engine exports `dSeparation(model, x, y, given, cut, cutOut)` (each path, open or
  blocked and by what; `cutOut` removes the arrows out of those variables) and
  `dependence(model, prior, x, y, given, do, stochastic)`.
- A probability playground has a reading switch in its head, 「干預｜反事實」. The first
  (default) reads what is set as P(· | do(…), observed), and a node is either observed or set. Under
  反事實 the menu's rows read 實際（證據）, evidence about the actual world, and 假設干預, the supposed
  action; a node may be both (actual A=1, set A=0); the nodes show
  P(V_{do(…)} | evidence) by abduction, action and prediction, evidence nodes read 實際 v, other nodes
  實際 v where they moved from the actual world, and the chip reads `D=1 ⇒ 若 do(A=0)`. Switching
  keeps what is set; back to the first reading, a node that was both keeps only its do(). The embed
  code does not carry the reading (an embed opens in the first one).
- `sliders={['N_S1']}` on a probability playground: a slider per exogenous variable (boolean or
  two-valued, independent prior), written as in the probability panel; dragging
  recomputes everything drawn (numbers, trail, dsep, the bars below) with the new prior, and
  「回到原本的機率」 puts the sliders back. `prior={{ E: 0.1 }}` sets start values of exogenous
  variables, slider or not. The sliders live in a closed tab 「機率」 under the graph, under a heading per
  node they move, with a 「回到原本的機率」 for the sliders alone; a node's menu lists its own and a
  per-node reset once one moved; hovering a node lights its rows and a row its node. Every reset shows
  only once a slider it covers moved. `focusSliders={['A11', 'A10']}` shows only those rows at first, the
  rest behind 「顯示其他 n 個機率」 (and 「收起其他機率」); `openPanel="probabilities"` opens the tab at
  load (`"equations"` the 式子 tab; see 0.11.0). The embed code does not record slider
  positions (said in the hint's ⓘ).
  Other variables, a graph with values or a joint prior throw.
  `<CausalPlayground client:visible caseId="smoking-lesion" sliders={["N_S1"]} decision />`
- `decision` on a probability playground: expected-utility bars under the graph, a row for the
  evidential and one for the causal theory, one bar per act on a shared zero (negative to the left),
  and `選 S=0（多 16.74）` at the end of each row; the utility table and the two formulas sit in the ⓘ.
  Observing the act lights its evidential bar, do() on it its causal bar (no text). `true` takes the
  case's own decision (else it throws); or give one in the case-file format,
  `{ variable, acts?, utility: { variables, rows: [[...values, utility]] } }` (`CaseDecision`). Newcomb
  with Gibbard and Harper's utilities and error 0.1, the bundled case's million-dollar numbers left as they are:
  `<CausalPlayground client:visible caseId="newcomb" sliders={["D"]} prior={{ D: 0.1, E: 0.1 }} decision={{ variable: "A", utility: { variables: ["A", "M"], rows: [["one", 1, 100], ["one", 0, 0], ["two", 1, 101], ["two", 0, 10]] } }} />`
  (the causal theory gains 8.38 / 5.5 / 2.62 at D = 0.1 / 0.5 / 0.9; the evidential row stays 90 / 19.1).

### Conservative extensions

```tsx
import { ConservativeExtension } from 'causal-atlas'
import coarse from './m09-rock-coarse.json'
import m1 from './m09-bogus-seq-1.json'
// … m2, m3, m4

<ConservativeExtension client:visible models={[coarse, 'rock-throwing']} />
<ConservativeExtension client:visible models={[m1, m2, m3, m4]} verdicts={[{ cause: 'B=1', effect: 'VS=1' }]} />
```

`models` lists two or more models, each a bundled case id or a model document. Two are a pair: is the
second a conservative extension of the first (Halpern 2016, Def. 4.2.1)? Both are drawn side by side,
solved in the same context (`context`, default the first model's actual context); the extension's new
variables carry a green ring, and pointing at a node lights its namesake on the other side. A click on an
old endogenous variable, on either graph, sets do() on it in both (`initialInterventions` at the start);
a table lists each old variable's value in both models and whether they agree. The verdict under it is
the engine's `conservativeExtension` over every context and every intervention on old variables: yes,
with the number of pairs checked; no, with a counterexample and a button that shows it on the graphs; or
not comparable, with why (exogenous variables, a missing old variable, a range).

More models are a sequence M1 … Mn: 上一步／下一步 and a step indicator move through the pairs
(Mk, Mk+1), `initialStep` picks the first. A table over all models says whether each conservatively
extends the one before, and, with `verdicts` (as `CausalPlayground`'s, e.g. `{ cause: 'B=1', effect:
'VS=1' }`), each standard's verdict per model in its own actual context; the two columns of the current
step are shaded, and a column head jumps to the step that ends there. `names` replaces M1, M2, …;
`locale` as elsewhere.

### Identification experiment

```tsx
import { IdentifyPanel } from 'causal-atlas'
import 'causal-atlas/style.css'

<IdentifyPanel c={loadedCase} query={{ x: 'X', y: 'Y' }} />
```

Pass a `LoadedCase` as `c`, a model document as `doc`, or a bundled `caseId`.
`query` chooses the initial intervention `x`, outcome `y`, and optional observed condition `w` by variable ID; `x` and `w` take one ID or an array (`{ x: ['X', 'Z'], y: 'Y' }` for `P(y | do(x, z))`).
The IDs must be distinct endogenous variables; without `query`, the first two endogenous variables are used as `x` and `y`.
`locale` defaults to the surrounding `LocaleProvider`, or `zh-TW`.

The panel shows an observational formula and its derivation, or the hedge that prevents identification.
When the original case has a prior, the panel compares the formula with `do()` at value 1 for Boolean variables and the first domain value for other variables.
Edge edits change the graph, not the model's equations or prior, so numerical checks are unavailable until the original edges are restored.

### Probability views

- `<ProbabilityPanel view="adjust" adjust={{ x: 'X', y: 'Y', sets? }}>`: a switch in the head picks
  the grouping (`sets`, default every grouping of the other endogenous variables, at most three of
  them; more throw); the grouped variables are ringed with 分組 under them, and only the non-causal
  paths between x and y are marked (lit when open, dashed when blocked). A line gives
  `✓ 後門準則成立 ＝ 干預值` or `✗ C 是 X 的後代；已知 C 打開 X→C←Y ≠ 干預值` with the criterion in
  its ⓘ, and the table is the lesson's computation: each stratum, P(stratum), P(y | x, stratum) per
  value of x (— where there is no data), the weighted sum and the do() value.
  `<CausalModel id="m05-backdoor" as="probability" view="adjust" adjust={{ x: "X", y: "Y" }} />`
- `<ProbabilityPanel view="rules" rules={[...]}>`: a step button per `RuleStep`
  `{ label, rule: 1|2|3, pair: [a, b], given, cutIn?, cutOut?, switches?, equal?: [side, side] }`, each side
  `{ event, given?, do? }`.
  The graph shows values, not probabilities: observed and intervened nodes are ringed, arrows into interventions are cut, and lesson-written cuts made only for the test stay in place.
  The pair's paths are lit or dashed; a latent arc loses the end whose arrow is cut.
  A line says `X 與 Z 已知：無 → 分隔，規則二適用` with up to three paths and why, and the equation is computed on the full model, `P(Z=1 | do(X=1)) = 0.9 = P(Z=1 | X=1) = 0.9 ✓` (✗ and ≠ when they differ).
  A node opens its menu to observe or intervene; the tested pair's actions are disabled, and a step button resets the menu changes.
  Lesson 06's front-door
  derivation is `src/demo/front-door-steps.ts` (steps 2, 3, 4, 5a, 5b equal; 7 is open, 0.37 ≠ 0.4695);
  the model should carry `latent_as_arcs: ["U"]` so X←U→Y shows. With `switches: ["Z"]` the graph adds
  the intervention switch `F_Z → Z` (a small square), and `pair: ["F_Z", "Y"]` tests it with nothing cut
  but the arrows into what both sides set (`cutIn`): rule 2 `given` includes `Z`, rule 3 does not; the
  line says `F_Z 與 Y 已知 {W} → 暢通，不可換` (或 `分隔，可換`). A cut graph separated while the sides
  differ says so instead of 「適用」.
- `<ModelEditor tasks={[{ id, title, prompt, start, goal: { equations: { FF: 'L or MD' } }, predict?: { cause, effect } }]}>`:
  a card per task above the inputs: the question, 從它開始 (loads `start`), guess chips for the four
  definitions, and 檢查, which compares each goal equation with the edited one at every value of
  their parents together (an extra parent that changes nothing passes) and then reveals the edited
  model's verdicts and how many guesses were right, or names one setting where they differ
  (`L=0、MD=1 時，你的 FF 是 0，目標是 1。`). Progress is not kept in the link. Once the model is
  edited, the case's verdict table recomputes each verdict on it, under the column 你的模型. The
  list starts with the blank model and a line saying a case starts as a copy; on a content width of
  960 px or more the graph column stays in view (`--ca-sticky-top`), and on every width the inputs
  come before the case panel.
- `<ProbabilityPanel view="compare" pair>`: `pair` is one `{ event, observe, intervene }` or a list;
  with two or more, a switch labelled by each `observe` (`S=1｜S=0`) changes both sides together:
  `pair={[{ event: 'W=1', observe: 'S=1', intervene: { S: 1 } }, { event: 'W=1', observe: 'S=0', intervene: { S: 0 } }]}`.
- `<ProbabilityPanel view="counterfactual" counterfactual={{ evidence, do, event }}>`: Pearl's three
  steps on one graph, switched with 「1 溯因｜2 行動｜3 預測」 or 「下一步」 (`initialStep` 1–3 picks the
  first; `actionLabel` puts the question in words beside the formula). Abduction rings the evidence
  and gives P(· | evidence) with 原本 v; action sets do() and cuts the arrows into it, the variables
  below it marked 尚未重算; prediction gives each variable in the changed world, 實際 v where it moved.
  Under the graph a table lists every background (exogenous setting) with its prior and its
  probability given the evidence (0 and grey when ruled out; past 8 rows those fold into one line),
  and in step 3 the event variable after do(), the rows where the event holds marked, and the result
  `P(D_{A=0}=0 | D=1) = 0.0789` (four decimals at most). The priors stay under 「式子和機率」.
  `<CausalModel id="m00-firing-squad-nervous" as="probability" view="counterfactual" counterfactual={{ evidence: "D=1", do: { A: 0 }, event: "D=0" }} actionLabel="已知囚犯死了；若 A 沒開槍？" />`
- `<ProbabilityPanel view="mediation" mediation={{ treatment, mediators, outcome, from, to, formula? }}>`:
  Pearl's direct and indirect effects (2009, §4.5) in four steps on one graph, switched with
  「1 總效應｜2 受控直接｜3 自然直接｜4 自然間接」 or 「下一步」 (`initialStep` 1–4, `actionLabel`). Step 1
  sets X to `to`; step 2 sets X and holds the mediators as constants (a switch over their values);
  step 3 sets X to `to` while each mediator is tagged `Z←Z(X=0)`, held at the value it takes under
  `from` in each background, and the arrows into it are cut; step 4 keeps X at `from` with
  `Z←Z(X=1)`. Under the graph the result `P(Y_{X=1, Z_{X=0}}=1) − P(Y_{X=0}=1) = +0.15` with its two
  numbers. The 效應 tab lists TE, the controlled direct effect per setting of the mediators, NDE,
  NIE, the reverse indirect effect and the check TE = NDE − IE(reverse) ✓ (and, with `formula`, the
  mediation formula (4.17)/(4.18) marked ＝ or ≠ NDE and NIE, — where a cell has no data, with the
  cells named); the 背景 tab each background's four worlds (past 8 rows a button shows the rest).
  `<CausalModel id="m08-pill" as="probability" view="mediation" mediation={{ treatment: "X", mediators: ["Z"], outcome: "Y=1", from: 0, to: 1 }} />`
- `<ProbabilityPanel doc>` takes a document with priors or a `context` (a point mass);
  `<WorldLanes doc interventions>` needs a `context`, and `interventions` because a document has no preset.
- `<ModelEditor initialDoc>` renders that model on the server instead of a blank one; a share hash
  still overrides it on the client.
- A document that fails `modelDocSchema` or does not build (parse error, cycle, …) does not throw:
  the three panels show an alert with each problem's stable code (`data-code` on the alert), and the
  editor starts blank with the same alert.
- Export credit: a document's image carries 「案例出處」 only when `doc.from` is a bundled case and the
  model is that case's model (`sameModel`, see below); otherwise it has no case origin.

An imported document (pasted, uploaded or from a share link) keeps the bundled case it names in
`from`, and with it the image's case source, only when its model is that case's model: the same
variables, kinds and domains, equations with the same syntax trees, and the same context, priors and
normality defaults (`sameModel`). Labels, title and layout may differ. Anything else imports
without `from`.

Every graph (case page, playground, editor, probability panel, world lanes) has 「下載圖片」: PNG at 2×
or SVG, light or dark (default: the page's theme, read from the nearest `data-theme`), 中文 or English
(default: the component's language; the other one redraws the graph off-screen). The export draws the
current state (do(), witness hull, probabilities) with the blog's tokens resolved to literal colours,
and bakes in a watermark strip: 「洪偉（Wei Hung）· causal-atlas · CC BY 4.0 · <url>」 plus
「案例出處：…」 for a case, or in English "Wei Hung (洪偉) · causal-atlas · CC BY 4.0 · <url>" plus
"Case source: …"; English files end in `-en`. `exportUrl` sets the url (default
`https://wayneh.tw/causal/`).

Every text in a case file comes in both languages, `{ "zh-TW": …, "en": … }`, and both are
required: `title`, `story`, `explanation`, the optional `subtitle`, `intuition.text`, variable and
preset labels, and source notes. `copy_status` (`{ "zh-TW": "draft" | "checked", "en": … }`) says
whether each language's copy has been through writing and fact-checking; the bundled cases are all
`draft` for now. Case files may carry `story_tags` per language (`{ "zh-TW": [{ sentence, variables }],
"en": [...] }`: the case page tags each sentence, which must occur in that language's story, with its
variable ids) and `intuition` (`{ query, expected, text, agree }`: the everyday judgment on one
verdict query and the theories that reach it; the verdict list shows it first and marks the others
「和直覺不合」 / "Against intuition").

A case may give graph positions as `layout: { "ST": [column, row], … }`; only the listed variables are
drawn. Without it the graph shows endogenous variables plus exogenous ones with two or more children,
laid out in layers, and no edge passes over a node it does not join. A case file or model document may
name more exogenous variables to draw without a layout: `show_exogenous: ["W"]` (each must be
exogenous; a `layout` wins over it). `latent_as_arcs: ["U"]` draws an exogenous variable with two or
more children as a dashed two-headed arc between them instead of a node (not allowed together with
`show_exogenous` or a `layout` entry for the same variable). The equations panel lists every endogenous variable's equation,
also one whose parents are not drawn (`Y = U2`).
