# causal-atlas

Interactive structural causal models and a dataset of philosophical causation and decision cases.

## Package

`@wayne930242/causal-atlas` (0.1.0, not published) ships ESM with type declarations and one CSS file:

| Import | Contents |
| --- | --- |
| `@wayne930242/causal-atlas` | React components: `CasePage`, `CausalPlayground`, `ModelEditor`, `ProbabilityPanel`, `WorldLanes`, `Supplement`, `CiteBlock` |
| `@wayne930242/causal-atlas/engine` | The causal-model engine |
| `@wayne930242/causal-atlas/data` | The bundled cases: `listCases`, `getCase`, `caseIds`, `loadCase`, the schemas; model documents: `caseToDoc`, `docToCase`, `parseModelJson`, `encodeShare`, `decodeShare` |
| `@wayne930242/causal-atlas/style.css` | Styles for the components; import it once |

React 19 is a peer dependency. Importing the components touches no browser globals, so they render on
the server; interaction needs a client island, e.g. in Astro MDX:

```mdx
import { CasePage, WorldLanes } from '@wayne930242/causal-atlas'
import '@wayne930242/causal-atlas/style.css'

<CasePage client:visible caseId="rock-throwing" heading={false} />
<WorldLanes client:visible caseId="rock-throwing" interventions={{ SH: 0 }} actionLabel="攔下小蘇的石頭" />
```

The components read only the host's colour tokens (`--background`, `--foreground`, `--accent`,
`--accent-foreground`, `--muted`, `--muted-foreground`, `--border`) and define their own `--ca-*`
colours (slate, amber, green) with dark values under `[data-theme="dark"]`. Fonts inherit; numerals use
`--font-mono` when the host defines it.

`ModelEditor` lets readers build their own model: variables (id, Chinese label, exogenous or
endogenous, `0／1` or a list of values), equations in the authoring syntax with parse and cycle errors
shown inline, context values or priors, normality defaults, and node positions by dragging (or arrow
keys). It starts from any bundled case or a blank model, exports and imports JSON validated by
`modelDocSchema` (a whole case file also imports), and shares the model in the URL hash as
`#model=1.<base64url(deflate-raw(JSON))>`; the leading `1` is the format version. Props: `initial`
(case id or `blank`), `hash`, `shareHref(value)`, `exportUrl`.

Every graph (case page, playground, editor, probability panel, world lanes) has 「下載圖片」: PNG at 2×
or SVG, light or dark (default: the page's theme, read from the nearest `data-theme`). The export
draws the current state (do(), witness hull, probabilities) with the blog's tokens resolved to literal
colours, and bakes in a watermark strip: 「洪偉（Wei Hung）· causal-atlas · CC BY 4.0 · <url>」 plus
「案例出處：…」 for a case. `exportUrl` sets the url (default `https://wayneh.tw/causal/`).

Case files may carry `subtitle`, `story_tags` (`[{ sentence, variables }]`: the case page tags each
sentence with its variable ids) and `intuition` (`{ query, expected, text, agree }`: the everyday
judgment on one verdict query and the theories that reach it; the verdict list shows it first and
marks the others 「和直覺不合」).

A case may give graph positions as `layout: { "ST": [column, row], … }`; only the listed variables are
drawn. Without it the graph shows endogenous variables plus exogenous ones with two or more children,
laid out in layers.

## Scripts

- `pnpm dev`: the demo site (playground, a page per case, a lesson with world lanes)
- `pnpm typecheck`, `pnpm test`, `pnpm lint`
- `pnpm build`: the demo site into `dist-demo/`
- `pnpm build:lib`: the library into `dist/`

## 如何引用

學術或教學使用請引用。引用資訊也在 `CITATION.cff`，元件 `CiteBlock` 會顯示同樣的內容。

作者—年份：

> 洪偉（Wei Hung）（2026）。causal-atlas（0.1.0 版）。https://wayneh.tw/causal/

> Hung, W. (2026). causal-atlas (Version 0.1.0) [Software and dataset]. https://wayneh.tw/causal/

BibTeX：

```bibtex
@software{hung_causal_atlas_2026,
  author  = {Hung, Wei},
  title   = {causal-atlas},
  year    = {2026},
  version = {0.1.0},
  url     = {https://wayneh.tw/causal/},
  note    = {Code: MIT; data and teaching text: CC BY 4.0}
}
```

## 授權

- 程式碼：MIT（`LICENSE`），著作權人 洪偉 Wei Hung。
- 案例資料（`src/data/cases/`）與教學文字：CC BY 4.0（`LICENSE-DATA`）。轉用請標示「洪偉（Wei Hung）」與出處。
