import { z } from 'zod'
import { isReservedName } from '../engine/values.ts'

/**
 * JSON schema for case files in src/data/cases/. Values for boolean variables may be written
 * as 1/0 or true/false. Equations use the compact syntax of src/engine/parse.ts, or an explicit
 * table `{ "table": { "inputs": [...], "rows": [[...inputs, value]], "default"?: value } }`.
 */

/** The most variables a model may have; the engine's searches grow exponentially in it. */
export const MAX_VARIABLES = 40

/** The most values a finite domain may list. */
export const MAX_DOMAIN_VALUES = 32

/** An identifier that is neither an equation keyword nor a name `{}` already has (`toString`, `__proto__`, …). */
const identifier = z
  .string()
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'must be an identifier')
  .refine((id) => !isReservedName(id), { message: 'is a reserved name' })

export const localizedSchema = z.strictObject({
  zh: z.string().min(1),
  en: z.string().min(1),
})

export const valueSchema = z.union([z.boolean(), z.number(), z.string()])

export const variableSchema = z.strictObject({
  id: identifier,
  label: localizedSchema,
  kind: z.enum(['exogenous', 'endogenous']),
  /** `"boolean"` or the finite list of values. */
  domain: z.union([z.literal('boolean'), z.array(z.union([z.number(), z.string()])).min(1).max(MAX_DOMAIN_VALUES)]),
})

export const tableEquationSchema = z.strictObject({
  table: z.strictObject({
    inputs: z.array(identifier).min(1),
    /** Each row lists one value per input, then the output value. */
    rows: z.array(z.array(valueSchema).min(2)).min(1),
    default: valueSchema.optional(),
  }),
})

export const modelSchema = z.strictObject({
  variables: z.array(variableSchema).min(1).max(MAX_VARIABLES),
  equations: z.record(identifier, z.union([z.string().min(1), tableEquationSchema])),
})

const assignmentSchema = z.record(identifier, valueSchema)

/** Independent marginals (a number is P(var=1) for a boolean variable), or a joint table. */
export const priorsSchema = z.union([
  z.strictObject({
    independent: z.record(identifier, z.union([z.number(), z.array(z.tuple([valueSchema, z.number()])).min(1)])),
  }),
  z.strictObject({
    joint: z.strictObject({
      variables: z.array(identifier).min(1),
      /** Each row lists one value per variable, then the probability. */
      rows: z.array(z.array(valueSchema).min(2)).min(1),
    }),
  }),
])

export const sourceSchema = z.strictObject({
  citation: z.string().min(1),
  key: z.string().optional(),
  /** origin: where the case comes from; treatment: a structural-model analysis of it; reference: an encyclopedia entry or survey. */
  role: z.enum(['origin', 'treatment', 'reference']),
  note: z.string().min(1).optional(),
  pages: z.string().optional(),
  /** True only once someone has checked the citation and pages against the source. */
  verified: z.boolean(),
})

export const decisionSchema = z.strictObject({
  variable: identifier,
  acts: z.array(valueSchema).min(1).optional(),
  utility: z.strictObject({
    variables: z.array(identifier).min(1),
    /** Each row lists one value per outcome variable, then the utility. */
    rows: z.array(z.array(valueSchema).min(2)).min(1),
  }),
})

const actualVerdictSchema = z.strictObject({
  theory: z.enum(['butfor', 'hp-original', 'hp-updated', 'hp-modified', 'hp-normality']),
  query: z.strictObject({
    /** Conjunction of events, e.g. `L=1 and MD=1`. */
    cause: z.string().min(1),
    /** Effect formula, e.g. `BS=1`. */
    effect: z.string().min(1),
  }),
  expected: z.enum(['cause', 'part-of-cause', 'not-cause']),
  note: z.string().optional(),
})

const probabilityVerdictSchema = z.strictObject({
  theory: z.literal('probability'),
  query: z.strictObject({
    event: z.string().min(1),
    given: z.string().min(1).optional(),
    do: assignmentSchema.optional(),
  }),
  expected: z.number(),
  tolerance: z.number().positive().optional(),
  note: z.string().optional(),
})

const counterfactualVerdictSchema = z.strictObject({
  theory: z.literal('counterfactual'),
  query: z.strictObject({
    evidence: z.string().min(1).optional(),
    do: assignmentSchema,
    event: z.string().min(1),
  }),
  /** P(event in the counterfactual world | evidence). */
  expected: z.number(),
  tolerance: z.number().positive().optional(),
  note: z.string().optional(),
})

const decisionVerdictSchema = z.strictObject({
  theory: z.enum(['edt', 'cdt']),
  /** `{ "choice": <decision variable> }` expects the best act; `{ "expectedUtility": <act> }` expects a number. */
  query: z.union([z.strictObject({ choice: identifier }), z.strictObject({ expectedUtility: valueSchema })]),
  expected: valueSchema,
  tolerance: z.number().positive().optional(),
  note: z.string().optional(),
})

export const verdictSchema = z.discriminatedUnion('theory', [
  actualVerdictSchema,
  probabilityVerdictSchema,
  counterfactualVerdictSchema,
  decisionVerdictSchema,
])

export const familySchema = z.enum(['actual', 'omission', 'norms', 'law', 'decision'])

export const showcaseSchema = z.strictObject({
  label: localizedSchema,
  interventions: assignmentSchema,
})

/**
 * Graph positions as `[column, row]` in grid units (fractions allowed). When present, only the
 * listed variables are drawn; without it the UI picks the variables and lays them out in layers.
 */
export const layoutSchema = z.record(identifier, z.tuple([z.number(), z.number()]))

/** A sentence of `story_zh` and the variables it introduces; the page tags the sentence with their ids. */
export const storyTagSchema = z.strictObject({
  sentence: z.string().min(1),
  variables: z.array(identifier).min(1),
})

const actualTheorySchema = z.enum(['butfor', 'hp-original', 'hp-updated', 'hp-modified', 'hp-normality'])

/**
 * The everyday judgment about one query, and which theories in `verdicts` reach it. For an
 * actual-cause query `agree` lists the theories whose verdict equals `expected`; for a decision
 * (`{ choice }`) it lists edt and/or cdt.
 */
export const intuitionSchema = z.union([
  z.strictObject({
    query: z.strictObject({ cause: z.string().min(1), effect: z.string().min(1) }),
    expected: z.enum(['cause', 'part-of-cause', 'not-cause']),
    /** One short sentence: why people judge it so. */
    text: z.string().min(1),
    agree: z.array(actualTheorySchema),
  }),
  z.strictObject({
    query: z.strictObject({ choice: identifier }),
    expected: valueSchema,
    text: z.string().min(1),
    agree: z.array(z.enum(['edt', 'cdt'])),
  }),
])

export const caseSchema = z
  .strictObject({
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must be kebab-case'),
    title: localizedSchema,
    /** One line under the title. */
    subtitle: z.string().min(1).optional(),
    family: familySchema,
    /** Traditional Chinese paraphrase of the story. */
    story_zh: z.string().min(1),
    story_tags: z.array(storyTagSchema).optional(),
    intuition: intuitionSchema.optional(),
    /** What the model encodes and why these variables and equations. */
    explanation_zh: z.string().min(1),
    sources: z.array(sourceSchema).min(1),
    model: modelSchema,
    /** The actual context u (values of exogenous variables). */
    context: assignmentSchema.optional(),
    /** Prior over exogenous variables; when absent, probabilistic queries use a point mass on `context`. */
    priors: priorsSchema.optional(),
    /** Default (normal) value per variable, for `hp-normality`. */
    normality: assignmentSchema.optional(),
    decision: decisionSchema.optional(),
    verdicts: z.array(verdictSchema).min(1),
    showcase: z.array(showcaseSchema),
    layout: layoutSchema.optional(),
  })
  .superRefine((c, ctx) => {
    if (c.layout !== undefined) {
      const ids = new Set(c.model.variables.map((v) => v.id))
      for (const id of Object.keys(c.layout)) {
        if (!ids.has(id)) ctx.addIssue({ code: 'custom', path: ['layout', id], message: `unknown variable ${id}` })
      }
    }
    const variableIds = new Set(c.model.variables.map((v) => v.id))
    c.story_tags?.forEach((t, i) => {
      if (!c.story_zh.includes(t.sentence)) {
        ctx.addIssue({ code: 'custom', path: ['story_tags', i, 'sentence'], message: 'sentence not found in story_zh' })
      }
      for (const id of t.variables) {
        if (!variableIds.has(id)) ctx.addIssue({ code: 'custom', path: ['story_tags', i, 'variables'], message: `unknown variable ${id}` })
      }
    })
    if (c.intuition !== undefined) {
      const q = c.intuition.query
      const listed = c.verdicts.some((v) =>
        'choice' in q
          ? (v.theory === 'edt' || v.theory === 'cdt') && 'choice' in v.query && v.query.choice === q.choice
          : 'cause' in v.query && v.query.cause === q.cause && v.query.effect === q.effect,
      )
      if (!listed) ctx.addIssue({ code: 'custom', path: ['intuition', 'query'], message: 'no verdict asks this query' })
    }
    if (!c.sources.some((s) => s.role === 'origin')) {
      ctx.addIssue({ code: 'custom', path: ['sources'], message: 'needs at least one source with role origin' })
    }
    c.verdicts.forEach((v, i) => {
      const path = ['verdicts', i]
      const needs = (ok: boolean, message: string): void => {
        if (!ok) ctx.addIssue({ code: 'custom', path, message })
      }
      switch (v.theory) {
        case 'butfor':
        case 'hp-original':
        case 'hp-updated':
        case 'hp-modified':
          needs(c.context !== undefined, `${v.theory} needs a context`)
          return
        case 'hp-normality':
          needs(c.context !== undefined, 'hp-normality needs a context')
          needs(c.normality !== undefined, 'hp-normality needs normality defaults')
          return
        case 'probability':
        case 'counterfactual':
          needs(c.priors !== undefined || c.context !== undefined, `${v.theory} needs priors or a context`)
          return
        case 'edt':
        case 'cdt':
          needs(c.decision !== undefined, `${v.theory} needs a decision`)
          needs(c.priors !== undefined || c.context !== undefined, `${v.theory} needs priors or a context`)
          if ('expectedUtility' in v.query) needs(typeof v.expected === 'number', 'expectedUtility expects a number')
          if ('choice' in v.query) needs(v.query.choice === c.decision?.variable, 'choice must name the decision variable')
          return
      }
    })
  })

/**
 * A model someone built in the editor: the case file's model part without the story, sources or
 * verdicts. Shared as JSON and, compressed, in a URL hash. `context` makes it a model with one
 * actual world; `priors` without `context` makes it probabilistic.
 */
export const MODEL_DOC_FORMAT = 'causal-atlas/model'

export const modelDocSchema = z
  .strictObject({
    format: z.literal(MODEL_DOC_FORMAT),
    version: z.literal(1),
    title: z.string().min(1),
    /** The bundled case it started from, if any. */
    from: z.string().optional(),
    model: modelSchema,
    context: assignmentSchema.optional(),
    priors: priorsSchema.optional(),
    normality: assignmentSchema.optional(),
    layout: layoutSchema.optional(),
  })
  .superRefine((d, ctx) => {
    const kinds = new Map(d.model.variables.map((v) => [v.id, v.kind]))
    const known = (where: string, ids: readonly string[], exogenousOnly: boolean): void => {
      for (const id of ids) {
        const kind = kinds.get(id)
        if (kind === undefined) ctx.addIssue({ code: 'custom', path: [where, id], message: `unknown variable ${id}` })
        else if (exogenousOnly && kind !== 'exogenous') {
          ctx.addIssue({ code: 'custom', path: [where, id], message: `${id} is not exogenous` })
        }
      }
    }
    known('layout', Object.keys(d.layout ?? {}), false)
    known('normality', Object.keys(d.normality ?? {}), false)
    known('context', Object.keys(d.context ?? {}), true)
    if (d.priors !== undefined) {
      known('priors', 'independent' in d.priors ? Object.keys(d.priors.independent) : d.priors.joint.variables, true)
    }
    if (d.context === undefined && d.priors === undefined) {
      ctx.addIssue({ code: 'custom', path: ['context'], message: 'needs a context or priors' })
    }
  })

export type ModelDoc = z.infer<typeof modelDocSchema>

export type CaseFile = z.infer<typeof caseSchema>
export type CaseVerdict = z.infer<typeof verdictSchema>
export type CaseFamily = z.infer<typeof familySchema>
export type CaseTheory = CaseVerdict['theory']
