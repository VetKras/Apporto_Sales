import { useState } from 'react'
import { ChevronDown, ChevronRight, AlertTriangle, AlertCircle, CheckCircle, Info, BookOpen, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  calculateCoTutorPrice, calculatePowerGraderPrice, calculateTrustEdPrice,
  type DealInputs, type SelectedProduct, type PricingModel,
  type CoTutorPricingContext, type PowerGraderPricingContext, type TrustEdPricingContext,
} from '@/lib/pricing-engine'
import type { Database } from '@/types/database'

type Product = Database['public']['Tables']['products']['Row']
type ProductFact = Database['public']['Tables']['product_facts']['Row']

interface Props {
  inputs: Omit<DealInputs, 'deal_id'>
  products: Product[]
  pricingModels: PricingModel[]
  cotutorContext: CoTutorPricingContext | null
  powerGraderContext: PowerGraderPricingContext | null
  trustedContext: TrustEdPricingContext | null
  productFacts: Record<string, ProductFact[]>
  onInputsChange: (inputs: Omit<DealInputs, 'deal_id'>) => void
}

const COMPLIANCE_OPTIONS = ['FERPA DPA', 'VPAT/WCAG 2.2 AA', 'LTI 1.3', 'SOC 2 Type II', 'HECVAT']

// CoTutor/PowerGrader/TrustEd formulas only recognize 9 (academic year) or 12 (full year) billing
// months — a different axis from DealInputs.contract_term (renewal length). Defaulting to 9 until
// a dedicated field exists for it — see academicMonthsPerYear() in pricing-engine.ts.
const ACADEMIC_MONTHS_PER_YEAR = 9

// TrustEd is an addon on top of the full suite, not a standalone pick — it only ever prices
// meaningfully once CoTutor+PowerGrader+ExamSpace are all in the deal (its formula's freebie
// lever is keyed off CoTutor specifically, and its go-to-market framing is "suite integrity
// layer," not a product sold alone).
const TRUSTED_GATE_SLUGS = ['cotutor', 'powergrader', 'examspace']

const OPTION_ROLE_LABEL: Record<string, string> = {
  cotutor: 'Guided AI Assistant',
  powergrader: 'Grading',
  examspace: 'Secure Exam Environment',
}

// Quick-select presets — a shortcut on top of the existing à-la-carte selection, not a separate
// pricing engine. Each preset just checks the right boxes; every product still prices through its
// own formula and shows as its own line on the receipt (CoTutor's per-student rate, PowerGrader's
// platform cost, TrustEd's per-assignment cost — additive, nothing blended into one bundle number).
// Tier 3 includes ExamSpace because TrustEd's own unlock rule requires it alongside CoTutor and
// PowerGrader — see TRUSTED_GATE_SLUGS.
const TIER_PRESETS: { id: string; label: string; sublabel: string; slugs: string[] }[] = [
  { id: 'tier1', label: 'Tier 1', sublabel: 'CoTutor only', slugs: ['cotutor'] },
  { id: 'tier2', label: 'Tier 2', sublabel: '+ PowerGrader', slugs: ['cotutor', 'powergrader'] },
  { id: 'tier3', label: 'Tier 3', sublabel: '+ ExamSpace + TrustEd', slugs: ['cotutor', 'powergrader', 'examspace', 'trusted'] },
]

function defaultSelectedProduct(p: Product): SelectedProduct {
  const base: SelectedProduct = { product_id: p.id, product_slug: p.slug, product_name: p.name }
  switch (p.slug) {
    // ai_model intentionally left unset — buildProductLines() falls back to the config's
    // default model (cotutor_ai_models.is_default) when none is chosen.
    case 'cotutor':     return { ...base, assignments_per_course: 4 }
    case 'powergrader': return { ...base, pages_per_instruction: 0.5, pages_per_submission: 6, assignments_per_month: 5, pages_per_quiz_instruction: 0.5, pages_per_quiz_submission: 1, quizzes_per_month: 1, lms_platform: 'Canvas' }
    case 'trusted':     return { ...base, trusted_assignments_per_month: 4, video_playback: false }
    case 'examspace':   return { ...base, examspace_tier: 'Medium', gpu_requirement: false }
    default: return base
  }
}

export function QuoteInputsPanel({ inputs, products, pricingModels, cotutorContext, powerGraderContext, trustedContext, productFacts, onInputsChange }: Props) {
  const [suiteExpanded, setSuiteExpanded] = useState(true)
  const [inputsExpanded, setInputsExpanded] = useState(true)
  const [termsExpanded, setTermsExpanded] = useState(false)
  const [discountExpanded, setDiscountExpanded] = useState(true)

  function update(partial: Partial<Omit<DealInputs, 'deal_id'>>) {
    onInputsChange({ ...inputs, ...partial })
  }

  const selectedSlugs = new Set(inputs.selected_products.map((s) => s.product_slug))
  const trustedUnlocked = TRUSTED_GATE_SLUGS.every((slug) => selectedSlugs.has(slug))

  function toggleProduct(p: Product) {
    const exists = inputs.selected_products.find((s) => s.product_id === p.id)
    if (exists) {
      let next = inputs.selected_products.filter((s) => s.product_id !== p.id)
      // Deselecting one of TrustEd's gate products drops TrustEd too — it can't remain priced
      // without the suite it depends on.
      if (TRUSTED_GATE_SLUGS.includes(p.slug)) {
        next = next.filter((s) => s.product_slug !== 'trusted')
      }
      update({ selected_products: next })
    } else {
      let newSel = defaultSelectedProduct(p)
      // CoTutor's assignments_per_course and PowerGrader's assignments_per_month are the same
      // shared "Assignments/mo" field in the UI — if the other one is already in the deal,
      // inherit its value instead of this product's own default, so the single displayed field
      // always matches what both formulas actually use (defaults differ: CoTutor 4, PowerGrader 5).
      if (p.slug === 'cotutor') {
        const pg = inputs.selected_products.find((s) => s.product_slug === 'powergrader')
        if (pg?.assignments_per_month != null) newSel = { ...newSel, assignments_per_course: pg.assignments_per_month }
      } else if (p.slug === 'powergrader') {
        const ct = inputs.selected_products.find((s) => s.product_slug === 'cotutor')
        if (ct?.assignments_per_course != null) newSel = { ...newSel, assignments_per_month: ct.assignments_per_course }
      }
      update({ selected_products: [...inputs.selected_products, newSel] })
    }
  }
  function updateSel(productId: string, patch: Partial<SelectedProduct>) {
    update({ selected_products: inputs.selected_products.map((s) => s.product_id === productId ? { ...s, ...patch } : s) })
  }
  function applyTierPreset(slugs: string[]) {
    const next: SelectedProduct[] = []
    for (const slug of slugs) {
      const p = products.find((pr) => pr.slug === slug)
      if (!p) continue
      const existing = inputs.selected_products.find((s) => s.product_slug === slug)
      if (existing) { next.push(existing); continue }
      let newSel = defaultSelectedProduct(p)
      // Same shared assignments/mo sync as toggleProduct() — avoid landing on mismatched
      // defaults (CoTutor 4 vs PowerGrader 5) when a preset adds both at once.
      if (slug === 'cotutor') {
        const pg = next.find((s) => s.product_slug === 'powergrader') ?? inputs.selected_products.find((s) => s.product_slug === 'powergrader')
        if (pg?.assignments_per_month != null) newSel = { ...newSel, assignments_per_course: pg.assignments_per_month }
      } else if (slug === 'powergrader') {
        const ct = next.find((s) => s.product_slug === 'cotutor') ?? inputs.selected_products.find((s) => s.product_slug === 'cotutor')
        if (ct?.assignments_per_course != null) newSel = { ...newSel, assignments_per_month: ct.assignments_per_course }
      }
      next.push(newSel)
    }
    update({ selected_products: next })
  }
  function findPrice(tierName: string, pricingType?: string): number | null {
    return pricingModels.find((m) => m.tier_name === tierName && (pricingType ? m.pricing_type === pricingType : true))?.default_price ?? null
  }

  const hasExamspace = selectedSlugs.has('examspace')
  const hasCotutor = selectedSlugs.has('cotutor')
  const productCount = inputs.selected_products.length

  const orderedProducts = [...products].sort((a, b) => {
    if (a.slug === 'trusted') return 1
    if (b.slug === 'trusted') return -1
    return 0
  })

  return (
    <div className="divide-y divide-neutral-100">

      <Section label="Apporto AI Suite" expanded={suiteExpanded} onToggle={() => setSuiteExpanded((e) => !e)}>
        <div className="space-y-4">
          {/* Quick-select — shortcut on top of à-la-carte selection below, not a separate
              pricing engine. Each product still prices through its own formula. */}
          <div className="grid grid-cols-3 gap-1.5">
            {TIER_PRESETS.map((tier) => {
              const isActive = selectedSlugs.size === tier.slugs.length && tier.slugs.every((s) => selectedSlugs.has(s))
              return (
                <button
                  key={tier.id}
                  onClick={() => applyTierPreset(tier.slugs)}
                  className={cn(
                    'rounded-lg border px-2 py-2 text-left transition-colors',
                    isActive ? 'border-brand-400 bg-brand-50' : 'border-neutral-200 hover:border-brand-200'
                  )}
                >
                  <div className="text-xs font-semibold text-neutral-900">{tier.label}</div>
                  <div className="text-xs text-neutral-400">{tier.sublabel}</div>
                </button>
              )
            })}
          </div>

          {/* Step 1: options */}
          <div className="space-y-1.5">
            <p className="text-xs text-neutral-400">Select the products in this deal.</p>
            {orderedProducts.map((p) => {
              const sel = inputs.selected_products.find((s) => s.product_id === p.id)
              const isSelected = !!sel
              const isTrusted = p.slug === 'trusted'
              const locked = isTrusted && !trustedUnlocked

              return (
                <button
                  key={p.id}
                  onClick={() => !locked && toggleProduct(p)}
                  disabled={locked}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2.5 text-left rounded-lg border transition-colors',
                    locked ? 'border-neutral-100 bg-neutral-50 cursor-not-allowed opacity-60'
                      : isSelected ? 'border-brand-300 bg-brand-50' : 'border-neutral-200 hover:border-brand-200'
                  )}
                >
                  <div className={cn('w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors', isSelected ? 'bg-brand-600 border-brand-600' : 'border-neutral-300')}>
                    {isSelected && <div className="w-2 h-2 bg-white rounded-sm" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-neutral-900">{p.name}</span>
                      {isTrusted && <span className="text-xs bg-neutral-100 text-neutral-500 px-1.5 py-0.5 rounded-full">Addon</span>}
                    </div>
                    <span className="text-xs text-neutral-400">{OPTION_ROLE_LABEL[p.slug] ?? p.category}</span>
                  </div>
                  {locked && (
                    <span className="ml-auto flex items-center gap-1 text-xs text-neutral-400 flex-shrink-0">
                      <Lock className="w-3 h-3" /> Needs CoTutor + PowerGrader + ExamSpace
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Step 2: consolidated configuration — shared fields once at top, product-specific
              fields grouped below, all overrides together at the bottom. Not just the old
              per-product accordions flattened into a list. */}
          {productCount > 0 && (() => {
            const cotutorSel = inputs.selected_products.find((s) => s.product_slug === 'cotutor')
            const powerGraderSel = inputs.selected_products.find((s) => s.product_slug === 'powergrader')
            const hasPowergrader = !!powerGraderSel

            // CoTutor's field is named assignments_per_course for historical reasons but is
            // consumed as assignments-per-month everywhere it's used — same unit as
            // PowerGrader's assignments_per_month, so one shared input drives both.
            const sharedAssignmentsPerMonth = cotutorSel?.assignments_per_course ?? powerGraderSel?.assignments_per_month ?? 4
            function updateSharedAssignments(v: number) {
              if (cotutorSel) updateSel(cotutorSel.product_id, { assignments_per_course: v })
              if (powerGraderSel) updateSel(powerGraderSel.product_id, { assignments_per_month: v })
            }

            return (
              <div className="space-y-4 border-t border-neutral-100 pt-4">
                <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Configuration</p>

                {/* Shared, deal-wide context first */}
                {hasPowergrader && (
                  <Row label="LMS platform">
                    <select className="select-base" value={powerGraderSel!.lms_platform ?? 'Canvas'} onChange={(e) => updateSel(powerGraderSel!.product_id, { lms_platform: e.target.value as SelectedProduct['lms_platform'] })}>
                      <option>Canvas</option>
                      <option>D2L</option>
                      <option>Blackboard</option>
                      <option>Moodle</option>
                    </select>
                    {powerGraderSel!.lms_platform === 'D2L' && <Warn>D2L has known integration challenges — flag for tech review.</Warn>}
                    {(powerGraderSel!.lms_platform === 'Blackboard' || powerGraderSel!.lms_platform === 'Moodle') && <Warn>{powerGraderSel!.lms_platform} support is limited — confirm integration readiness.</Warn>}
                  </Row>
                )}
                {(cotutorSel || powerGraderSel) && (
                  <Row label="Assignments/mo">
                    <input type="number" className="select-base" min={0} value={sharedAssignmentsPerMonth} onChange={(e) => updateSharedAssignments(Number(e.target.value) || 0)} />
                    <p className="text-xs text-neutral-400 mt-0.5">
                      {cotutorSel && powerGraderSel ? 'Shared by CoTutor and PowerGrader.' : cotutorSel ? 'CoTutor.' : 'PowerGrader (assignments, not quizzes).'}
                    </p>
                  </Row>
                )}

                {/* Product-specific fields — only what's left after hoisting the shared ones above */}
                {inputs.selected_products.map((sel) => {
                  const p = products.find((pr) => pr.id === sel.product_id)
                  if (!p) return null
                  return (
                    <div key={sel.product_id} className="space-y-2">
                      <div className="text-xs font-semibold text-neutral-700">{p.name}</div>

                      {p.slug === 'cotutor' && (
                        <CoTutorFields sel={sel} inputs={inputs} cotutorContext={cotutorContext} onChange={(patch) => updateSel(p.id, patch)} />
                      )}
                      {p.slug === 'powergrader' && (
                        <PowerGraderFields sel={sel} inputs={inputs} powerGraderContext={powerGraderContext} onChange={(patch) => updateSel(p.id, patch)} />
                      )}
                      {p.slug === 'trusted' && (
                        <TrustEdFields sel={sel} inputs={inputs} hasCotutor={hasCotutor} trustedContext={trustedContext} onChange={(patch) => updateSel(p.id, patch)} />
                      )}
                      {p.slug === 'examspace' && (
                        <ExamSpaceFields sel={sel} findPrice={findPrice} onChange={(patch) => updateSel(p.id, patch)} />
                      )}

                      <ProductIntel product={p} facts={productFacts[p.id] ?? []} />
                    </div>
                  )
                })}

                {/* All price overrides together, once, at the bottom */}
                <div className="space-y-2 border-t border-neutral-100 pt-3">
                  <div className="text-xs font-semibold text-neutral-700">Price overrides</div>
                  <p className="text-xs text-neutral-400">Leave blank to use the formula-derived price.</p>
                  {inputs.selected_products.map((sel) => {
                    const p = products.find((pr) => pr.id === sel.product_id)
                    if (!p) return null
                    if (p.slug === 'trusted' && trustedContext?.assumptions.free_with_cotutor && hasCotutor) return null
                    return (
                      <Row key={sel.product_id} label={p.name}>
                        <div className="flex items-center">
                          <span className="inline-flex items-center px-2 h-8 rounded-l-md border border-r-0 border-neutral-300 bg-neutral-50 text-neutral-500 text-xs select-none">$</span>
                          <input type="number" className="select-base rounded-l-none border-l-0" placeholder="Config default" value={sel.override_price ?? ''} onChange={(e) => updateSel(sel.product_id, { override_price: e.target.value ? Number(e.target.value) : undefined })} min={0} step={0.01} />
                        </div>
                      </Row>
                    )
                  })}
                </div>
              </div>
            )
          })()}
        </div>
      </Section>

      <Section label="Deal inputs" expanded={inputsExpanded} onToggle={() => setInputsExpanded((e) => !e)}>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <NumField label="Students" value={inputs.student_count} onChange={(v) => update({ student_count: v })} />
            <NumField label="Faculty" value={inputs.faculty_count} onChange={(v) => update({ faculty_count: v })} />
          </div>
          <NumField label="Course sections" value={inputs.course_sections} onChange={(v) => update({ course_sections: v })} />

          {hasExamspace && (
            <div className="grid grid-cols-2 gap-2">
              <NumField label="Exam days/yr" value={inputs.exam_days} onChange={(v) => update({ exam_days: v })} />
              <NumField label="Seats/exam day" value={inputs.seats_per_exam_day} onChange={(v) => update({ seats_per_exam_day: v })} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label-base">Customer status</label>
              <div className="flex gap-1">
                {(['new', 'existing'] as const).map((s) => (
                  <button key={s} onClick={() => update({ customer_status: s })} className={cn('flex-1 py-1.5 text-xs font-medium rounded border capitalize transition-colors', inputs.customer_status === s ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-neutral-600 border-neutral-200 hover:border-brand-300')}>
                    {s === 'new' ? 'Pilot' : 'Existing'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label-base">Contract term</label>
              <select className="select-base" value={inputs.contract_term ?? 'annual'} onChange={(e) => update({ contract_term: e.target.value as DealInputs['contract_term'] })}>
                <option value="annual">Annual</option>
                <option value="2-year">2-Year</option>
                <option value="3-year">3-Year</option>
              </select>
            </div>
          </div>

          {inputs.customer_status === 'new' && hasExamspace && (
            <p className="text-xs text-amber-600">ExamSpace: platform fee ($1,200/yr) + pilot setup fee ($2,500) added for pilot customers.</p>
          )}
          {(inputs.contract_term === '2-year' || inputs.contract_term === '3-year') && (
            <p className="text-xs text-neutral-400">Multi-year terms require Finance review for revenue recognition treatment.</p>
          )}
        </div>
      </Section>

      <Section
        label="Deal terms"
        expanded={termsExpanded}
        onToggle={() => setTermsExpanded((e) => !e)}
        badge={productCount >= 2 ? `${productCount} products` : undefined}
      >
        <div className="space-y-3">
          {productCount >= 4 && (
            <p className="text-xs text-emerald-700 bg-emerald-50 rounded px-2.5 py-2 border border-emerald-200">
              Full Suite (4 products) — 20% bundle discount confirmed. Stacked discounts above 15% require VP; above 16% require CFO.
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label-base">True-up/down clause</label>
              <select className="select-base" value={inputs.true_up_clause ? 'yes' : 'no'} onChange={(e) => update({ true_up_clause: e.target.value === 'yes' })}>
                <option value="no">Excluded</option>
                <option value="yes">Included</option>
              </select>
            </div>
            <div>
              <label className="label-base">TCO multiplier</label>
              <select className="select-base" value={inputs.tco_multiplier ?? 1.6} onChange={(e) => update({ tco_multiplier: Number(e.target.value) })}>
                <option value={1.4}>1.4× — minimal overhead</option>
                <option value={1.6}>1.6× — typical managed</option>
                <option value={1.9}>1.9× — heavy integration</option>
              </select>
            </div>
          </div>
          {inputs.true_up_clause && (
            <p className="text-xs text-neutral-400">True-down clauses reduce revenue if adoption declines. Pair with Customer Success motion — flag for Finance.</p>
          )}

          <div>
            <label className="label-base">Compliance requirements</label>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 mt-1">
              {COMPLIANCE_OPTIONS.map((req) => {
                const checked = (inputs.compliance_requirements ?? []).includes(req)
                return (
                  <label key={req} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-3.5 h-3.5 accent-brand-600"
                      checked={checked}
                      onChange={() => update({ compliance_requirements: checked ? (inputs.compliance_requirements ?? []).filter((r) => r !== req) : [...(inputs.compliance_requirements ?? []), req] })}
                    />
                    <span className="text-xs text-neutral-700">{req}</span>
                  </label>
                )
              })}
            </div>
          </div>
        </div>
      </Section>

      <Section label="Discount" expanded={discountExpanded} onToggle={() => setDiscountExpanded((e) => !e)}>
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label-base mb-0">Discount %</label>
              <span className="text-sm font-semibold text-neutral-900">{inputs.discount_percent}%</span>
            </div>
            <input type="range" min={0} max={30} step={0.5} value={inputs.discount_percent} onChange={(e) => update({ discount_percent: Number(e.target.value) })} className="w-full accent-brand-600" />
            <div className="flex gap-1 mt-2">
              {[0, 5, 10, 15, 20].map((v) => (
                <button key={v} onClick={() => update({ discount_percent: v })} className={cn('flex-1 text-xs py-1 rounded border transition-colors', inputs.discount_percent === v ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-neutral-500 border-neutral-200 hover:border-brand-300')}>
                  {v}%
                </button>
              ))}
            </div>
          </div>

          {productCount >= 2 && (() => {
            const suggested = ({ 2: 10, 3: 15, 4: 20 } as Record<number, number>)[Math.min(productCount, 4)]
            if (!suggested || inputs.discount_percent >= suggested) return null
            return (
              <p className="text-xs text-emerald-700 bg-emerald-50 rounded px-2.5 py-2 border border-emerald-200">
                Bundle ({productCount} products): {suggested}% suggested.{' '}
                <button onClick={() => update({ discount_percent: suggested })} className="font-semibold underline">Apply</button>
              </p>
            )
          })()}

          <ApprovalBadge discount={inputs.discount_percent} />

          {hasExamspace && (
            <p className="text-xs text-neutral-400">ExamSpace volume bands: 3% at $50K, 5% at $100K, 7% at $150K. Verify combined margin when stacking.</p>
          )}
        </div>
      </Section>
    </div>
  )
}

function CoTutorFields({ sel, inputs, cotutorContext, onChange }: {
  sel: SelectedProduct
  inputs: Omit<DealInputs, 'deal_id'>
  cotutorContext: CoTutorPricingContext | null
  onChange: (patch: Partial<SelectedProduct>) => void
}) {
  if (!cotutorContext) return <p className="text-xs text-amber-600">CoTutor pricing assumptions still loading…</p>

  const models = cotutorContext.models
  const defaultModelId = models.find((m) => m.is_default)?.model_id ?? models[0]?.model_id
  const selectedModelId = sel.ai_model ?? defaultModelId
  const byProvider = new Map<string, typeof models>()
  for (const m of models) {
    const list = byProvider.get(m.provider) ?? []
    list.push(m)
    byProvider.set(m.provider, list)
  }
  const assignmentsPerMonth = sel.assignments_per_course ?? 4
  const calc = inputs.student_count > 0
    ? calculateCoTutorPrice(inputs.student_count, assignmentsPerMonth, ACADEMIC_MONTHS_PER_YEAR, selectedModelId, cotutorContext)
    : null

  return (
    <>
      <Row label="AI model">
        <select className="select-base" value={selectedModelId} onChange={(e) => onChange({ ai_model: e.target.value })}>
          {[...byProvider.entries()].map(([provider, list]) => (
            <optgroup key={provider} label={provider}>
              {list.map((m) => (
                <option key={m.model_id} value={m.model_id}>
                  {m.label} — ${m.input_rate_per_1m.toFixed(2)}/${m.output_rate_per_1m.toFixed(2)} per M tok
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </Row>
      {calc && (
        <p className="text-xs text-neutral-400 mt-0.5">
          Formula price: ${calc.customerPricePerStudentPerYear.toFixed(2)}/student/yr
          {' '}(COGS ${calc.totalBlendedCogsPerStudentPerYear.toFixed(2)}, target margin {(cotutorContext.assumptions.target_gross_margin * 100).toFixed(1)}%)
        </p>
      )}
      {sel.override_price != null && calc && sel.override_price < calc.customerPricePerStudentPerYear && (
        <Warn>Override is below the formula-derived price — actual margin will be lower than the {(cotutorContext.assumptions.target_gross_margin * 100).toFixed(1)}% target. Verify before quoting.</Warn>
      )}
    </>
  )
}

function PowerGraderFields({ sel, inputs, powerGraderContext, onChange }: {
  sel: SelectedProduct
  inputs: Omit<DealInputs, 'deal_id'>
  powerGraderContext: PowerGraderPricingContext | null
  onChange: (patch: Partial<SelectedProduct>) => void
}) {
  if (!powerGraderContext) return <p className="text-xs text-amber-600">PowerGrader pricing assumptions still loading…</p>

  const pagesPerInstruction = sel.pages_per_instruction ?? 0.5
  const pagesPerSubmission = sel.pages_per_submission ?? 6
  const assignmentsPerMonth = sel.assignments_per_month ?? 5
  const pagesPerQuizInstruction = sel.pages_per_quiz_instruction ?? 0.5
  const pagesPerQuizSubmission = sel.pages_per_quiz_submission ?? 1
  const quizzesPerMonth = sel.quizzes_per_month ?? 1

  const calc = inputs.student_count > 0
    ? calculatePowerGraderPrice(inputs.student_count, pagesPerInstruction, pagesPerSubmission, assignmentsPerMonth, pagesPerQuizInstruction, pagesPerQuizSubmission, quizzesPerMonth, powerGraderContext)
    : null

  return (
    <>
      <p className="text-xs text-neutral-400">Assignments</p>
      <div className="grid grid-cols-2 gap-2">
        <Row label="Instr. pages">
          <input type="number" className="select-base" min={0} step={0.5} value={pagesPerInstruction} onChange={(e) => onChange({ pages_per_instruction: Number(e.target.value) || 0 })} />
        </Row>
        <Row label="Sub. pages">
          <input type="number" className="select-base" min={0} step={0.5} value={pagesPerSubmission} onChange={(e) => onChange({ pages_per_submission: Number(e.target.value) || 0 })} />
        </Row>
      </div>

      <p className="text-xs text-neutral-400 mt-2">Quizzes / exams</p>
      <div className="grid grid-cols-2 gap-2">
        <Row label="Instr. pages">
          <input type="number" className="select-base" min={0} step={0.5} value={pagesPerQuizInstruction} onChange={(e) => onChange({ pages_per_quiz_instruction: Number(e.target.value) || 0 })} />
        </Row>
        <Row label="Sub. pages">
          <input type="number" className="select-base" min={0} step={0.5} value={pagesPerQuizSubmission} onChange={(e) => onChange({ pages_per_quiz_submission: Number(e.target.value) || 0 })} />
        </Row>
      </div>
      <Row label="Quizzes/month">
        <input type="number" className="select-base" min={0} value={quizzesPerMonth} onChange={(e) => onChange({ quizzes_per_month: Number(e.target.value) || 0 })} />
      </Row>

      {calc && (
        <p className="text-xs text-neutral-400 mt-0.5">
          Formula price: ${calc.monthlyPlatformCost.toLocaleString()}/mo (${calc.costPerStudentPerMonth.toFixed(2)}/student/mo) — COGS ${calc.monthlyCogs.toLocaleString()}/mo
        </p>
      )}
    </>
  )
}

function TrustEdFields({ sel, inputs, hasCotutor, trustedContext, onChange }: {
  sel: SelectedProduct
  inputs: Omit<DealInputs, 'deal_id'>
  hasCotutor: boolean
  trustedContext: TrustEdPricingContext | null
  onChange: (patch: Partial<SelectedProduct>) => void
}) {
  if (!trustedContext) return <p className="text-xs text-amber-600">TrustEd pricing assumptions still loading…</p>

  const assignmentsPerMonth = sel.trusted_assignments_per_month ?? 4
  const calc = inputs.student_count > 0
    ? calculateTrustEdPrice(inputs.student_count, assignmentsPerMonth, hasCotutor, trustedContext)
    : null

  return (
    <>
      <Row label="Assignments analyzed/mo">
        <input type="number" className="select-base" min={0} value={assignmentsPerMonth} onChange={(e) => onChange({ trusted_assignments_per_month: Number(e.target.value) || 0 })} />
        <p className="text-xs text-neutral-400 mt-0.5">Starting point: ExamSpace assignments where students are analyzed and aware of it.</p>
      </Row>
      <Row label="Video playback">
        <select className="select-base" value={sel.video_playback ? 'yes' : 'no'} onChange={(e) => onChange({ video_playback: e.target.value === 'yes' })}>
          <option value="no">Excluded</option>
          <option value="yes">Included (+$6/student/yr)</option>
        </select>
      </Row>

      {calc && (
        calc.isFree ? (
          <p className="text-xs text-emerald-600 mt-0.5">Included free with CoTutor (COGS ${calc.annualCogs.toLocaleString()}/yr absorbed, not billed).</p>
        ) : (
          <p className="text-xs text-neutral-400 mt-0.5">
            Formula price: ${calc.pricePerStudentPerYear.toFixed(2)}/student/yr ({calc.totalAssignmentsPerYear.toLocaleString()} assignments/yr, COGS ${calc.cogsPerAssignment.toFixed(3)}/assignment)
          </p>
        )
      )}
    </>
  )
}

function ExamSpaceFields({ sel, findPrice, onChange }: {
  sel: SelectedProduct
  findPrice: (tierName: string, pricingType?: string) => number | null
  onChange: (patch: Partial<SelectedProduct>) => void
}) {
  return (
    <>
      <Row label="Tier">
        <select className="select-base" value={sel.examspace_tier ?? 'Medium'} onChange={(e) => onChange({ examspace_tier: e.target.value })}>
          <option value="Container">Container (browser only) — ${findPrice('Container', 'per_student') ?? '—'}/student/yr</option>
          <option value="Linux">Linux — ${findPrice('Linux', 'per_student') ?? '—'}/student/yr</option>
          <option value="Small">Small (Windows) — ${findPrice('Small', 'per_student') ?? '—'}/student/yr</option>
          <option value="Medium">Medium — ${findPrice('Medium', 'per_student') ?? '—'}/student/yr</option>
          <option value="Large">Large — ${findPrice('Large', 'per_student') ?? '—'}/student/yr</option>
          <option value="GPU">GPU (Windows) — ${findPrice('GPU', 'per_student') ?? '—'}/student/yr</option>
        </select>
        <p className="text-xs text-neutral-400 mt-0.5">Billed $/student/year, not $/seat-day.</p>
      </Row>
      <Row label="GPU required">
        <select className="select-base" value={sel.gpu_requirement ? 'yes' : 'no'} onChange={(e) => onChange({ gpu_requirement: e.target.value === 'yes' })}>
          <option value="no">No — standard compute</option>
          <option value="yes">Yes — GPU workload</option>
        </select>
        {sel.gpu_requirement && sel.examspace_tier !== 'GPU' && <Warn>GPU flagged but non-GPU tier selected — verify.</Warn>}
      </Row>
    </>
  )
}

function Section({ label, expanded, onToggle, children, badge }: {
  label: string; expanded: boolean; onToggle: () => void; children: React.ReactNode; badge?: string
}) {
  return (
    <div>
      <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-3 hover:bg-neutral-50 transition-colors">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">{label}</span>
          {badge && <span className="text-xs bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded-full font-medium">{badge}</span>}
        </div>
        {expanded ? <ChevronDown className="w-3.5 h-3.5 text-neutral-400" /> : <ChevronRight className="w-3.5 h-3.5 text-neutral-400" />}
      </button>
      {expanded && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <label className="text-xs text-neutral-500 w-28 flex-shrink-0 pt-1.5">{label}</label>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="label-base">{label}</label>
      <input type="number" className="input-base py-1.5 text-sm" value={value || ''} placeholder="0" onChange={(e) => onChange(Number(e.target.value) || 0)} min={0} />
    </div>
  )
}


function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 rounded px-2 py-1.5 border border-amber-200 mt-1">
      <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  )
}

function ProductIntel({ product, facts }: { product: Product; facts: ProductFact[] }) {
  const [open, setOpen] = useState(false)

  const claims       = facts.filter((f) => f.fact_type === 'sales_safe_claim')
  const capabilities = facts.filter((f) => f.fact_type === 'capability')
  const risks        = facts.filter((f) => f.fact_type === 'known_risk')
  const integrations = facts.filter((f) => f.fact_type === 'integration')

  const hasAnything = product.positioning || claims.length || capabilities.length || risks.length || integrations.length
  if (!hasAnything) return null

  return (
    <div className="mt-2 border-t border-neutral-100 pt-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-700 transition-colors"
      >
        <BookOpen className="w-3 h-3" />
        Product intel
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      </button>

      {open && (
        <div className="mt-2 space-y-3">
          {product.positioning && (
            <p className="text-xs text-neutral-600 leading-relaxed italic">{product.positioning}</p>
          )}

          {risks.length > 0 && (
            <div>
              {risks.map((f) => (
                <Warn key={f.id}>{f.content}</Warn>
              ))}
            </div>
          )}

          {claims.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <CheckCircle className="w-3 h-3 text-emerald-600" />
                <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Sales-safe claims</span>
              </div>
              {claims.map((f) => (
                <div key={f.id} className="flex gap-1.5 text-xs text-neutral-700 leading-relaxed">
                  <span className="text-neutral-300 flex-shrink-0">·</span>
                  <span>{f.content}</span>
                </div>
              ))}
            </div>
          )}

          {capabilities.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <Info className="w-3 h-3 text-brand-600" />
                <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Capabilities</span>
              </div>
              {capabilities.map((f) => (
                <div key={f.id} className="flex gap-1.5 text-xs text-neutral-700 leading-relaxed">
                  <span className="text-neutral-300 flex-shrink-0">·</span>
                  <span>{f.content}</span>
                </div>
              ))}
            </div>
          )}

          {integrations.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <Info className="w-3 h-3 text-neutral-400" />
                <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Integrations</span>
              </div>
              {integrations.map((f) => (
                <div key={f.id} className="flex gap-1.5 text-xs text-neutral-700 leading-relaxed">
                  <span className="text-neutral-300 flex-shrink-0">·</span>
                  <span>{f.content}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ApprovalBadge({ discount }: { discount: number }) {
  const { level, cls, range } = discount <= 5
    ? { level: 'Sales', cls: 'text-emerald-700 bg-emerald-50 border-emerald-200', range: '0–5%' }
    : discount <= 10
    ? { level: 'Manager', cls: 'text-blue-700 bg-blue-50 border-blue-200', range: '6–10%' }
    : discount <= 15
    ? { level: 'VP', cls: 'text-amber-700 bg-amber-50 border-amber-200', range: '11–15%' }
    : { level: 'CFO / Executive', cls: 'text-red-700 bg-red-50 border-red-200', range: '16%+' }
  return (
    <div className={cn('flex items-center justify-between text-xs px-2.5 py-2 rounded border', cls)}>
      <span className="flex items-center gap-1.5"><AlertCircle className="w-3 h-3" /> Approval: <span className="font-semibold">{level}</span></span>
      <span className="opacity-60">{range}</span>
    </div>
  )
}
