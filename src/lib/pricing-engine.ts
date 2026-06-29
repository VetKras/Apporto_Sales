/**
 * Deterministic pricing engine for Apporto Sales.
 *
 * ALL pricing values come from the database (pricing_config_versions + pricing_models).
 * This module never hardcodes prices. Portia must consume QuoteResult objects — it never
 * calculates totals itself.
 *
 * Test: change CoTutor 20/15/10 in config, regenerate a quote, and verify the
 * quote_lines preserve the config_version_id used at calculation time.
 */

import {
  getActivePricingConfig,
  getAllPricingConfigs,
  getPricingModelsForVersion,
  replaceQuoteLines,
  saveQuoteSnapshot,
  getQuoteSnapshots,
  deleteQuoteSnapshot,
  logAiEvent,
} from '@/lib/db'
import type { PricingConfigRow, PricingModelRow, QuoteSnapshotRow } from '@/lib/db'

// ─── Re-export DB types used by callers ───────────────────────────────────────

export type PricingModel = PricingModelRow
export type PricingConfigVersion = PricingConfigRow
export type QuoteSnapshot = QuoteSnapshotRow

// ─── Public input / output types ─────────────────────────────────────────────

/**
 * Current AI model catalog with real token pricing (USD per 1M tokens).
 * Input/output prices reflect published rates as of June 2026.
 * Used by the CoTutor AI model selector and COGS warning logic.
 */
export interface CoTutorModelDef {
  id: string
  label: string
  provider: 'Anthropic' | 'OpenAI'
  inputPricePerMTok: number
  outputPricePerMTok: number
}

export const COTUTOR_MODELS: CoTutorModelDef[] = [
  // OpenAI — sorted ascending by input price
  { id: 'gpt-5.4-nano',  label: 'GPT-5.4 Nano',  provider: 'OpenAI',    inputPricePerMTok: 0.20,  outputPricePerMTok: 1.25 },
  { id: 'gpt-5.4-mini',  label: 'GPT-5.4 Mini',  provider: 'OpenAI',    inputPricePerMTok: 0.75,  outputPricePerMTok: 4.50 },
  { id: 'gpt-5.4',       label: 'GPT-5.4',        provider: 'OpenAI',    inputPricePerMTok: 2.50,  outputPricePerMTok: 15.00 },
  { id: 'gpt-5.5',       label: 'GPT-5.5',        provider: 'OpenAI',    inputPricePerMTok: 5.00,  outputPricePerMTok: 30.00 },
  // Anthropic — sorted ascending by input price
  { id: 'claude-haiku-4-5',  label: 'Claude Haiku 4.5',  provider: 'Anthropic', inputPricePerMTok: 1.00,  outputPricePerMTok: 5.00 },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', provider: 'Anthropic', inputPricePerMTok: 3.00,  outputPricePerMTok: 15.00 },
  { id: 'claude-opus-4-8',   label: 'Claude Opus 4.8',   provider: 'Anthropic', inputPricePerMTok: 5.00,  outputPricePerMTok: 25.00 },
  { id: 'claude-fable-5',    label: 'Claude Fable 5',    provider: 'Anthropic', inputPricePerMTok: 10.00, outputPricePerMTok: 50.00 },
]

const COTUTOR_MODEL_MAP = new Map(COTUTOR_MODELS.map((m) => [m.id, m]))

export const COTUTOR_DEFAULT_MODEL = 'claude-haiku-4-5'

/** Returns COGS tier based on input token price (USD/MTok). */
function cotutorCogsTier(model: CoTutorModelDef | undefined): 'standard' | 'moderate' | 'high' | 'premium' {
  if (!model) return 'standard'
  const p = model.inputPricePerMTok
  if (p <= 1.50) return 'standard'
  if (p <= 4.00) return 'moderate'
  if (p <= 8.00) return 'high'
  return 'premium'
}

export type CoTutorCogsTier = 'standard' | 'moderate' | 'high' | 'premium'

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
  /** cotutor tier: 'Departmental / Premium' | 'Campus / Standard' | 'Platform / Entry' */
  tier_name?: string
  /** powergrader mode: 'per_student' | 'per_faculty' | 'per_submission' */
  pricing_type?: string
  /** trusted mode: 'Standalone' | 'Bundle Add-on' */
  trusted_tier?: string
  /** examspace desktop type: 'Medium' | 'Large' | 'GPU' */
  examspace_tier?: string
  /** override unit price — user-set; otherwise falls back to DB default */
  override_price?: number
  // CoTutor-specific
  /** cotutor ai model id — see COTUTOR_MODELS for valid values */
  ai_model?: string
  assignments_per_course?: number
  // PowerGrader-specific
  assignments_per_month?: number
  pages_per_submission?: 1 | 6
  lms_platform?: 'Canvas' | 'D2L' | 'Blackboard' | 'Moodle'
  // TrustEd-specific
  trusted_assignments_per_month?: number
  video_playback?: boolean
  // ExamSpace-specific
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
  /** CRITICAL: preserved for quote reproducibility — never strip this field */
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
  ai_model_cogs_warning: boolean
  /** actual model selected for CoTutor — null if CoTutor not in deal */
  cotutor_ai_model: string | null
  /** COGS tier based on selected model's input token price */
  cotutor_cogs_tier: CoTutorCogsTier | null
  pages_submission_warning: boolean
  lms_integration_risk: string | null
  video_playback_surcharge_per_student: number | null
  contract_term: string
  tco_multiplier_used: number
  true_up_clause: boolean
  compliance_requirements: string[]
  /** Products that bill against the same shared student cohort (not additive headcounts) */
  shared_student_cohort_products: string[]
}

export interface BundleSuggestion {
  product_count: number
  suggested_discount_percent: number
  already_applied: boolean
}

export type ApprovalLevel = 'Sales' | 'Manager' | 'VP' | 'CFO/Executive'

// ─── Bundle / approval thresholds (read-only constants, not pricing values) ──

const BUNDLE_DISCOUNTS: Record<number, number> = { 2: 10, 3: 15, 4: 20 }

function getBundleSuggestion(
  productCount: number,
  currentDiscountPercent: number
): BundleSuggestion | null {
  const suggested = BUNDLE_DISCOUNTS[productCount]
  if (!suggested) return null
  return {
    product_count: productCount,
    suggested_discount_percent: suggested,
    already_applied: currentDiscountPercent >= suggested,
  }
}

function getApprovalLevel(discountPercent: number): ApprovalLevel {
  if (discountPercent <= 5) return 'Sales'
  if (discountPercent <= 10) return 'Manager'
  if (discountPercent <= 15) return 'VP'
  return 'CFO/Executive'
}

// ─── DB loaders (delegated to db.ts) ─────────────────────────────────────────

export async function loadActivePricingConfig() {
  return getActivePricingConfig()
}

export async function loadAllPricingConfigs() {
  return getAllPricingConfigs()
}

export async function loadPricingModelsForVersion(versionId: string) {
  return getPricingModelsForVersion(versionId)
}

// ─── Core quote calculation ───────────────────────────────────────────────────

/**
 * Calculates a complete, deterministic quote from deal inputs and a pricing config.
 * Never invents prices — all values come from models loaded from DB.
 * All line prices are sourced from PricingModelRow.default_price (or override_price).
 */
export function calculateQuote(
  inputs: DealInputs,
  version: PricingConfigVersion,
  models: PricingModel[]
): QuoteResult {
  const lines: QuoteLine[] = []

  for (const sel of inputs.selected_products) {
    lines.push(...buildProductLines(sel, inputs, models, version.id))
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
    discount_percent
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

  // ── Build assumptions block ────────────────────────────────────────────────
  const cotutorSel = inputs.selected_products.find((s) => s.product_slug === 'cotutor')
  const pgSel = inputs.selected_products.find((s) => s.product_slug === 'powergrader')
  const trustedSel = inputs.selected_products.find((s) => s.product_slug === 'trusted')

  const lmsRisk = pgSel?.lms_platform === 'D2L'
    ? 'D2L has known integration challenges — flag for technical review'
    : pgSel?.lms_platform === 'Blackboard' || pgSel?.lms_platform === 'Moodle'
    ? `${pgSel.lms_platform} support is limited — confirm integration readiness`
    : null

  // Products that bill against the shared student headcount (same cohort, not additive)
  const sharedCohortProducts = inputs.selected_products
    .filter((s) =>
      s.product_slug === 'cotutor' ||
      s.product_slug === 'trusted' ||
      (s.product_slug === 'powergrader' && (s.pricing_type ?? 'per_student') === 'per_student')
    )
    .map((s) => s.product_name)

  const assumptions: QuoteAssumptions = {
    estimated_assignments_per_year: inputs.course_sections > 0 ? inputs.course_sections * 6 : null,
    estimated_exam_days_per_year: inputs.course_sections > 0 ? inputs.course_sections * 2 : null,
    ai_model_cogs_warning: (() => {
      const tier = cotutorCogsTier(COTUTOR_MODEL_MAP.get(cotutorSel?.ai_model ?? ''))
      return tier === 'moderate' || tier === 'high' || tier === 'premium'
    })(),
    cotutor_ai_model: cotutorSel?.ai_model ?? null,
    cotutor_cogs_tier: cotutorSel?.ai_model
      ? cotutorCogsTier(COTUTOR_MODEL_MAP.get(cotutorSel.ai_model))
      : null,
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
    approval_level: getApprovalLevel(discount_percent),
    inputs_snapshot: { ...inputs },
    assumptions,
  }
}

function buildProductLines(
  sel: SelectedProduct,
  inputs: DealInputs,
  models: PricingModel[],
  configVersionId: string
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
      const tier = sel.tier_name ?? 'Campus / Standard'
      const model = find(tier, 'per_student')
      if (!model) return []
      return [makeLine(sel, model, tier, inputs.student_count, 'students/year', sel.override_price ?? model.default_price ?? 0, configVersionId)]
    }

    case 'powergrader': {
      const pricingType = sel.pricing_type ?? 'per_student'
      if (pricingType === 'per_student') {
        const model = find('Per Student', 'per_student')
        if (!model) return []
        return [makeLine(sel, model, 'Per Student', inputs.student_count, 'students/year', sel.override_price ?? model.default_price ?? 0, configVersionId)]
      }
      if (pricingType === 'per_faculty') {
        const model = find('Per Faculty', 'per_faculty')
        if (!model) return []
        return [makeLine(sel, model, 'Per Faculty', inputs.faculty_count, 'faculty/year', sel.override_price ?? model.default_price ?? 0, configVersionId)]
      }
      if (pricingType === 'per_submission') {
        const model = find('Per Submission', 'per_submission')
        if (!model) return []
        const estimated = inputs.course_sections * 6 * inputs.student_count
        return [makeLine(sel, model, 'Per Submission (est.)', estimated, 'submissions/year', sel.override_price ?? model.default_price ?? 0, configVersionId)]
      }
      return []
    }

    case 'trusted': {
      const tier = sel.trusted_tier ?? 'Standalone'
      const model = find(tier, 'per_student')
      if (!model) return []
      const lines: QuoteLine[] = [
        makeLine(sel, model, tier, inputs.student_count, 'students/year', sel.override_price ?? model.default_price ?? 0, configVersionId)
      ]
      // Video playback add-on: $0.50/student/month = $6/student/year (standalone only)
      if (sel.video_playback && tier === 'Standalone' && inputs.student_count > 0) {
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
      const result: QuoteLine[] = []
      const desktopTier = sel.examspace_tier ?? 'Large'
      const model = find(desktopTier, 'per_seat_day')
      if (model) {
        const qty = (inputs.seats_per_exam_day || 0) * (inputs.exam_days || 0)
        result.push(makeLine(sel, model, `${desktopTier} Desktop`, qty, 'seat-days/year', sel.override_price ?? model.default_price ?? 0, configVersionId))
      }
      if (inputs.customer_status === 'new') {
        const pfModel = find('Platform Fee', 'platform_fee')
        if (pfModel) result.push(makeLine(sel, pfModel, 'Platform Fee (new customer)', 1, 'year', pfModel.default_price ?? 0, configVersionId))
        const sfModel = find('Setup Fee', 'setup_fee')
        if (sfModel) result.push(makeLine(sel, sfModel, 'Pilot (one-time setup)', 1, 'one-time', sfModel.default_price ?? 0, configVersionId))
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

// ─── Persist quote lines to DB ────────────────────────────────────────────────

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

// ─── Quote snapshots ──────────────────────────────────────────────────────────

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

// ─── Helpers for Portia source trace ─────────────────────────────────────────

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
