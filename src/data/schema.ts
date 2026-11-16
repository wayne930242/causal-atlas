import { z } from 'zod'

/**
 * JSON schema for case files in src/data/cases/. Values for boolean variables may be written
 * as 1/0 or true/false. Equations use the compact syntax of src/engine/parse.ts, or an explicit
 * table `{ "table": { "inputs": [...], "rows": [[...inputs, value]], "default"?: value } }`.
 */

const identifier = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'must be an identifier')

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
  domain: z.union([z.literal('boolean'), z.array(z.union([z.number(), z.string()])).min(1)]),
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
  variables: z.array(variableSchema).min(1),
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
  theory: z.enum(['butfor', 'hp-modified', 'hp-normality']),
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

export const caseSchema = z
  .strictObject({
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must be kebab-case'),
    title: localizedSchema,
    family: familySchema,
    /** Traditional Chinese paraphrase of the story. */
    story_zh: z.string().min(1),
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
  })
  .superRefine((c, ctx) => {
    c.verdicts.forEach((v, i) => {
      const path = ['verdicts', i]
      const needs = (ok: boolean, message: string): void => {
        if (!ok) ctx.addIssue({ code: 'custom', path, message })
      }
      switch (v.theory) {
        case 'butfor':
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

export type CaseFile = z.infer<typeof caseSchema>
export type CaseVerdict = z.infer<typeof verdictSchema>
export type CaseFamily = z.infer<typeof familySchema>
export type CaseTheory = CaseVerdict['theory']
