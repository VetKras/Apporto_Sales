/**
 * Deterministic pricing engine for Apporto Sales.
 *
 * ALL pricing values come from the database (pricing_config_versions + pricing_models).
 * This module never hardcodes prices. Portia must consume QuoteResult objects — it never
 * calculates totals itself.
 */

import {
  getActivePricingConfig,
  getAllPricingConfigs,
  getPricingModelsForVersion,
  getCoTutorPricingAssumptions,
  getCoTutorAiModels,
  getPowerGraderPricingAssumptions,
  getTrustEdPricingAssumptions,
  getIntegrationSetting,
  replaceQuoteLines,
  saveQuoteSnapshot,
  getQuoteSnapshots,
  deleteQuoteSnapshot,
  logAiEvent,
} from '@/lib/db'
import type {
  PricingConfigRow,
  PricingModelRow,
  QuoteSnapshotRow,
  CoTutorPricingAssumptionsRow,
  CoTutorAiModelRow,
  PowerGraderPricingAssumptionsRow,
  TrustEdPricingAssumptionsRow,
} from '@/lib/db'

export type PricingModel = PricingModelRow
export type PricingConfigVersion = PricingConfigRow
export type QuoteSnapshot = QuoteSnapshotRow
export type CoTutorPricingAssumptions = CoTutorPricingAssumptionsRow
export type CoTutorAiModel = CoTutorAiModelRow
export type PowerGraderPricingAssumptions = PowerGraderPricingAssumptionsRow
export type TrustEdPricingAssumptions = TrustEdPricingAssumptionsRow

/**
 * CoTutor formula-driven pricing. Replaces the old flat 20/15/10 tiers and the hardcoded
 * (partly fabricated — it included Claude models that never existed in the real cost model)
 * COTUTOR_MODELS catalog. Assumptions and model rates now come from cotutor_pricing_assumptions
 * and cotutor_ai_models, loaded once per active config version (see loadCoTutorPricingContext()).
 */
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

export async function loadCoTutorPricingContext(configVersionId: string): Promise<CoTutorPricingContext> {
  const [assumptions, models] = await Promise.all([
    getCoTutorPricingAssumptions(configVersionId),
    getCoTutorAiModels(configVersionId),
  ])
  if (!assumptions) throw new Error(`No CoTutor pricing assumptions found for config version ${configVersionId}`)
  if (models.length === 0) throw new Error(`No CoTutor AI models found for config version ${configVersionId}`)
  return { assumptions, models }
}

/**
 * Direct port of CoTutor_Pricing_Final.xlsx BACKEND_ASSUMPTIONS + SALES_QUOTE sheets.
 * Every intermediate name below matches the workbook's row labels 1:1 so this can be checked
 * cell-by-cell against the source. Do not simplify the intermediate steps away.
 *
 * Reference check (do not remove): at studentCount=10000, assignmentsPerMonth=4,
 * contractMonthsPerYear=9, modelId='gpt-5.4-mini', with the seeded assumptions, this must return
 * customerPricePerStudentPerYear === 24.01 and totalAnnualContractValue === 240103.75. If it
 * doesn't match to the cent, there's a transcription error — diff against the xlsx cell-by-cell
 * rather than adjusting the formula to force a match.
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

/**
 * Billing months per year — CoTutor, PowerGrader, and TrustEd each bill against usage-per-month
 * rather than a flat annual rate, but their own source documents disagree on how many months a
 * "year" means for annualizing that monthly figure. Each is a per-product constant, not one
 * shared value — DealInputs.contract_term (annual/2-year/3-year) is renewal length, a separate
 * axis from this.
 */
/** CoTutor_Pricing_Final.xlsx SALES_QUOTE sheet: 9-month academic year. */
const COTUTOR_MONTHS_PER_YEAR = 9
/** PowerGrader_Pricing_Calculator_Internal.xlsx "PowerGrader Internal Cost" sheet, cell C19 =
 *  "TOTAL YEARLY COST" = monthly × 12 — full calendar year, not an academic-year assumption. */
const POWERGRADER_MONTHS_PER_YEAR = 12
/** TrustEd_Pricing_Models.xlsx "Model 2 - TrustEd Only" sheet, cell B14: "Months per Year" = 10
 *  ("Academic year length"). */
const TRUSTED_MONTHS_PER_YEAR = 10

/**
 * PowerGrader formula-driven pricing. Replaces the 3 flat, unsourced pricing_models rows
 * ($15/student/yr, $120/faculty/yr, $4/submission — none of which appear in any source file).
 * Assumptions come from powergrader_pricing_assumptions, loaded once per active config version.
 */
export interface PowerGraderPricingContext {
  assumptions: PowerGraderPricingAssumptionsRow
}

export interface PowerGraderCalculation {
  monthlyPlatformCost: number
  annualPlatformCost: number
  /** Unrounded — informational only, not a billed amount. */
  costPerStudentPerMonth: number
  monthlyCogs: number
  annualCogs: number
}

export async function loadPowerGraderPricingContext(configVersionId: string): Promise<PowerGraderPricingContext> {
  const assumptions = await getPowerGraderPricingAssumptions(configVersionId)
  if (!assumptions) throw new Error(`No PowerGrader pricing assumptions found for config version ${configVersionId}`)
  return { assumptions }
}

/**
 * Direct port of PowerGrader_Pricing_Calculator_Customer.xlsx "Customer Cost" sheet, cell C18 —
 * the actual customer-facing calculator currently in use. Cross-checked against
 * PowerGrader_Pricing_Calculator_Internal.xlsx's parallel formula (same constants, same
 * structure). Every intermediate matches the workbook's own terms so this can be checked
 * cell-by-cell against the source.
 *
 * Reference check (do not remove): at studentCount=2000, pagesPerInstruction=0.5,
 * pagesPerSubmission=6, assignmentsPerMonth=5, pagesPerQuizInstruction=0.5,
 * pagesPerQuizSubmission=1, quizzesPerMonth=1, with the seeded assumptions, this must return
 * monthlyPlatformCost === 6499 and costPerStudentPerMonth === 3.2495 — the workbook's own
 * pre-filled example. If it doesn't match to the cent, there's a transcription error — diff
 * against the xlsx cell-by-cell rather than adjusting the formula to force a match.
 */
export function calculatePowerGraderPrice(
  studentCount: number,
  pagesPerInstruction: number,
  pagesPerSubmission: number,
  assignmentsPerMonth: number,
  pagesPerQuizInstruction: number,
  pagesPerQuizSubmission: number,
  quizzesPerMonth: number,
  ctx: PowerGraderPricingContext
): PowerGraderCalculation {
  const a = ctx.assumptions

  const rawCost = (instructionPages: number, submissionPages: number, countPerMonth: number): number => {
    const inputTokens = (instructionPages + a.pwg_context_pages_per_submission) * studentCount * a.token_buffer_multiplier * a.tokens_per_page * countPerMonth
    const outputTokens = submissionPages * studentCount * a.token_buffer_multiplier * a.tokens_per_page * countPerMonth
    const baseCost = a.base_cost_per_submission * studentCount * countPerMonth
    return inputTokens * a.input_token_price_per_token + outputTokens * a.output_token_price_per_token + baseCost
  }

  const rawAssignmentCost = rawCost(pagesPerInstruction, pagesPerSubmission, assignmentsPerMonth)
  const rawQuizCost = rawCost(pagesPerQuizInstruction, pagesPerQuizSubmission, quizzesPerMonth)
  const monthlyCogs = rawAssignmentCost + rawQuizCost

  const rawMonthlyCustomerCost = monthlyCogs * a.platform_cost_multiplier
  const inc = a.charm_price_rounding_increment
  const monthlyPlatformCost = Math.max(0, Math.floor(rawMonthlyCustomerCost / inc) * inc - 1)

  const months = POWERGRADER_MONTHS_PER_YEAR

  return {
    monthlyPlatformCost: round2(monthlyPlatformCost),
    annualPlatformCost: round2(monthlyPlatformCost * months),
    costPerStudentPerMonth: studentCount > 0 ? Math.round((monthlyPlatformCost / studentCount) * 10000) / 10000 : 0,
    monthlyCogs: round2(monthlyCogs),
    annualCogs: round2(monthlyCogs * months),
  }
}

/**
 * TrustEd formula-driven pricing — bottom-up from real per-assignment COGS (storage + analysis),
 * priced up via an explicit, adjustable margin. Billed per assignment analyzed, not a flat
 * per-student rate. Replaces the old flat 'Standalone'/'Bundle Add-on' rows.
 *
 * free_with_cotutor is a business lever, not a formula input: when set and the same deal also
 * includes CoTutor, price is forced to $0 (still returned as an explicit line, not omitted) —
 * "thrown in as a freebie for every exam that uses CoTutor" was raised as a live option to keep
 * initial adoption friction low, not baked in as fixed behavior.
 */
export interface TrustEdPricingContext {
  assumptions: TrustEdPricingAssumptionsRow
}

export interface TrustEdCalculation {
  cogsPerAssignment: number
  totalAssignmentsPerYear: number
  annualCogs: number
  annualPrice: number
  pricePerStudentPerYear: number
  isFree: boolean
}

export async function loadTrustEdPricingContext(configVersionId: string): Promise<TrustEdPricingContext> {
  const assumptions = await getTrustEdPricingAssumptions(configVersionId)
  if (!assumptions) throw new Error(`No TrustEd pricing assumptions found for config version ${configVersionId}`)
  return { assumptions }
}

export function calculateTrustEdPrice(
  studentCount: number,
  assignmentsAnalyzedPerMonth: number,
  cotutorAlsoSelected: boolean,
  ctx: TrustEdPricingContext
): TrustEdCalculation {
  const a = ctx.assumptions
  const months = TRUSTED_MONTHS_PER_YEAR

  const cogsPerAssignment = a.storage_cost_per_assignment + a.analysis_cost_per_assignment
  const totalAssignmentsPerYear = studentCount * assignmentsAnalyzedPerMonth * months
  const variableCogs = cogsPerAssignment * totalAssignmentsPerYear
  const fixedCogs = a.fixed_infra_per_student_year * studentCount
  const totalCogs = variableCogs + fixedCogs

  const isFree = a.free_with_cotutor && cotutorAlsoSelected
  const totalPrice = isFree ? 0 : totalCogs / (1 - a.target_gross_margin)

  return {
    cogsPerAssignment: round2(cogsPerAssignment),
    totalAssignmentsPerYear,
    annualCogs: round2(totalCogs),
    annualPrice: round2(totalPrice),
    pricePerStudentPerYear: studentCount > 0 ? round2(totalPrice / studentCount) : 0,
    isFree,
  }
}

export interface DealInputs {
  deal_id: string
  student_count: number
  faculty_count: number
  course_sections: number
  exam_days: number
  seats_per_exam_day: number
  customer_status: 'new' | 'existing'
  discount_percent: number
  selected_products: SelectedProduct[]
  contract_term: 'annual' | '2-year' | '3-year'
  tco_multiplier: number
  true_up_clause: boolean
  compliance_requirements: string[]
}

export interface SelectedProduct {
  product_id: string
  product_slug: string
  product_name: string
  tier_name?: string
  pricing_type?: string
  trusted_tier?: string
  examspace_tier?: string
  override_price?: number
  ai_model?: string
  assignments_per_course?: number
  assignments_per_month?: number
  pages_per_instruction?: number
  pages_per_submission?: number
  quizzes_per_month?: number
  pages_per_quiz_instruction?: number
  pages_per_quiz_submission?: number
  lms_platform?: 'Canvas' | 'D2L' | 'Blackboard' | 'Moodle'
  trusted_assignments_per_month?: number
  video_playback?: boolean
  gpu_requirement?: boolean
}

export interface QuoteLine {
  product_id: string
  product_name: string
  pricing_model_id: string | null
  tier_label: string
  quantity: number
  unit: string
  unit_price: number
  list_price: number
  discount_amount: number
  net_price: number
  unit_cost: number | null
  total_cost: number | null
  margin_percent: number | null
  config_version_id: string
}

export interface QuoteResult {
  config_version_id: string
  config_version_name: string
  lines: QuoteLine[]
  list_total: number
  discount_amount: number
  discount_percent: number
  final_total: number
  cost_total: number | null
  gross_margin_percent: number | null
  per_student_price: number | null
  tco_low: number | null
  tco_high: number | null
  bundle_suggestion: BundleSuggestion | null
  approval_level: ApprovalLevel
  inputs_snapshot: DealInputs
  assumptions: QuoteAssumptions
}

export interface QuoteAssumptions {
  estimated_assignments_per_year: number | null
  estimated_exam_days_per_year: number | null
  /** True only when an override_price has compressed CoTutor's actual margin materially
   *  below the configured target margin — the formula-derived price always hits target
   *  margin exactly, so this can only fire when a rep has manually overridden the price. */
  ai_model_cogs_warning: boolean
  cotutor_ai_model: string | null
  /** Actual computed gross margin % for the CoTutor line (from calculateCoTutorPrice()),
   *  replaces the old coarse standard/moderate/high/premium guess. Null if CoTutor isn't
   *  in the deal. */
  cotutor_margin_percent: number | null
  cotutor_target_margin_percent: number | null
  pages_submission_warning: boolean
  lms_integration_risk: string | null
  video_playback_surcharge_per_student: number | null
  contract_term: string
  tco_multiplier_used: number
  true_up_clause: boolean
  compliance_requirements: string[]
  shared_student_cohort_products: string[]
}

export interface BundleSuggestion {
  product_count: number
  suggested_discount_percent: number
  already_applied: boolean
}

export type ApprovalLevel = 'Sales' | 'Manager' | 'VP' | 'CFO/Executive'

export interface PricingRules {
  approval: { sales_max: number; manager_max: number; vp_max: number }
  bundle_discounts: { two: number; three: number; four: number }
  tco_default_multiplier: number
  target_gross_margin_pct: number
  examspace_volume_discounts: { threshold_usd: number; discount_pct: number }[]
}

export const DEFAULT_RULES: PricingRules = {
  approval: { sales_max: 5, manager_max: 10, vp_max: 15 },
  bundle_discounts: { two: 10, three: 15, four: 20 },
  tco_default_multiplier: 1.6,
  target_gross_margin_pct: 70,
  examspace_volume_discounts: [
    { threshold_usd: 50000,  discount_pct: 3  },
    { threshold_usd: 100000, discount_pct: 5  },
    { threshold_usd: 150000, discount_pct: 7  },
    { threshold_usd: 200000, discount_pct: 10 },
    { threshold_usd: 300000, discount_pct: 14 },
  ],
}

export async function loadPricingRules(): Promise<PricingRules> {
  const row = await getIntegrationSetting('pricing_rules')
  if (!row?.api_key) return DEFAULT_RULES
  try {
    return { ...DEFAULT_RULES, ...JSON.parse(row.api_key) }
  } catch {
    return DEFAULT_RULES
  }
}

function getBundleSuggestion(
  productCount: number,
  currentDiscountPercent: number,
  rules: PricingRules
): BundleSuggestion | null {
  const discounts: Record<number, number> = {
    2: rules.bundle_discounts.two,
    3: rules.bundle_discounts.three,
    4: rules.bundle_discounts.four,
  }
  const suggested = discounts[productCount]
  if (!suggested) return null
  return {
    product_count: productCount,
    suggested_discount_percent: suggested,
    already_applied: currentDiscountPercent >= suggested,
  }
}

function getApprovalLevel(discountPercent: number, rules: PricingRules): ApprovalLevel {
  if (discountPercent <= rules.approval.sales_max) return 'Sales'
  if (discountPercent <= rules.approval.manager_max) return 'Manager'
  if (discountPercent <= rules.approval.vp_max) return 'VP'
  return 'CFO/Executive'
}

export async function loadActivePricingConfig() {
  return getActivePricingConfig()
}

export async function loadAllPricingConfigs() {
  return getAllPricingConfigs()
}

export async function loadPricingModelsForVersion(versionId: string) {
  return getPricingModelsForVersion(versionId)
}

export function calculateQuote(
  inputs: DealInputs,
  version: PricingConfigVersion,
  models: PricingModel[],
  cotutorContext: CoTutorPricingContext,
  powerGraderContext: PowerGraderPricingContext,
  trustedContext: TrustEdPricingContext,
  rules: PricingRules = DEFAULT_RULES
): QuoteResult {
  const lines: QuoteLine[] = []
  const cotutorAlsoSelected = inputs.selected_products.some((s) => s.product_slug === 'cotutor')

  for (const sel of inputs.selected_products) {
    lines.push(...buildProductLines(sel, inputs, models, version.id, cotutorContext, powerGraderContext, trustedContext, cotutorAlsoSelected))
  }

  const list_total = lines.reduce((s, l) => s + l.list_price, 0)
  const discount_percent = inputs.discount_percent
  const discount_amount = round2(list_total * (discount_percent / 100))
  const final_total = round2(list_total - discount_amount)

  const cost_total_raw = lines.reduce((s, l) => s + (l.total_cost ?? 0), 0)
  const cost_total = lines.some((l) => l.total_cost != null) ? round2(cost_total_raw) : null

  const gross_margin_percent =
    final_total > 0 && cost_total != null
      ? round2(((final_total - cost_total) / final_total) * 100)
      : null

  const per_student_price =
    inputs.student_count > 0 ? round2(final_total / inputs.student_count) : null

  const multiplier = inputs.tco_multiplier ?? 1.6
  const tco_low = final_total > 0 ? round2(final_total * (multiplier - 0.2)) : null
  const tco_high = final_total > 0 ? round2(final_total * multiplier) : null

  const bundle_suggestion = getBundleSuggestion(
    inputs.selected_products.length,
    discount_percent,
    rules
  )

  const linesWithDiscount: QuoteLine[] = lines.map((l) => {
    const lineDiscount = list_total > 0 ? round2(l.list_price * (discount_percent / 100)) : 0
    const net = round2(l.list_price - lineDiscount)
    const margin =
      net > 0 && l.total_cost != null
        ? round2(((net - l.total_cost) / net) * 100)
        : null
    return { ...l, discount_amount: lineDiscount, net_price: net, margin_percent: margin }
  })

  const cotutorSel = inputs.selected_products.find((s) => s.product_slug === 'cotutor')
  const pgSel = inputs.selected_products.find((s) => s.product_slug === 'powergrader')
  const trustedSel = inputs.selected_products.find((s) => s.product_slug === 'trusted')

  const lmsRisk = pgSel?.lms_platform === 'D2L'
    ? 'D2L has known integration challenges — flag for technical review'
    : pgSel?.lms_platform === 'Blackboard' || pgSel?.lms_platform === 'Moodle'
    ? `${pgSel.lms_platform} support is limited — confirm integration readiness`
    : null

  const sharedCohortProducts = inputs.selected_products
    .filter((s) =>
      s.product_slug === 'cotutor' ||
      s.product_slug === 'trusted' ||
      (s.product_slug === 'powergrader' && (s.pricing_type ?? 'per_student') === 'per_student')
    )
    .map((s) => s.product_name)

  const cotutorLine = cotutorSel ? linesWithDiscount.find((l) => l.product_id === cotutorSel.product_id) : undefined
  const targetMarginPercent = round2(cotutorContext.assumptions.target_gross_margin * 100)
  const cotutorMarginPercent = cotutorLine?.margin_percent ?? null

  const assumptions: QuoteAssumptions = {
    estimated_assignments_per_year: inputs.course_sections > 0 ? inputs.course_sections * 6 : null,
    estimated_exam_days_per_year: inputs.course_sections > 0 ? inputs.course_sections * 2 : null,
    // The formula-derived price always hits target margin exactly — this can only fire when an
    // override_price has compressed the actual margin more than 5 points below target.
    ai_model_cogs_warning: cotutorMarginPercent != null && cotutorMarginPercent < targetMarginPercent - 5,
    cotutor_ai_model: cotutorSel?.ai_model ?? null,
    cotutor_margin_percent: cotutorMarginPercent,
    cotutor_target_margin_percent: cotutorSel ? targetMarginPercent : null,
    pages_submission_warning: pgSel?.pages_per_submission === 6,
    lms_integration_risk: lmsRisk,
    video_playback_surcharge_per_student: trustedSel?.video_playback ? 6 : null,
    contract_term: inputs.contract_term ?? 'annual',
    tco_multiplier_used: multiplier,
    true_up_clause: inputs.true_up_clause ?? false,
    compliance_requirements: inputs.compliance_requirements ?? [],
    shared_student_cohort_products: sharedCohortProducts,
  }

  return {
    config_version_id: version.id,
    config_version_name: version.version_name,
    lines: linesWithDiscount,
    list_total: round2(list_total),
    discount_amount,
    discount_percent,
    final_total,
    cost_total,
    gross_margin_percent,
    per_student_price,
    tco_low,
    tco_high,
    bundle_suggestion,
    approval_level: getApprovalLevel(discount_percent, rules),
    inputs_snapshot: { ...inputs },
    assumptions,
  }
}

function buildProductLines(
  sel: SelectedProduct,
  inputs: DealInputs,
  models: PricingModel[],
  configVersionId: string,
  cotutorContext: CoTutorPricingContext,
  powerGraderContext: PowerGraderPricingContext,
  trustedContext: TrustEdPricingContext,
  cotutorAlsoSelected: boolean
): QuoteLine[] {
  const find = (tierName: string | null, pricingType: string | null) =>
    models.find(
      (m) =>
        m.product_id === sel.product_id &&
        (tierName != null ? m.tier_name === tierName : true) &&
        (pricingType != null ? m.pricing_type === pricingType : true)
    )

  switch (sel.product_slug) {
    case 'cotutor': {
      const modelId = sel.ai_model ?? cotutorContext.models.find((m) => m.is_default)?.model_id ?? cotutorContext.models[0].model_id
      const assignmentsPerMonth = sel.assignments_per_course ?? 4
      const calc = calculateCoTutorPrice(
        inputs.student_count,
        assignmentsPerMonth,
        COTUTOR_MONTHS_PER_YEAR,
        modelId,
        cotutorContext
      )
      const unitPrice = sel.override_price ?? calc.customerPricePerStudentPerYear
      return [{
        product_id: sel.product_id,
        product_name: sel.product_name,
        // No longer a pricing_models row lookup — formula-driven, not a flat tier.
        pricing_model_id: null,
        tier_label: calc.model.label,
        quantity: inputs.student_count,
        unit: 'students/year',
        unit_price: unitPrice,
        list_price: round2(unitPrice * inputs.student_count),
        discount_amount: 0,
        net_price: round2(unitPrice * inputs.student_count),
        unit_cost: calc.totalBlendedCogsPerStudentPerYear,
        total_cost: round2(calc.totalBlendedCogsPerStudentPerYear * inputs.student_count),
        margin_percent: null,
        config_version_id: configVersionId,
      }]
    }

    case 'powergrader': {
      // Formula-driven monthly platform cost (PowerGrader_Pricing_Calculator_Customer.xlsx),
      // annualized via the same academic-months convention as CoTutor. Replaces the old
      // per_student/per_faculty/per_submission flat-tier picker — none of those three flat rates
      // were ever sourced from anything (see docs/pricing/00_INDEX.md), and the real billing unit
      // doesn't fit any of them.
      const calc = calculatePowerGraderPrice(
        inputs.student_count,
        sel.pages_per_instruction ?? 0.5,
        sel.pages_per_submission ?? 6,
        sel.assignments_per_month ?? 5,
        sel.pages_per_quiz_instruction ?? 0.5,
        sel.pages_per_quiz_submission ?? 1,
        sel.quizzes_per_month ?? 1,
        powerGraderContext
      )
      const unitPrice = sel.override_price ?? (inputs.student_count > 0 ? round2(calc.annualPlatformCost / inputs.student_count) : 0)
      const result: QuoteLine[] = [{
        product_id: sel.product_id,
        product_name: sel.product_name,
        pricing_model_id: null,
        tier_label: `Platform Cost ($${calc.costPerStudentPerMonth.toFixed(2)}/student/mo)`,
        quantity: inputs.student_count,
        unit: 'students/year',
        unit_price: unitPrice,
        list_price: round2(unitPrice * inputs.student_count),
        discount_amount: 0,
        net_price: round2(unitPrice * inputs.student_count),
        unit_cost: inputs.student_count > 0 ? round2(calc.annualCogs / inputs.student_count) : 0,
        total_cost: calc.annualCogs,
        margin_percent: null,
        config_version_id: configVersionId,
      }]
      if (inputs.customer_status === 'new') {
        const setupModel = find('Setup Fee', 'setup_fee')
        if (setupModel) result.push(makeLine(sel, setupModel, 'Setup Fee', 1, 'one-time', setupModel.default_price ?? 0, configVersionId))
      }
      return result
    }

    case 'trusted': {
      // Formula-driven, per assignment analyzed (bottom-up from real storage+analysis COGS) —
      // replaces the old flat Standalone/Bundle Add-on tiers, which priced the same infra
      // differently depending on bundling for no cost-based reason.
      const calc = calculateTrustEdPrice(
        inputs.student_count,
        sel.trusted_assignments_per_month ?? 4,
        cotutorAlsoSelected,
        trustedContext
      )
      const unitPrice = sel.override_price ?? calc.pricePerStudentPerYear
      const lines: QuoteLine[] = [{
        product_id: sel.product_id,
        product_name: sel.product_name,
        pricing_model_id: null,
        tier_label: calc.isFree
          ? 'Included free with CoTutor'
          : `Integrity Analysis (${calc.totalAssignmentsPerYear} assignments/yr)`,
        quantity: inputs.student_count,
        unit: 'students/year',
        unit_price: unitPrice,
        list_price: round2(unitPrice * inputs.student_count),
        discount_amount: 0,
        net_price: round2(unitPrice * inputs.student_count),
        unit_cost: inputs.student_count > 0 ? round2(calc.annualCogs / inputs.student_count) : 0,
        total_cost: calc.annualCogs,
        margin_percent: null,
        config_version_id: configVersionId,
      }]
      if (sel.video_playback && inputs.student_count > 0) {
        lines.push({
          product_id: sel.product_id,
          product_name: sel.product_name,
          pricing_model_id: null,
          tier_label: 'Video Playback Add-on',
          quantity: inputs.student_count,
          unit: 'students/year',
          unit_price: 6,
          list_price: round2(inputs.student_count * 6),
          discount_amount: 0,
          net_price: round2(inputs.student_count * 6),
          unit_cost: null,
          total_cost: null,
          margin_percent: null,
          config_version_id: configVersionId,
        })
      }
      return lines
    }

    case 'examspace': {
      // Per-student annual pricing (exam_desktop_cost_v2026.xlsx) — six tiers: Container, Linux,
      // Small, Medium, Large, GPU. Replaces the old $/seat-day model; quantity is now student_count,
      // matching CoTutor/PowerGrader/TrustEd, not seats_per_exam_day × exam_days.
      const result: QuoteLine[] = []
      const desktopTier = sel.examspace_tier ?? 'Medium'
      const model = find(desktopTier, 'per_student')
      if (model) {
        result.push(makeLine(sel, model, `${desktopTier} Desktop`, inputs.student_count, 'students/year', sel.override_price ?? model.default_price ?? 0, configVersionId))
      }
      if (inputs.customer_status === 'new') {
        const pfModel = find('Platform Fee', 'platform_fee')
        if (pfModel) result.push(makeLine(sel, pfModel, 'Platform Fee (pilot)', 1, 'year', pfModel.default_price ?? 0, configVersionId))
        const sfModel = find('Setup Fee', 'setup_fee')
        if (sfModel) result.push(makeLine(sel, sfModel, 'Pilot Setup Fee', 1, 'one-time', sfModel.default_price ?? 0, configVersionId))
      }
      return result
    }

    default:
      return []
  }
}

function makeLine(
  sel: SelectedProduct,
  model: PricingModel,
  tierLabel: string,
  quantity: number,
  unit: string,
  unit_price: number,
  config_version_id: string
): QuoteLine {
  const list_price = round2(quantity * unit_price)
  const total_cost = model.default_cost != null ? round2(quantity * model.default_cost) : null
  return {
    product_id: sel.product_id,
    product_name: sel.product_name,
    pricing_model_id: model.id,
    tier_label: tierLabel,
    quantity,
    unit,
    unit_price,
    list_price,
    discount_amount: 0,
    net_price: list_price,
    unit_cost: model.default_cost ?? null,
    total_cost,
    margin_percent: null,
    config_version_id,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export async function persistQuoteLines(result: QuoteResult): Promise<{ error: string | null }> {
  const { deal_id } = result.inputs_snapshot

  const rows = result.lines.map((l) => ({
    deal_id,
    product_id: l.product_id,
    pricing_model_id: l.pricing_model_id,
    quantity: l.quantity,
    unit: l.unit,
    unit_price: l.unit_price,
    list_price: l.list_price,
    discount_amount: l.discount_amount,
    net_price: l.net_price,
    unit_cost: l.unit_cost,
    total_cost: l.total_cost,
    margin_percent: l.margin_percent,
    config_version_id: l.config_version_id,
  }))

  const { error } = await replaceQuoteLines(deal_id, rows)
  if (error) return { error }

  await logAiEvent({
    event_type: 'quote_calculated',
    status: 'created',
    deal_id,
    reference: {
      config_version_id: result.config_version_id,
      config_version_name: result.config_version_name,
      final_total: result.final_total,
      line_count: result.lines.length,
    },
  })

  return { error: null }
}

export async function persistQuoteSnapshot(
  result: QuoteResult,
  name: string,
  createdBy: string | null
): Promise<{ id: string | null; error: string | null }> {
  return saveQuoteSnapshot({
    deal_id: result.inputs_snapshot.deal_id,
    name,
    inputs_snapshot: result.inputs_snapshot as unknown as import('@/types/database').Json,
    result_snapshot: result as unknown as import('@/types/database').Json,
    config_version_id: result.config_version_id,
    final_total: result.final_total,
    created_by: createdBy,
  })
}

export async function loadQuoteSnapshots(dealId: string): Promise<QuoteSnapshot[]> {
  return getQuoteSnapshots(dealId)
}

export async function removeQuoteSnapshot(id: string): Promise<{ error: string | null }> {
  return deleteQuoteSnapshot(id)
}

export function buildQuoteSourceTrace(result: QuoteResult): Record<string, unknown> {
  return {
    config_version_id: result.config_version_id,
    config_version_name: result.config_version_name,
    pricing_model_ids: result.lines.map((l) => l.pricing_model_id).filter(Boolean),
    final_total: result.final_total,
    discount_percent: result.discount_percent,
    approval_level: result.approval_level,
    calculated_at: new Date().toISOString(),
  }
}
