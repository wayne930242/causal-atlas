# causal-atlas

Interactive structural causal models and a dataset of philosophical causation and decision cases.

## Package

`causal-atlas` (0.2.6) ships ESM with type declarations and one CSS file:

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
(case id or `blank`), `hash`, `shareHref(value)`, `exportUrl`, `locale`.

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

- `<CausalPlayground doc>`: graph, notation toggle, do() on click and the export menu, server-rendered
  with values, no editor chrome. `presets` is `true` (a bundled case's own; a document has none),
  `false`, or a list of `{ label: string | { 'zh-TW', en }, interventions }`.
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
laid out in layers.

## Scripts

- `pnpm dev`: the demo site (playground, a page per case, a lesson with world lanes); the header
  switches language, or add `lang=en` to the route (`#/case/rock-throwing?lang=en`)
- `pnpm typecheck`, `pnpm test`, `pnpm lint`
- `pnpm build`: the demo site into `dist-demo/`
- `pnpm build:lib`: the library into `dist/`

## 如何引用

學術或教學使用請引用。引用資訊也在 `CITATION.cff`，元件 `CiteBlock` 會顯示同樣的內容。

作者—年份：

> 洪偉（Wei Hung）（2026）。causal-atlas（0.2.6 版）。https://wayneh.tw/causal/

> Hung, W. (2026). causal-atlas (Version 0.2.6) [Software and dataset]. https://wayneh.tw/causal/

BibTeX：

```bibtex
@software{hung_causal_atlas_2026,
  author  = {Hung, Wei},
  title   = {causal-atlas},
  year    = {2026},
  version = {0.2.6},
  url     = {https://wayneh.tw/causal/},
  note    = {Code: MIT; data and teaching text: CC BY 4.0}
}
```

## 授權

- 程式碼：MIT（`LICENSE`），著作權人 洪偉 Wei Hung。
- 案例資料（`src/data/cases/`）與教學文字：CC BY 4.0（`LICENSE-DATA`）。這兩者打包進 `dist/*.js` 之後仍是 CC BY 4.0；轉用請標示「洪偉（Wei Hung）」與出處。
- `package.json` 的 `license` 欄位因此寫 `MIT AND CC-BY-4.0`。
