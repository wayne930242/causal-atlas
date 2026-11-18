# causal-atlas

Interactive structural causal models and a dataset of philosophical causation and decision cases.

## 0.3.15
Fixes from a classroom test of the lessons. Automatic layout no longer runs an edge under a node it does not join (the sprinkler's R→W, the back-door and front-door graphs): a node in the way steps half a row aside, each node sits at the mean row of its parents, and 切斷 is placed off the edges still drawn; two bundled layouts (train switching, trumping) moved for the same reason. On a graph with values, a click pins the value a node shows under the other do()s, then the other value, then releases, so do(C=0) followed by B can reach B=0. A click observes a multi-valued node too (each value in turn, then released). Exogenous nodes are the context: they can be observed, never set by do() (and the pen-fiasco preset that set `U_N` is gone). The case page works its probability and decision verdicts out at the current sliders. Numbers round halves away from zero (0.175 → 0.18). The equations panel lists every endogenous equation (`Y = U2`); `show_exogenous` in a case file or model document names exogenous variables to draw without a layout, and do() then names every drawn parent it cuts. A witness lane says whether each held variable keeps its actual value or another one. The do() popover closes when what it sets is reset from the keyboard, and avoids the other nodes; header chips and footer controls no longer break mid-word on narrow screens. Normality wording: a witness that deviates where the actual world does not, and the other way round, is incomparable with it, so not at least as normal (gardener and Queen, the pen cases, red light, antidote); the sharks source note cites what Halpern's pp. 82 and 91 say.

## 0.3.14
The export menu (「下載圖片」) of a playground can copy an embed code: an iframe of the figure's embed page, carrying what is observed and set (`#do=…&pdo=…&obs=…`) and the page it was copied from (`?from=`), with `lang=en` for an English figure, followed by the citation given for the academic image (author-year, CC BY 4.0, the case's sources). A bundled case's embed page defaults to `https://wayneh.tw/causal/embed/case/<id>/`; a document needs `embedUrl`, and `embedUrl={false}` turns it off. `embedded` draws a playground as such a page: state from the address, and a credit line (author, licence, sources, link back to the original page) under it.

It also carries the observation gestures below, tagged 0.3.13 but never published (that release's README citation was out of date, so its publish run failed).

## 0.3.13
Observation and intervention are separate gestures. On a graph drawn with probabilities a click (or Enter) observes a node: =1, again =0, a third time released; the numbers become P(· | do(…), observed), conditioned in the intervened model, and no arrow is cut. A long press (0.5 s, with a filling ring), Shift+click or Shift+Enter intervenes: a boolean node is set to 1 at once and its P(X=1) slider opens. On a graph with one set of values a click intervenes: first at the current value, then the other value, then released. Each set node keeps its kind (a ring and `X=1` tag when observed, a clamp and `X←1` tag when intervened), the chip reads `do(X=1), Z=1`, and an observation that cannot happen under what is set is refused with a note. The editor keeps observations out of its address.

## 0.3.12
Probabilities within 0.01 of 0 or 1 show two significant digits (0.0001, 0.9999) instead of rounding to 0.00 or 1.00.

## 0.3.11
Label and readout sit together under each node; repeated ids in labels are dropped; bars scale to the most likely value. In probability mode a boolean node takes a P(X=1) slider: 0 and 1 are do(X=0)/do(X=1), values between are a stochastic intervention (Pearl 2009, pp. 113-114).

## 0.3.10
Multi-valued nodes show one bar per value; the do() value popover opens beside the node.

## 0.3.9
do() on a multi-valued node opens a value slider with a Release button; boolean nodes still toggle.

## 0.3.8
zh-TW playground hint shortened to 「點圖上的節點，可以點擊切換設定值。」

## 0.3.7

zh-TW wording: interventions are 「行動」 (not 「動手」) in the UI notes, and backup processes are 「備援」 in three case texts.

## 0.3.6

The train-switching case keeps Halpern and Pearl’s LT/RT variant in its source note.

## 0.3.5

The zh-TW case texts are rewritten: shorter stories and explanations, glossary terms with English at first use. Cases embedded in an article (`heading={false}`) get a framed caption bar. Case-page step labels are shorter (干預, 定義評判) and the empty first-step panel shows a large “?”. The do() note reads 「切斷 X，直接設成 v」.

## 0.3.4

Two case families are renamed: 不作為 → 不作為與責任 (Omission and responsibility) and 常態與規範 → 規範與預設值
(Norms and defaults).

## 0.3.3

The editor's case list keeps one filter chip for all host models (label from the new optional `modelsLabel`
prop, default 講義模型 / Lesson models) instead of one per `extraModels` group. Inside the list the groups
stay as headings, in the order given, and the search still matches group names.

## 0.3.2

The equations box gets a 「複製 LaTeX」 button that copies the current notation as an `aligned` block, and
copying a selection of rendered formulas yields their LaTeX source. The 「下載圖片」 link now lines up with its
neighbours in the lane foot, and the notation tabs keep a gap above the first equation row.

## 0.3.1

The editor lists the cases in a sidebar: a search box (either language), one chip per family or host
group, and the cases grouped by family. In a narrow container the list opens from a 「選案例」 button
as a full-height sheet. The internal `ModelPicker` select is gone (it was never exported).

## 0.3.0

About 43 cases, a case panel, `caseLinks` and `extraModels` props, URL sync, and a wide layout.

## Package

`causal-atlas` (0.3.15) ships ESM with type declarations and one CSS file:

| Import | Contents |
| --- | --- |
| `causal-atlas` | React components: `CasePage`, `CausalPlayground`, `ModelEditor`, `ProbabilityPanel`, `WorldLanes`, `Supplement`, `CiteBlock`; `LocaleProvider` |
| `causal-atlas/engine` | The causal-model engine |
| `causal-atlas/data` | The bundled cases: `listCases`, `getCase`, `caseIds`, `loadCase`, the schemas; model documents: `caseToDoc`, `docToCase`, `parseModelJson`, `encodeShare`, `decodeShare`, `sameModel` |
| `causal-atlas/style.css` | Styles for the components; import it once |

React 19 is a peer dependency. Importing the components touches no browser globals, so they render on
the server; interaction needs a client island, e.g. in Astro MDX:

```mdx
import { CasePage, WorldLanes } from 'causal-atlas'
import 'causal-atlas/style.css'

<CasePage client:visible caseId="rock-throwing" heading={false} />
<WorldLanes client:visible caseId="rock-throwing" interventions={{ SH: 0 }} actionLabel="攔下小蘇的石頭" />
<CasePage client:visible caseId="rock-throwing" locale="en" />
```

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
`src/components/i18n.ts`; a test fails when a component holds a Chinese literal of its own.

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
(case id, `extraModels` id or `blank`), `hash`, `syncUrl`, `shareHref(value)`, `exportUrl`, `locale`,
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

- `<CausalPlayground doc>`: graph, notation toggle, observation and do() on the nodes (see 0.3.13) and the export menu, server-rendered
  with values, no editor chrome. On a probability graph a click observes, and a long press, a mouse
  right-click or Shift+click intervenes (a touch long press intervenes once, though Android also sends
  `contextmenu`); a graph with values keeps the browser's menu. The hint under the graph is one line;
  its ⓘ opens the details in a tooltip (hover, keyboard focus or a tap; `aria-describedby`).
- `presets` (step buttons) is `true` (a bundled case's own; a document has none), `false`, or a list of
  `{ label: string | { 'zh-TW', en }, interventions?, observed?, hold? }`. One press sets exactly
  those do()s and observations; `observed` needs a probability graph (on a graph with values it
  throws), `hold` sets do() too but draws the held variables in the amber witness hull (固定). The
  buttons sit inside the figure's frame under the graph; the one that matches what is set is
  `aria-pressed`. For a lesson step:
  `presets={[{ label: '第 1 步：看到 A 沒開槍', observed: { A: 0 } }, { label: '第 2 步：攔住 A', interventions: { A: 0 } }]}`.
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
  check `actualCause` makes for each candidate; its ⓘ explains what holding means for each
  standard. With verdicts, a do() on a variable other than the cause is drawn held: in the amber hull
  with 固定（實際 v） under its label, or 固定（實際值） when held at its actual value (so are a step's
  `hold`s). With several queries the line answers the first whose cause is set away from its actual
  value. `actualGroups(t, c, queries)` takes the same queries.
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
  通 · 0.000. The engine exports `dSeparation(model, x, y, given, cut)` (each path, open or blocked and
  by what) and `dependence(model, prior, x, y, given, do, stochastic)`.
- A probability playground has a reading switch in its head, 「干預後再觀察｜反事實」. The first
  (default) reads what is set as P(· | do(…), observed), and a node is either observed or set. Under
  反事實 the same gestures mean evidence about the actual world (click) and the supposed action (long
  press, right-click, Shift+click); a node may be both (actual A=1, set A=0); the nodes show
  P(V_{do(…)} | evidence) by abduction, action and prediction, evidence nodes read 實際 v, other nodes
  實際 v where they moved from the actual world, and the chip reads `D=1 ⇒ 若 do(A=0)`. Switching
  keeps what is set; back to the first reading, a node that was both keeps only its do(). The embed
  code does not carry the reading (an embed opens in the first one).
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
exogenous; a `layout` wins over it). The equations panel lists every endogenous variable's equation,
also one whose parents are not drawn (`Y = U2`).

## Scripts

- `pnpm dev`: the demo site (playground, a page per case, a lesson with world lanes); the header
  switches language, or add `lang=en` to the route (`#/case/rock-throwing?lang=en`)
- `pnpm typecheck`, `pnpm test`, `pnpm lint`
- `pnpm build`: the demo site into `dist-demo/`
- `pnpm build:lib`: the library into `dist/`

## 如何引用

學術或教學使用請引用。引用資訊也在 `CITATION.cff`，元件 `CiteBlock` 會顯示同樣的內容。

作者—年份：

> 洪偉（Wei Hung）（2026）。causal-atlas（0.3.15 版）。https://wayneh.tw/causal/

> Hung, W. (2026). causal-atlas (Version 0.3.15) [Software and dataset]. https://wayneh.tw/causal/

BibTeX：

```bibtex
@software{hung_causal_atlas_2026,
  author  = {Hung, Wei},
  title   = {causal-atlas},
  year    = {2026},
  version = {0.3.15},
  url     = {https://wayneh.tw/causal/},
  note    = {Code: MIT; data and teaching text: CC BY 4.0}
}
```

## 授權

- 程式碼：MIT（`LICENSE`），著作權人 洪偉 Wei Hung。
- 案例資料（`src/data/cases/`）與教學文字：CC BY 4.0（`LICENSE-DATA`）。這兩者打包進 `dist/*.js` 之後仍是 CC BY 4.0；轉用請標示「洪偉（Wei Hung）」與出處。
- `package.json` 的 `license` 欄位因此寫 `MIT AND CC-BY-4.0`。
