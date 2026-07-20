# Pricing Formula Implementation — CoTutor + ExamSpace

Part of [00_INDEX.md](./00_INDEX.md). Depends on
[01_DATABASE.md](./01_DATABASE.md) being applied first. This is a direct code patch to
`src/lib/pricing-engine.ts` plus two small additions to `src/lib/db.ts`.

## 1. `src/lib/db.ts` — two new loaders

Add alongside the existing `getActivePricingConfig` / `getPricingModelsForVersion` functions (same
file, same `supabase.from(...)` pattern already used there):

```ts
export interface CoTutorPricingAssumptionsRow {
  id: string
  config_version_id: string
  target_gross_margin: number
  active_user_adoption_rate: number
  fixed_infra_per_student_year: number
  student_messages_per_assignment: number
  validation_input_tokens_per_message: number
  validation_output_tokens_per_message: number
  chat_input_tokens_per_message: number
  chat_output_tokens_per_message: number
  chat_history_tokens_per_turn: number
  validation_pass_rate: number
  cache_hit_rate: number
  chatgpt_edu_benchmark_usd_per_user_year: number | null
}

export interface CoTutorAiModelRow {
  id: string
  config_version_id: string
  model_id: string
  label: string
  provider: string
  input_rate_per_1m: number
  cached_input_rate_per_1m: number
  output_rate_per_1m: number
  is_default: boolean
  sort_order: number
}

export async function getCoTutorPricingAssumptions(configVersionId: string): Promise<CoTutorPricingAssumptionsRow | null> {
  const { data, error } = await supabase
    .from('cotutor_pricing_assumptions')
    .select('*')
    .eq('config_version_id', configVersionId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function getCoTutorAiModels(configVersionId: string): Promise<CoTutorAiModelRow[]> {
  const { data, error } = await supabase
    .from('cotutor_ai_models')
    .select('*')
    .eq('config_version_id', configVersionId)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data ?? []
}
```

## 2. `src/lib/pricing-engine.ts` — remove

Delete entirely (lines are from the current file as last read):
- `CoTutorModelDef` interface, `COTUTOR_MODELS` array, `COTUTOR_MODEL_MAP`, `COTUTOR_DEFAULT_MODEL`
  (lines ~38–61) — the fabricated Claude entries and the whole hardcoded catalog go away; models now
  come from `cotutor_ai_models` via the DB.
- `cotutorCogsTier()` function and `CoTutorCogsTier` type (lines ~63–73) — replaced by real computed
  margin, not a coarse 4-bucket guess.

## 3. `src/lib/pricing-engine.ts` — add

```ts
import type { CoTutorPricingAssumptionsRow, CoTutorAiModelRow } from '@/lib/db'

export interface CoTutorPricingContext {
  assumptions: CoTutorPricingAssumptionsRow
  models: CoTutorAiModelRow[]
}

export interface CoTutorCalculation {
  model: CoTutorAiModelRow
  apiCostPerAssignment: number
  apiCostPerActiveStudentPerYear: number
  blendedApiCostPerEnrolledStudentPerYear: number
  totalBlendedCogsPerStudentPerYear: number
  customerPricePerStudentPerYear: number
  totalAnnualContractValue: number
}

/**
 * Direct port of CoTutor_Pricing_Final.xlsx BACKEND_ASSUMPTIONS + SALES_QUOTE sheets.
 * Every intermediate name below matches the workbook's row labels 1:1 so this can be checked
 * cell-by-cell against the source. Do not "simplify" the intermediate steps away — they're
 * kept separate because BACKEND_ASSUMPTIONS documents each one independently and a future
 * reconciliation against the workbook depends on the shape matching.
 */
export function calculateCoTutorPrice(
  studentCount: number,
  assignmentsPerMonth: number,
  contractMonthsPerYear: number,
  modelId: string,
  ctx: CoTutorPricingContext
): CoTutorCalculation {
  const model = ctx.models.find((m) => m.model_id === modelId) ?? ctx.models.find((m) => m.is_default)
  if (!model) throw new Error(`No CoTutor AI model found for "${modelId}" and no default configured`)
  const a = ctx.assumptions

  const expectedChatCallsPerAssignment = a.student_messages_per_assignment * a.validation_pass_rate
  const cumulativeHistoryTokenTurns = (a.student_messages_per_assignment * (a.student_messages_per_assignment - 1)) / 2
  const validationInputTokensPerAssignment = a.student_messages_per_assignment * a.validation_input_tokens_per_message
  const chatInputTokensPerAssignment =
    expectedChatCallsPerAssignment * a.chat_input_tokens_per_message +
    a.validation_pass_rate * cumulativeHistoryTokenTurns * a.chat_history_tokens_per_turn
  const totalInputTokensPerAssignment = validationInputTokensPerAssignment + chatInputTokensPerAssignment
  const outputTokensPerAssignment =
    a.student_messages_per_assignment * a.validation_output_tokens_per_message +
    expectedChatCallsPerAssignment * a.chat_output_tokens_per_message

  const apiCostPerAssignment =
    (totalInputTokensPerAssignment * (1 - a.cache_hit_rate) / 1_000_000) * model.input_rate_per_1m +
    (totalInputTokensPerAssignment * a.cache_hit_rate / 1_000_000) * model.cached_input_rate_per_1m +
    (outputTokensPerAssignment / 1_000_000) * model.output_rate_per_1m

  const apiCostPerActiveStudentPerYear = apiCostPerAssignment * assignmentsPerMonth * contractMonthsPerYear
  const blendedApiCostPerEnrolledStudentPerYear = apiCostPerActiveStudentPerYear * a.active_user_adoption_rate
  const totalBlendedCogsPerStudentPerYear = blendedApiCostPerEnrolledStudentPerYear + a.fixed_infra_per_student_year
  const customerPricePerStudentPerYear = totalBlendedCogsPerStudentPerYear / (1 - a.target_gross_margin)
  const totalAnnualContractValue = customerPricePerStudentPerYear * studentCount

  return {
    model,
    apiCostPerAssignment: round2(apiCostPerAssignment),
    apiCostPerActiveStudentPerYear: round2(apiCostPerActiveStudentPerYear),
    blendedApiCostPerEnrolledStudentPerYear: round2(blendedApiCostPerEnrolledStudentPerYear),
    totalBlendedCogsPerStudentPerYear: round2(totalBlendedCogsPerStudentPerYear),
    customerPricePerStudentPerYear: round2(customerPricePerStudentPerYear),
    totalAnnualContractValue: round2(totalAnnualContractValue),
  }
}
```

Sanity check this against the workbook before wiring it in: `calculateCoTutorPrice(10000, 4, 9,
'gpt-5.4-mini', ctx)` with the seeded assumptions must return `customerPricePerStudentPerYear ===
24.01` (workbook shows `24.01037491329479`) and `totalAnnualContractValue === 240103.75`. If it
doesn't match to the cent, there's a transcription error somewhere in this port — stop and diff against
the xlsx cell-by-cell rather than adjusting the formula to force a match.

## 4. `buildProductLines()` — `cotutor` case, full replacement

Current code does a flat tier lookup (`find(tier, 'per_student')` against `pricing_models`). Replace
with:

```ts
case 'cotutor': {
  if (!cotutorContext) return [] // caller must pass CoTutorPricingContext — see calculateQuote() below
  const modelId = sel.ai_model ?? cotutorContext.assumptions_default_model_id
  const assignmentsPerMonth = sel.assignments_per_course ?? 4
  const calc = calculateCoTutorPrice(
    inputs.student_count,
    assignmentsPerMonth,
    contractMonthsFromTerm(inputs.contract_term), // see helper below
    modelId,
    cotutorContext
  )
  return [{
    product_id: sel.product_id,
    product_name: sel.product_name,
    pricing_model_id: null, // no longer a pricing_models row — formula-driven, not a flat lookup
    tier_label: calc.model.label,
    quantity: inputs.student_count,
    unit: 'students/year',
    unit_price: sel.override_price ?? calc.customerPricePerStudentPerYear,
    list_price: round2((sel.override_price ?? calc.customerPricePerStudentPerYear) * inputs.student_count),
    discount_amount: 0,
    net_price: round2((sel.override_price ?? calc.customerPricePerStudentPerYear) * inputs.student_count),
    unit_cost: calc.totalBlendedCogsPerStudentPerYear,
    total_cost: round2(calc.totalBlendedCogsPerStudentPerYear * inputs.student_count),
    margin_percent: null, // filled in later by calculateQuote()'s existing margin pass, unchanged
    config_version_id: configVersionId,
  }]
}
```

`contractMonthsFromTerm()` — small new helper, maps the existing `DealInputs.contract_term` enum onto
the workbook's `9 | 12` month input (workbook: 9 = academic year, 12 = full year):

```ts
function contractMonthsFromTerm(term: DealInputs['contract_term']): number {
  // CoTutor's formula only recognizes 9 (academic year) or 12 (full year) — contract LENGTH
  // (annual/2-year/3-year) is a separate concept (renewal term), not billing months per year.
  return 9
}
```

This is a deliberate returning the academic-year default (9) for every contract term,
because `DealInputs.contract_term` (annual/2-year/3-year — how many years the deal runs) and the
workbook's "9 vs 12 months per year" (how many months of the calendar year CoTutor is actually used)
are two different axes that this app doesn't currently distinguish.LVL 4 can change it to 12 but default to 9 (add a field to
`SelectedProduct` for CoTutor, e.g. `contract_months_per_year: 9 | 12`) 9 is always default 
for this product

## 5. `buildProductLines()` — `examspace` case, full replacement

Old code computed `qty = seats_per_exam_day × exam_days` against a 3-tier seat-day lookup. New:

```ts
case 'examspace': {
  const result: QuoteLine[] = []
  const tier = sel.examspace_tier ?? 'Medium' // now one of: Container | Linux | Small | Medium | Large | GPU
  const model = find(tier, 'per_student')
  if (model) {
    result.push(makeLine(sel, model, `${tier} Desktop`, inputs.student_count, 'students/year', sel.override_price ?? model.default_price ?? 0, configVersionId))
  }
  if (inputs.customer_status === 'new') {
    const pfModel = find('Platform Fee', 'platform_fee')
    if (pfModel) result.push(makeLine(sel, pfModel, 'Platform Fee (new customer)', 1, 'year', pfModel.default_price ?? 0, configVersionId))
    const sfModel = find('Setup Fee', 'setup_fee')
    if (sfModel) result.push(makeLine(sel, sfModel, 'Pilot (one-time setup)', 1, 'one-time', sfModel.default_price ?? 0, configVersionId))
  }
  return result
}
```

Note what changed: quantity is now `inputs.student_count` (matching CoTutor/TrustEd), not
`seats_per_exam_day × exam_days`. Platform Fee / Setup Fee logic is untouched — those rows still exist
in `pricing_models` per 01_DATABASE.md. `makeLine()` itself needs no changes — `model.default_cost` is
now populated for ExamSpace (it wasn't before), so `total_cost` starts flowing through correctly with
zero changes to that function.

## 6. Types — `SelectedProduct` and `DealInputs`

```ts
// SelectedProduct — examspace_tier gains 3 new values, loses none
examspace_tier?: 'Container' | 'Linux' | 'Small' | 'Medium' | 'Large' | 'GPU'

// SelectedProduct — ai_model is unchanged in shape (string) but its valid values now come from
// cotutor_ai_models.model_id instead of the deleted COTUTOR_MODELS array. No type change needed,
// just stop importing COTUTOR_MODELS for validation anywhere it was used that way.
```

`DealInputs.seats_per_exam_day` and `DealInputs.exam_days` are no longer read by `buildProductLines()`
for ExamSpace pricing. Don't delete them from the type yet — check `QuoteInputsPanel.tsx` first (see
[03_CONFIG_SETTINGS.md](./03_CONFIG_SETTINGS.md)) for whether they're still shown/used for anything
else (e.g. TCO estimates) before removing the fields.

## 7. `calculateQuote()` — signature change

```ts
export function calculateQuote(
  inputs: DealInputs,
  version: PricingConfigVersion,
  models: PricingModel[],
  cotutorContext: CoTutorPricingContext, // NEW — required, not optional; CoTutor can't price without it
  rules: PricingRules = DEFAULT_RULES
): QuoteResult {
  const lines: QuoteLine[] = []
  for (const sel of inputs.selected_products) {
    lines.push(...buildProductLines(sel, inputs, models, version.id, cotutorContext)) // pass through
  }
  // ...rest of function body is UNCHANGED — list_total/discount/margin/TCO/bundle logic all
  // already operates on the resulting `lines` array generically and doesn't care how each line
  // was priced.
```

`buildProductLines()`'s signature also gains `cotutorContext` as a 5th parameter, threaded through to
the `cotutor` case above.

### Call site — `DealWorkspace.tsx`

```ts
// Alongside the existing loadActivePricingConfig() / loadPricingModelsForVersion() calls:
const [configVersion, pricingModels, cotutorAssumptions, cotutorModels] = await Promise.all([
  loadActivePricingConfig(),
  loadPricingModelsForVersion(activeVersionId),
  getCoTutorPricingAssumptions(activeVersionId),
  getCoTutorAiModels(activeVersionId),
])
if (!cotutorAssumptions) throw new Error('No CoTutor pricing assumptions found for active config version')
const cotutorContext = { assumptions: cotutorAssumptions, models: cotutorModels }

// ...
const result = calculateQuote(dealInputs, configVersion, pricingModels, cotutorContext, pricingRules)
```

## 8. `assumptions.ai_model_cogs_warning` — what replaces the old tier-guess logic

The old `cotutorCogsTier()` classified a model into `standard/moderate/high/premium` buckets purely
from input token price, with no connection to actual margin. Replace the warning logic in
`calculateQuote()`'s assumptions block with something based on the real computed number:

```ts
ai_model_cogs_warning: cotutorCalc != null && cotutorCalc.customerPricePerStudentPerYear > 0 &&
  (cotutorCalc.totalBlendedCogsPerStudentPerYear / cotutorCalc.customerPricePerStudentPerYear) > (1 - ctx.assumptions.target_gross_margin) * 1.1,
// True margin came in more than 10% worse than the target margin for this model/volume combo —
// a real signal, not a guess from the model's list price alone.
```

This requires `buildProductLines()` (or `calculateQuote()`) to also stash the `CoTutorCalculation`
result somewhere `assumptions` can read it — pass it back out of `buildProductLines()` alongside the
lines, or recompute it once more in the assumptions block using the same inputs (cheap, pure function,
recomputing is fine).
