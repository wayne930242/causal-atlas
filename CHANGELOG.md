# Changelog

## 0.25.0 (unreleased)
The npm package moves to `logic-atlas`. No further releases will use the old name; the old package will carry an npm deprecation notice pointing here. Install `logic-atlas` and update imports as follows. There is no root export. The JSON document format `causal-atlas/model` is unchanged.

| Previous import | New import |
| --- | --- |
| `causal-atlas` | `logic-atlas/causal` |
| `causal-atlas/playground` | `logic-atlas/causal/playground` |
| `causal-atlas/probability` | `logic-atlas/causal/probability` |
| `causal-atlas/identify` | `logic-atlas/causal/identify` |
| `causal-atlas/lanes` | `logic-atlas/causal/lanes` |
| `causal-atlas/extension` | `logic-atlas/causal/extension` |
| `causal-atlas/case` | `logic-atlas/causal/case` |
| `causal-atlas/editor` | `logic-atlas/causal/editor` |
| `causal-atlas/cite` | `logic-atlas/causal/cite` |
| `causal-atlas/supplement` | `logic-atlas/causal/supplement` |
| `causal-atlas/i18n` | `logic-atlas/causal/i18n` |
| `causal-atlas/modal` | `logic-atlas/modal` |
| `causal-atlas/engine` | `logic-atlas/causal/engine` |
| `causal-atlas/data` | `logic-atlas/causal/data` |
| `causal-atlas/style.css` | `logic-atlas/causal/style.css` |
| `causal-atlas/modal.css` | `logic-atlas/modal/style.css` |

Modal logic: a new entry, `logic-atlas/modal`, with the seven figures appendix D needs, each in zh-TW and en and rendered on the server. `IntensionTable` reads intensions as functions from worlds to truth values; `KripkeView` draws ⟨W, R, a⟩ as Garson's boxes and arrows and, for □ and ◇, marks the worlds the selected one sees with the counterexample or witness (`editable` adds atom and arrow toggles and a formula field); `FrameConditions` sets serial, reflexive, transitive, symmetric and euclidean, each failure with its worlds, beside D, M (also called T), 4, B and 5, each failure with its assignment and world; `StrictImplication` sets A ⊃ B beside □(A ⊃ B); `TcsCheck` shows transitivity, contraposition and strengthening the antecedent holding for strict implication and failing on spheres, until 「壓成一層」 presses the spheres into one; `SphereView` reads A > B by Lewis or by Stalnaker, who leaves several closest worlds undefined (`not-unique`); `SurgeryVsSimilarity` puts Lewis's closest worlds under adjustable weights beside Pearl's minimal surgery on boolean equations, for Fine's Nixon example. Figures take their documents (`kind: "kripke" | "frame" | "spheres"`) as props; the package ships no modal case data. See [Modal logic figures](docs/components.md#modal-logic-figures).
The same entry exports the modal engine (formula parser and printer in the modern and Garson notations, Kripke truth with explanation trees, frame conditions and axiom validity by enumeration, Lewis and Stalnaker counterfactuals, similarity spheres, surgery) and `parseModalJson`. An independent Python evaluator, `oracle/modal.py`, checks it on random models, frames and sphere systems; every frame with up to three worlds is checked for "condition holds iff axiom valid" in each test run.
The modal figures are built apart (`vite.lib.modal.config.ts`): they reuse the causal source (KaTeX formulas, label placement, arrowheads, the segmented control, the locale hooks) but bundle it into `dist/modal.js`, so no causal entry loads modal code and every causal entry and `style.css` keep their 0.24.6 size. Their styles are in `logic-atlas/modal/style.css`, loaded with `style.css`, and their `LocaleProvider` is the one exported by `logic-atlas/modal`.

| Entry | 0.24.6 | 0.25.0 |
| --- | --- | --- |
| `logic-atlas/causal` | 948.7 kB, 311.4 kB gzip | same |
| `logic-atlas/causal/playground` | 387.8 kB, 123.3 kB gzip | same |
| every other causal entry, `style.css` | | same |
| `logic-atlas/modal` | (none) | 102.7 kB, 27.8 kB gzip, one file |

`pnpm check:dist` now also fails when `./modal` passes 113 kB raw or 30.6 kB gzip, or when any other entry imports the modal build, and server-renders each modal figure. The demo site has a 模態邏輯 / Modal logic page (`#/modal`). docs/modal-set-design.md is the design for the modal and (later) set-theory entries.

## 0.24.6
Node labels keep off edges, arcs and arrowheads: a label tries below, above, right and left of its disc, each on one line and then wrapped on two (English only; Chinese names never wrap), and sits clearly nearer its own disc than any other, 10 px from other labels. Three or more nodes in a column put their labels on one side. In exported images the 「偏離預設」 / "deviant" tag is a dashed outline, as on the page, instead of a black box.

## 0.24.5
The 「原本 1」 / "was 1" note under an intervened graph no longer covers node labels: it is placed after the labels, centred under (or over) its own label, else beside it or the disc, clear of every disc, do tag, label and other note, and the drawing grows to hold it.

## 0.24.4
Credits name the case's originals everywhere a figure or citation leaves the package. The academic reminder's 「複製引用文字」 / "Copy citations" copies the project line and every case source; court decisions shorten to "Palsgraf v. Long Island Railroad Co. 1928" on images and the case page footer; four or more sources show the first two and 「等」 / "et al.".

## 0.24.3
LICENSE-DATA and the README say that most cases are adapted from the works their `sources` list: those works stay their authors', CC BY 4.0 covers only the dataset's own wording, models and teaching text, and reuse credits the originals too.

## 0.24.2
The README is a short front page with the demo links; release notes moved to CHANGELOG.md and component details to docs/components.md.

## 0.24.1
The zh-TW text calls part of a cause 「原因成分」 (was 「原因的一部分」) in the verdict table, the witness line and the responsibility tip.

## 0.24.0
Inhibit labels such as `¬A1` now stay clear of their own edge and the graph's nodes.
A page that embeds one figure downloads that figure's code and its case, not the whole package. Each component has its own entry (`causal-atlas/playground`, `/probability`, `/identify`, `/lanes`, `/extension`, `/case`, `/editor`, `/cite`, `/supplement`, `/i18n`); `causal-atlas` still exports every name, and a bundler that tree-shakes keeps only what a page imports from it.
A component given `caseId` loads that case alone, as its own chunk, and the image export loads when 「下載圖片」 opens. On the server under Node every case is ready before the first render, so the markup still holds the figure; in the browser the island keeps that markup until its case arrives, then hydrates (see [Package](docs/components.md#package)). `preloadCase(id)` loads a case ahead of time.
Measured on the built `dist/` (an entry plus every file it imports statically; gzip at zlib's default level, per file; React, KaTeX and zod not counted):

| Entry | 0.23.0 | 0.24.0 |
| --- | --- | --- |
| `causal-atlas` | 929.6 kB, 244.2 kB gzip | 940.1 kB, 308.8 kB gzip (every component; the editor's case list brings every case, now one file each) |
| `causal-atlas/playground` | (none) | 379.3 kB, 120.7 kB gzip |

Bundled for a browser page that imports only `CausalPlayground` from `causal-atlas` (Vite, minified), the page loads 246.4 kB (86.7 kB gzip) plus its case, about 6 kB, against 525.6 kB (165.1 kB gzip) in 0.23.0, which carried all 45 cases. `pnpm check:dist`, which `pnpm build:lib` runs, fails when the playground entry passes 420 kB raw or 133 kB gzip, or statically imports any case, and server-renders a case through each component entry.

## 0.23.0
Conservative extensions (Halpern 2016, Def. 4.2.1). The engine's `conservativeExtension(base, extension, { context? })` checks every context and every intervention on a subset of `base`'s endogenous variables, smallest interventions first, and returns `{ kind: 'extension', added, checked }`, a `counterexample` (`{ context, interventions, variable, base, extension }`), or a `precondition` failure (`exogenous-differ`, `variable-missing`, `domain-differ`); past `MAX_EXTENSION_CHECKS` pairs it throws `extension-budget`.
`ConservativeExtension` draws a model beside its extension (`models={[coarseDoc, 'rock-throwing']}`): the extension's new variables in a green ring, do() on an old variable set from either graph, a table of the old variables' values on both sides, and the verdict with its counterexample and 「在圖上看這個反例」. With more models (`models={[m1, m2, m3, m4]}`) it steps through the pairs (上一步／下一步), and `verdicts` adds a table over all models, so Theorem 4.4.1's flip under the HP definitions shows across the sequence.

## 0.22.0
The playground marks a do() back to the actual value apart from a change (grey corners, 「X＝v（實際值）」) and groups the header chip into changed, held and reset; the cut-edge mark joins the legend when shown.
A step may name its `test` and `expect` outcomes; after the press a line reports the required and resulting values and whether the check passed. The status line under the verdicts speaks of 圖上這組設定 and says when a witness fails minimality (AC3), so it no longer reads against the verdict table.

## 0.21.0
The playground's verdicts draw a variable held (amber hull) only for a step's `hold` or the shown witness's W⃗; a do() the reader sets, or a step without `hold`, is a clamp, so 在圖上看 on a witness with W⃗ = ∅ (the modified definition's 「L 且 MD」) shows both causes clamped.
A held variable says 固定為 w（實際 v）, a line under the graph names the marks it shows, the but-for column reads 「but-for 檢驗」, and 目前的世界's ⓘ 說明 opens on click or keyboard.

## 0.20.0
`IdentifyPanel`'s `query.x` and `query.w` take one ID or a set: `<IdentifyPanel c={loadedCase} query={{ x: ['X', 'Z'], y: 'Y' }} />` asks for the controlled direct effect `P(y | do(x, z))`.
The verdict, formula, formula-beside-do() check (at value 1 or the first domain value of every treatment) and derivation all read the set; 「干預 X」 and 「條件 W」 are checkbox sets (X never empty, X, Y and W kept disjoint), and choosing as Y a variable in X swaps the old Y into X.

## 0.19.0
`IdentifyPanel` (`<IdentifyPanel c={loadedCase} query={{ x: 'X', y: 'Y', w? }} />`, also `doc` or `caseId`) is an identification experiment a lesson embeds: the case's graph, a verdict for `P(y | do(x), w)`, the formula over observed variables, and the formula's value beside the do() value on the case's model.
The derivation lists each step in words (「規則二 以觀察 X 代替干預 X（對 Z）」) with its equation below; a step opens in the do-calculus view, where a generated step's observe and do menus are read-only, and a check that compared no assignment reads unavailable rather than equal.
A non-identifiable query marks the hedge on the graph: `F` with a solid ring and amber edges, `F′` with a dashed ring, and one line on why.
「編輯圖形」 adds or removes a directed edge or a bidirected arc and picks X, Y and W; the verdict and formula follow the drawn graph, numbers show only while the graph is the model's, and 「還原圖形」 brings them back.

## 0.18.0
The engine writes do-calculus derivations: `derive(g, y, x, w?)` follows ID or IDC from `P(y | do(x), w)` to `identify`'s formula, step by step, or returns the hedge.
Each rule step names its rule (1, 2 or 3), the whole expression before and after, the term it rewrites, and its test `{ moved, head, given, cutIn, cutOut }`, computed from the rule (rule 3 cuts the arrows into `Z(W)`) and checked by m-separation before the step is kept; probability-calculus steps (`expand`, `chain`, `conditional`, `substitute`, `simplify`) carry the identity they use. `matches` says the last expression is structurally `identify`'s formula (it is always equal in value).
Expressions take `do()` terms (`DoExpr`, `P(y | do(x), z)`), and `compareDoExprs(model, prior, a, b, tol)` compares two sides on a model at every assignment of their free variables.
In the do-calculus view, a `RuleStep` may give its sides as expressions (`symbolic`) and test sets (`sets`), checked at every assignment; `RulesPanel` also shows calculus steps, with their identity and the same check and no graph.
On lesson 06's front door the generated rule steps are the lesson's 2, 3, 4, 5a and 5b (same rule, pair, known set and cuts), with four calculus steps between them.

## 0.17.0
The engine identifies causal effects: `identify(g, y, x, w?)` runs ID (Shpitser & Pearl 2006) or, with `w`, IDC on an ADMG and returns either a formula over observed variables (`formula`, `text`, `latex`) or the hedge `{ f, fPrime }` that rules identification out.
Backdoor gives `Σ_z P(y|x,z) P(z)`, front door `Σ_z P(z|x) Σ_x' P(y|x',z) P(x')`, napkin a ratio with `Z` listed in `arbitrary` (any setting of it gives the same value), and the bow the hedge `F = {X, Y}`, `F′ = {Y}`.
`admgOf(model)` reads a model's ADMG (an exogenous variable feeding two or more endogenous ones becomes bidirected arcs, as `latent_as_arcs` draws them); `admgForPrior(model, prior)` also merges exogenous variables a joint prior makes dependent.
`evaluateProbExpr(formula, joint, at, domains)` evaluates a formula on an observational joint (`observedJoint`), and `checkIdentification(model, prior, { y, x, w })` puts the formula's value beside the do() value for every assignment.
The tests compare every verdict and formula with dosearch, causaleffect and y0 on 52 graphs (run as external test oracles under `oracle/`, not shipped), and every identifiable effect in the lesson models with do() to 1e-9.

## 0.16.0
On a switch graph of the do-calculus view (`view="rules"`, a step whose `pair` names a switch `F_Z`), the pair's other end (`Y` in rule 2, `X` in rule 3) shows its current `P(=1)` under its node, so setting the switch to 0 or 1 moves the number on the graph.
The line under the graph compares only the current setting: setting `Z=v` against not setting it, with `Z` seen at the same `v` when it is known (rule 2) and unknown otherwise (rule 3), e.g. 「設定 Z=0：P(Y=1)=0.29 ／ 看到 Z=0：0.29 → 相同」; with the switch off it gives the current prediction alone.
That line replaces the switch row and the equation row on a switch graph, and the verdict 「可換」 is checked against it at every value of `Z`.
The paths under the verdict fold into 「路徑（n 條）」, closed by default, and the instructions for the switch move to the legend.

## 0.15.0
The do-calculus view (`view="rules"`) uses the probability view's node menu, with observation and intervention buttons but no probability controls.
An intervened variable is known at its set value; releasing it restores the incoming arrows unless the lesson cut them for the test, and makes the variable unknown again.
The equation and separation verdict follow the menu, while the term the rule compares stays on its written side.
In rule 1's 「已知病情」, releasing `do(X=1)` opens `Z → X → Y` and changes the equation from `0.5 = 0.5` to `0.44 ≠ 0.404`.
Clicking a switch `F_Z` opens the menu for `Z`: its intervention row sets the switch without changing the known set or the separation test.
The step button restores the lesson's settings.

## 0.14.1
The do-calculus view writes values inside its nodes: a variable a switch sets shows the set value (`Z` reads 0
under 「設定 Z=0」), and each known variable shows the value it is read at, its value in the step's equation, else
1 (rule 3's exception draws `W` as 1); the graph still draws no probabilities. The equation under the graph
follows the switch: while it sets `Z=0`, rule 3's `P(Y=1 | W=1, do(Z=1))` reads `do(Z=0)` (in do() and in an
observation alike, so rule 2's `P(Z=1 | X=1)` reads `X=0`), and the switch off restores the equation as
written, so the page never shows two settings at once. The switch row lists the prediction with the switch
off and at every setting, the current one highlighted: 「F_Z 不動：P(Y=1 | W=1) = 0.692；設定 Z=0：… = 0.5；設定
Z=1：… = 0.5」, with 「（Z 設成哪個值，預測都一樣）」 when every setting agrees, so tutoring 0 → 1 not moving income is
visible beside the switch moving the prediction.

## 0.14.0
The do-calculus view's legend is a side panel beside the graph when both fit at the graph's own width (a
lesson figure in a 1040px column keeps its full width with a 200px panel), and a list under the graph
otherwise, so the panel never shrinks the graph; the separation line, paths and equation stay under the
graph. A click on an intervention switch `F_v` no longer adds it to the known set: it sets `v` to each value
in turn (不動 → 設定 v=0 → 設定 v=1 → 不動; en off → set to 0 → set to 1 → off). While set, the arrows into `v`
are drawn cut (not `F_v → v`), `v` is clamped with its `v←1` tag (legend 「夾角加標籤：開關設定的值」), and a row
gives the prediction of the pair's other end on the full model with the switch off and on, e.g. rule 3's
exception 「設定 Z=1：P(Y=1 | W=1, do(Z=1)) = 0.5；F_Z 不動：P(Y=1 | W=1) = 0.692 → 開關改變了預測」 and the front
door's rule 2, 0.9 both ways, 「開關沒有改變預測」, to read beside the d-separation verdict. The step button
turns the switches off.

## 0.13.0
The do-calculus view (`view="rules"`) draws Pearl's intervention switch. A step's `switches: ["Z"]` adds a
node `F_Z` with one arrow `F_Z → Z`, drawn as a small square labelled `F_Z`; no arrow into `Z` is cut by it.
A step whose `pair` names a switch (`pair: ["F_Z", "Y"]`) tests it on the expression's graph: only the arrows
into the variables both sides already set by do() are cut (`cutIn`), nothing for the test, and the known set
is the one both sides observe (rule 2 adds `Z`, rule 3 does not). The line then says 可換 or 不可換 (en "the
two sides can be swapped" or "cannot be swapped") from that d-separation alone, and lists the paths, e.g.
`F_Z → Z ← U → Y` opened by the observed descendant `W`. A switch step fails fast when `cutIn` names a switched
variable or one the two sides do not both set, or when it has `cutOut`. The engine exports
`withSwitches(model, ids)` and `switchId(id)`.

A cut graph never says a rule applies while the equation's two sides differ: separated with the step's own
known set but unequal sides reads 「分隔，但等式兩邊的數字不等：這張圖不能用來換」 (the wrong cut of rule 3's
exception). Once a click moves the known set off the step's own, the equation is replaced by a note that it is
written for the step's known set. The legend and node roles name each mark by its part in the test: the
switch, given (雙圈：給定的變數), set by do in the expression (夾角), and cut for the test only (a dashed clamp,
「虛線夾角：只為檢驗剪掉指向它的箭頭，式子沒有設定它」; arrows out cut likewise say 「只為檢驗」), so a cut
the expression does not make no longer says 「由 do 設定」.

## 0.12.0
The do-calculus view (`view="rules"`) gains a legend under the cut graph that names only the marks the step
draws, each beside a small swatch drawn like it: the outer ring (the pair checked for separation), the double
ring (known), the corner clamp (arrows into it cut, set by do), the dashed arrow with 「切斷」 (a cut arrow), and,
when a path is marked, lit arrows (an open path) and faint dashes (a blocked path); it ends by saying a click on
a node adds it to the known set or takes it out. Hovering or focusing a node shows its roles in the step and what
a click does (「要檢查的變數・已設定。點一下加進已知集合」, en "Checked pair · set by do. Click to add it to the
known set."); the node's aria label reads the same roles. The exported image is unchanged (no legend).

## 0.11.0
A fourth notation in the 式子 tab, 分段式 (en "Cases", `defaultNotation="cases"`), reads each equation as
if-then rows, the way the model language writes it: `if X then (if U then A11 else A10) else A0` becomes
`Y = \begin{cases} A_{11} & X=1,\ U=1 \\ A_{10} & X=1,\ U=0 \\ A_0 & X=0 \end{cases}` (nested ifs flattened, each
row carrying every condition on the way to it, a negated condition pushed down to its events: ¬(ST ∨ BT)
reads ST=0, BT=0). A table gives one row per entry (its fallback `otherwise`); another two-valued equation
gives a row for 1 and one for 0 (`BS`: 1 when ST=1 ∨ BT=1, 0 when ST=0, BT=0); a bare variable stays
`C = U`, and a many-valued equation without `if` is written as in 數學式. With values, the worked column
names the row that holds (`= A_{10} = 1`). The switch reads 邏輯式／分段式／數學式／干預式. The engine's
`Notation` gains `'cases'` and exports `casePieces(model, id)`.
`CausalPlayground` gains `openPanel` (`'probabilities'`, `'equations'`, or a figure block: `'verdicts'`,
`'ev'`, `'dsep'`, `'blame'`), the block under the graph open at load, and `focusSliders`, the sliders the
機率 tab shows at first; the others wait behind 「顯示其他 n 個機率」, which shows them and then reads
「收起其他機率」. The tab's 「回到原本的機率」 shows only once a slider moved, as the header's and the node
menu's already did.

## 0.10.0
Reader-facing text is typeset with KaTeX: the node menu's state notes (填色高度：P(C=1)…, the double ring,
red clamp and red outer ring lines), the random-intervention slider label, slider labels (including a named
value such as (D1=1)), the d-separation and rules readouts (the pair 「S 與 R」 and the known set {…}), edge tips,
the fixed tips, background headers, the mediation effects lines, the [X←x](Y=y) reading and the HP and EU
definitions. Buttons (C=1, do(C=1)), tabs, aria labels, titles, editor inputs and the editor's syntax hint
stay plain. `renderIdent(id, 'latex')` writes a digit suffix as a subscript (D1 → D_1, A10 → A_{10},
MD1 → \mathit{MD}_1; N_S1 stays N_{\mathit{S1}}), and `do` as `\operatorname{do}`; SVG labels and exported
images lower the same digit on identifiers only (not the watermark or citations). The two hint lines under
the graph are gone; the observe-versus-intervene ⓘ moved into the node menu. The zh UI says 變數
(外生變數、內生變數) as the lessons do, not 變項.

## 0.9.3
A marked edge's tip names the d-separation paths through it and says why each is open or blocked, in the
lessons' words: 「路徑 S → W ← R 在 W 被堵住。W 是對撞點，W 和它的後代 F 都未知。」, 「路徑 S ← C → R
在 C 被堵住。C 是叉的中間點，已知。」, or 「路徑 S → W ← R 暢通。對撞點 W 的後代 F 已知。」 (en twins). It names
at most two paths, then 「等 n 條」. A cut edge's tip names the arrow (「do() 剪掉了 S → W」). An exogenous
node that can only be observed says so in its hint and menu name (no "or intervene"); a menu names only the
actions it offers. A slider on a variable with named values says which value it moves (「選擇傾向的機率（D=one）」),
and the menu's random-intervention slider reads 「隨機干預：把 W 設成 1 的機率」 instead of `P*(W=1)`.
`DPath` gains `descendants` on a path blocked by a collider.

## 0.9.2
The `sliders` list moved off the page into a tab 「機率」 (en "Probabilities") in the row under the graph,
closed at first, with every slider grouped by node and its own 「回到原本的機率」, which puts only the
sliders back (the header's one still resets everything, and now also shows when only a slider moved). A node's menu lists its own sliders as before
and, once one of them moved, 「這個節點回到原本的機率」 for just those. The engine test of the
`actualCause` work budget checks the budget's error and limit instead of the time it took (#1).

## 0.9.1
A tap on a marked edge keeps its explanation open (the press's focus no longer opened it and the click
closed it again), and a mouse click on a hovered edge keeps it. A press on a node of another graph on the
page closes this graph's menu; Esc pressed in another control keeps that control's focus; a menu whose
node is hidden does not come back by itself when the node is drawn again.

## 0.9.0
One gesture for every graph: a click (or Enter, Space) on a node opens its menu beside it. The menu says
what the node's marks mean now (fill height = P(=1), double ring = observed, red clamp = do(), red outer
ring = an end of the d-separation pair, dashed ring = exogenous), observes it at each value or no longer
(probability graphs; 實際（證據） under 反事實), sets do() at each value or releases it (假設干預 under
反事實), with the P*(X=1) slider for a stochastic do() on a boolean node, and lists the node's own
probability sliders. A graph with one set of values gets the same menu with do() only and the line
「所有值都已知，觀察不會改變任何值」. Long press, right-click and Shift+click no longer do anything: the
browser keeps its menu, and a long press on the graph selects no text and opens no callout. Esc, the ×,
a second click on the node or a press outside closes the menu.

`sliders` sit under one heading per node they move (`S 灑水器開著` over `N_S1`, `N_S0`); hovering or
focusing a node lights its rows, and a row lights its node. Edges on a d-separation path or cut by
do() explain themselves on hover, keyboard focus or a tap (紅色粗線 open, 虛線 blocked, 灰色虛線加斜槓 cut).

## 0.8.3
A step button stays pressed while everything it set still holds: after `第 2 步：已知 Z`, observing or
setting another node keeps step 2 lit (before, any extra click unpressed it, which read as if Z were no longer
known). Of the steps that still hold, the one that sets the most is the one pressed.

## 0.8.2
The zh path wording follows the lessons: an unblocked path reads `暢通` instead of `通` (d-separation
verdicts, back-door lines, the adjustment tip), and a known collider reads `已知 C 讓 X→C←Y 暢通`.

## 0.8.1
Clearer numbers in the probability graph. A node nobody has set reads `P(=1) 0.80` (the second line `原本 0.50`
stays), an observed node reads `已知 = 1` (`observed = 1`) and an intervened one `do = 1`, both without the 原本
line; the fill height is still P(=1). The tab `d-分離` is now `d 分隔`, and the interventional reading hint shows
only while an intervention is set.

## 0.8.0
The component explorer. The demo site gets a Storybook-style page, `#/explorer`, first in its header: pick a
component (`CausalPlayground`, `ProbabilityPanel` with its six views, `WorldLanes`, `CasePage`, `ModelEditor`,
`CiteBlock`) and a ready-made figure (one per figure of the lesson interaction page), pick a model (the 41
lesson models or the 45 bundled cases, searchable and grouped; `ModelEditor` also takes the blank model), edit
the component's props with generated controls (forms for the common props, JSON fields for the complex ones;
a control a model cannot use is disabled with its reason), and watch the figure re-render. A prop combination
the component rejects shows its message and `problem.code` in place of the figure. Two tabs under the figure
give the JSX for package users and the MDX tag for the blog (`CausalModel id=…` for a lesson model), each with a
copy button, and 「複製連結」 copies the address. The whole state (component, story, model, the props that differ
from the story's, language, theme) lives in the hash, so a pasted link restores the same figure; edits replace
the history entry, picking a component or model adds one. The demo is built with a relative base and a
`pages.yml` workflow deploys it to GitHub Pages when a `v*` tag is pushed (Pages must be enabled once under
Settings > Pages > Source: GitHub Actions). The library is unchanged: no component, engine or data file
differs from 0.7.0.

## 0.7.0
Responsibility, blame and mediation. Engine: `responsibility(model, context, query, theory)` is the degree
of responsibility 1/k of a single event X=x (Halpern 2016, Def. 6.1.1 and 6.1.6; k is the variables in the
cause plus the ones the witness holds, held variables need not change value, Ex. 6.1.4); its verdict is
`actualCause`'s. `blame(model, prior, query, theory)` is the expected degree of responsibility over an
epistemic state (Def. 6.2.1), with an optional `given` observation. `mediation(model, prior, query)` gives
TE, NDE, NIE, IE(reverse), the controlled direct effects and, with `formula`, the mediation formula
(Pearl 2009, 4.11-4.18). The `theory` parameter of `responsibility` and `blame` is the exported
`ResponsibilityTheory` (the HP definitions; but-for is a type error, and still a `responsibility-butfor`
ModelError for JS callers). Under hp-original `responsibility` returns not-cause as soon as X=x alone has
no witness (Halpern Thm 2.2.3(d)). Components: `responsibility` on the verdict rows of `CausalPlayground`,
a `blame` prop and tab (`BlameSpec`, `BlameState`; an empty `theories` throws `blame-no-theories`), and a
`mediation` view in `ProbabilityPanel` (`MediationSpec`). Nine new problem codes widen
`ProblemWording.messages`, so a third-party wording table needs them. Existing markup and every existing
figure are unchanged; the new props are opt-in.

## 0.6.0
Node precision. `CausalPlayground`, `ProbabilityPanel`, `CasePage` and `ModelEditor` take an optional
`digits`: a whole number from 1 to 6 (default 2, which is today's output exactly) for the decimals of
the probability under each node. A lesson that quotes 0.175 sets `digits={3}` and the node reads 0.175,
not 0.18. It applies to the number under each node, a stochastic do()'s tag beside a node
(`P(S=1)=0.3500`), the top value of a multi-valued node's bars (`最高 0.5000`) and the bar tooltips,
the aria text of a node, the 原本 and 實際 notes under a node, and, in the `compare` view, the two
result numbers that sit beside the graphs (and the numbers in their export footers). Equation rows,
tables, verdicts, the counterfactual result and its backgrounds table, the sliders' own readout and the
chips' `do(P(S=1)=0.35)` keep their own precision. A number within 10^-`digits` of 0 or 1 still gets
two significant digits of its distance from that end (at `digits={4}`, 0.000012 reads 0.000012, not
0.0000). The readout slot under a node is as wide as the digits need, and the layout moves a block
above its node, as before, when the wider one would touch an edge or the graph's side; checked at
390 px with 4 digits. An invalid `digits` (not an integer, below 1, above 6) throws. The export draws
with the same digits, in either language; the embed code does not record it. `WorldLanes` shows no
probabilities and takes no `digits`. The demo reads `?digits=4` from the page's query string. The
markup baseline is unchanged. New: `shared/digits.ts` (`DigitsScope`, `useDigits`, `checkDigits`).

## 0.5.0
Graph first. The blocks stacked under a figure's graph (the equations, the verdicts, the strata and
background tables, the expected-utility bars, the d-separation paths) now sit behind one row of tab
buttons under the graph: a click opens a block, another click on the open tab closes it, and only one
is open at a time. The figure's own block is open at first (verdicts in `CausalPlayground` with
`verdicts`, expected utility with `decision`, paths with `dsep`, the strata table in the adjustment
view, the backgrounds table in the counterfactual view) and the equations are closed; a figure with
only the equations has one 「式子」 tab, closed. This is derived from the props, so no lesson needs a
new prop. It applies to `CausalPlayground`, `CasePage`, and `ProbabilityPanel` (`sliders`,
`compare`, `adjust`, `counterfactual`); `WorldLanes` keeps its 「看式子」 button in the foot. A closed
block stays in the page (`hidden`), so page search and screen readers still reach it; the tabs are
buttons with `aria-expanded` and `aria-controls`. The step and preset buttons, the hint, the trail,
the 視角 switch, the export menu, the sliders, the verdict line of the adjustment view and the
counterfactual result stay where they were. The `ModelEditor` keeps its equations box open. The
open tab is not part of the embed code or the address: an embed page starts with the figure's own
block open. The compare view's 「式子和機率」 fold is the same tab. Equations moved from their own box
into the graph's box, so `.ca-eq-box` no longer wraps them in these views. Interface text gains
`tabsLabel` and `tab` (`verdicts`, `dsep`, `strata`, `background`) in both languages. The type check
now keeps `src/data/node-shim.d.ts` (Node's `fs` and `crypto` for tests) away from browser code
(`tsconfig.test.json`), and the interface-text test lists the four string-table files instead of
skipping `i18n/`.

## 0.4.3
Internal restructuring, no change in behavior or API: the component sources sit in feature folders
(`case/`, `playground/`, `probability/`, `lanes/`, `editor/`, `graph/`, `panels/`, `model/`,
`export/`, `text/`, `i18n/`, `shared/`), the interface text in one file per language (`i18n/zh.ts`,
`i18n/en.ts`), and the signal graph's layout is a pure function with its own tests. A markup
baseline of every component (`src/components/golden/`) checks that a refactor leaves what is drawn
unchanged.

## 0.4.2
The reading switch is labelled 「視角」 (en "View") and shows one line under it for the chosen reading: 干預 「點選的是干預之後看到的結果」, 反事實 「點選的是實際發生過的事，再問：假如當初……會怎樣」.

## 0.4.1
The playground reading switch reads 「干預｜反事實」 (en "Intervention | Counterfactual").

## 0.4.0
Seven interactions for the lessons, with the 0.3.15 fixes. Step buttons: `presets` take `observed` and
`hold` as well as do(), sit inside the figure's frame, and show which one is set. On a probability
graph a mouse right-click intervenes like a long press; the hint under the graph is one line with its
details in a tooltip (one tooltip for every longer explanation: hover, keyboard focus or a tap).
Every probability graph keeps 原本 v under each number that moved, and `track` follows chosen nodes
through the reader's settings; the compare panel takes several `pair`s with a value switch.
`ProbabilityPanel view="counterfactual"` walks abduction, action and prediction with the table of
backgrounds; a probability playground can switch its reading to 反事實, where a click is evidence
about the actual world and the intervention a supposed one. `verdicts` puts a row of verdicts under a
graph with values, loads each witness onto it, and says whether the world on the graph is a witness
(`witnessStatus` in the engine); held variables say 固定為 w（實際 v）. A model's defaults show as
偏離（預設 v） and a line comparing deviations; `dsep` lights the paths between a pair and gives
lesson 04's dependence δ (`dSeparation`, `dependence` in the engine). See the playground and
probability panel notes under Package for each prop.

Exogenous nodes are drawn as dashed circles: the ring is always hollow, a value of 1 is a filled disc
inside it, and a probability graph fills inside the ring. The dashes are whole dashes round the circle
and the ring keeps the text colour, so it differs from a cut edge (grey, straight, with 切斷), the
witness hull (amber) and the focus ring; image exports carry it in both styles. A model document or
case file may also name `latent_as_arcs: ["U"]`: exogenous variables with two or more children that
are not drawn as nodes but as Pearl's bidirected arc, a dashed curve with a head at each end between
their children (one arc per pair of children when there are three or more), labelled 不明共因
with the explanation in a tooltip. The arc is not a control and U cannot be observed; do() or a
stochastic do() on either end removes the arc, as in the graph with the arrows into that child cut.
U stays in the model, so d-separation, counterfactuals and witnesses are unchanged, and a
d-separation path through U lights the arc. A variable that is also in `show_exogenous` or the
`layout`, or that has fewer than two children, is refused. Without the field U is drawn as a node,
as before. The do() note names the cut parents in the order of the equation (`A = C or W`: 切斷
C、W).

Six more interactions. The 干預式 notation lists only the rows that can hold under what is set, each
naming only the parents that decide the value (bow A under do(X=1): 5 rows instead of 40; a graph
with values keeps the actual world's row of each variable), with the full truth table behind an
expander; 複製 LaTeX copies the rows shown (`causalRows` in the engine). The playground takes
`sliders`, `prior` and `decision` (expected-utility bars), the probability panel `view="adjust"`
(the adjustment formula with the back-door verdict) and `view="rules"` (do-calculus steps on their cut
graphs; `dSeparation` takes a sixth argument `cutOut`, and `descendants` is exported). The editor
lists the blank model first, keeps the graph in view on a wide layout, recomputes the case's verdicts
on the edited model (the column reads 你的模型) and takes guided `tasks`. Details under Package.

It also carries the fixes prepared as 0.3.15, never published on their own: fixes from a classroom
test of the lessons. Automatic layout no longer runs an edge under a node it does not join (the sprinkler's R→W, the back-door and front-door graphs): a node in the way steps half a row aside, each node sits at the mean row of its parents, and 切斷 is placed off the edges still drawn; two bundled layouts (train switching, trumping) moved for the same reason. On a graph with values, a click pins the value a node shows under the other do()s, then the other value, then releases, so do(C=0) followed by B can reach B=0. A click observes a multi-valued node too (each value in turn, then released). Exogenous nodes are the context: they can be observed, never set by do() (and the pen-fiasco preset that set `U_N` is gone). The case page works its probability and decision verdicts out at the current sliders. Numbers round halves away from zero (0.175 → 0.18). The equations panel lists every endogenous equation (`Y = U2`); `show_exogenous` in a case file or model document names exogenous variables to draw without a layout, and do() then names every drawn parent it cuts. A witness lane says whether each held variable keeps its actual value or another one. The do() popover closes when what it sets is reset from the keyboard, and avoids the other nodes; header chips and footer controls no longer break mid-word on narrow screens. Normality wording: a witness that deviates where the actual world does not, and the other way round, is incomparable with it, so not at least as normal (gardener and Queen, the pen cases, red light, antidote); the sharks source note cites what Halpern's pp. 82 and 91 say.

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

See [Package](docs/components.md#package) for server rendering and case loading.
