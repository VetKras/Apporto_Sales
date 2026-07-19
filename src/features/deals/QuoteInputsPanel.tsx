import { useState } from 'react'
import { ChevronDown, ChevronRight, AlertTriangle, AlertCircle, CheckCircle, Info, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { calculateCoTutorPrice, type DealInputs, type SelectedProduct, type PricingModel, type CoTutorPricingContext } from '@/lib/pricing-engine'
import type { Database } from '@/types/database'

type Product = Database['public']['Tables']['products']['Row']
type ProductFact = Database['public']['Tables']['product_facts']['Row']

interface Props {
  inputs: Omit<DealInputs, 'deal_id'>
  products: Product[]
  pricingModels: PricingModel[]
  cotutorContext: CoTutorPricingContext | null
  productFacts: Record<string, ProductFact[]>
  onInputsChange: (inputs: Omit<DealInputs, 'deal_id'>) => void
}

const COMPLIANCE_OPTIONS = ['FERPA DPA', 'VPAT/WCAG 2.2 AA', 'LTI 1.3', 'SOC 2 Type II', 'HECVAT']

// CoTutor's formula only recognizes 9 (academic year) or 12 (full year) billing months — a
// different axis from DealInputs.contract_term (renewal length). Defaulting to 9 until a
// dedicated field exists for it — see calculateCoTutorPrice() in pricing-engine.ts.
const COTUTOR_CONTRACT_MONTHS_PER_YEAR = 9

function defaultSelectedProduct(p: Product): SelectedProduct {
  const base: SelectedProduct = { product_id: p.id, product_slug: p.slug, product_name: p.name }
  switch (p.slug) {
    // ai_model intentionally left unset — buildProductLines() falls back to the config's
    // default model (cotutor_ai_models.is_default) when none is chosen.
    case 'cotutor':    return { ...base, assignments_per_course: 4 }
    case 'powergrader': return { ...base, pricing_type: 'per_student', tier_name: 'Per Student', assignments_per_month: 5, pages_per_submission: 1, lms_platform: 'Canvas' }
    case 'trusted':    return { ...base, trusted_tier: 'Standalone', trusted_assignments_per_month: 4, video_playback: false }
    case 'examspace':  return { ...base, examspace_tier: 'Medium', gpu_requirement: false }
    default: return base
  }
}

export function QuoteInputsPanel({ inputs, products, pricingModels, cotutorContext, productFacts, onInputsChange }: Props) {
  const [productExpanded, setProductExpanded] = useState(true)
  const [inputsExpanded, setInputsExpanded] = useState(true)
  const [termsExpanded, setTermsExpanded] = useState(false)
  const [discountExpanded, setDiscountExpanded] = useState(true)

  function update(partial: Partial<Omit<DealInputs, 'deal_id'>>) {
    onInputsChange({ ...inputs, ...partial })
  }
  function toggleProduct(p: Product) {
    const exists = inputs.selected_products.find((s) => s.product_id === p.id)
    update({ selected_products: exists
      ? inputs.selected_products.filter((s) => s.product_id !== p.id)
      : [...inputs.selected_products, defaultSelectedProduct(p)]
    })
  }
  function updateSel(productId: string, patch: Partial<SelectedProduct>) {
    update({ selected_products: inputs.selected_products.map((s) => s.product_id === productId ? { ...s, ...patch } : s) })
  }
  function findPrice(tierName: string, pricingType?: string): number | null {
    return pricingModels.find((m) => m.tier_name === tierName && (pricingType ? m.pricing_type === pricingType : true))?.default_price ?? null
  }

  const hasExamspace = inputs.selected_products.some((s) => s.product_slug === 'examspace')
  const productCount = inputs.selected_products.length

  return (
    <div className="divide-y divide-neutral-100">

      <Section label="Products" expanded={productExpanded} onToggle={() => setProductExpanded((e) => !e)}>
        <div className="space-y-1.5">
          {products.map((p) => {
            const sel = inputs.selected_products.find((s) => s.product_id === p.id)
            const isSelected = !!sel
            return (
              <div key={p.id} className={cn('rounded-lg border transition-colors', isSelected ? 'border-brand-300 bg-brand-50' : 'border-neutral-200')}>
                <button onClick={() => toggleProduct(p)} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left">
                  <div className={cn('w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors', isSelected ? 'bg-brand-600 border-brand-600' : 'border-neutral-300')}>
                    {isSelected && <div className="w-2 h-2 bg-white rounded-sm" />}
                  </div>
                  <span className="text-sm font-medium text-neutral-900">{p.name}</span>
                  <span className="text-xs text-neutral-400 truncate">{p.category}</span>
                </button>

                {isSelected && sel && (
                  <div className="px-3 pb-3 space-y-2 border-t border-brand-100 pt-2.5">

                    {p.slug === 'cotutor' && (
                      <>
                        {!cotutorContext ? (
                          <p className="text-xs text-amber-600">CoTutor pricing assumptions still loading…</p>
                        ) : (() => {
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
                            ? calculateCoTutorPrice(inputs.student_count, assignmentsPerMonth, COTUTOR_CONTRACT_MONTHS_PER_YEAR, selectedModelId, cotutorContext)
                            : null
                          return (
                            <>
                              <Row label="AI model">
                                <select
                                  className="select-base"
                                  value={selectedModelId}
                                  onChange={(e) => updateSel(p.id, { ai_model: e.target.value })}
                                >
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
                              <Row label="Assignments/mo">
                                <input type="number" className="select-base" min={1} value={sel.assignments_per_course ?? 4} onChange={(e) => updateSel(p.id, { assignments_per_course: Number(e.target.value) || 0 })} />
                              </Row>
                              {calc && (
                                <p className="text-xs text-neutral-400 mt-0.5">
                                  Formula price: ${calc.customerPricePerStudentPerYear.toFixed(2)}/student/yr
                                  {' '}(COGS ${calc.totalBlendedCogsPerStudentPerYear.toFixed(2)}, target margin {(cotutorContext.assumptions.target_gross_margin * 100).toFixed(1)}%)
                                </p>
                              )}
                              <OverrideRow value={sel.override_price} onChange={(v) => updateSel(p.id, { override_price: v })} />
                              {sel.override_price != null && calc && sel.override_price < calc.customerPricePerStudentPerYear && (
                                <Warn>Override is below the formula-derived price — actual margin will be lower than the {(cotutorContext.assumptions.target_gross_margin * 100).toFixed(1)}% target. Verify before quoting.</Warn>
                              )}
                            </>
                          )
                        })()}
                      </>
                    )}

                    {p.slug === 'powergrader' && (
                      <>
                        <Row label="Pricing mode">
                          <select className="select-base" value={sel.pricing_type ?? 'per_student'} onChange={(e) => {
                            const map: Record<string, { type: string; tier: string }> = {
                              per_student: { type: 'per_student', tier: 'Per Student' },
                              per_faculty: { type: 'per_faculty', tier: 'Per Faculty' },
                              per_submission: { type: 'per_submission', tier: 'Per Submission' },
                            }
                            const v = map[e.target.value]
                            updateSel(p.id, { pricing_type: v.type, tier_name: v.tier })
                          }}>
                            <option value="per_student">Per Student (${findPrice('Per Student', 'per_student') ?? '—'}/student/yr)</option>
                            <option value="per_faculty">Per Faculty (${findPrice('Per Faculty', 'per_faculty') ?? '—'}/faculty/yr)</option>
                            <option value="per_submission">Per Submission (${findPrice('Per Submission', 'per_submission') ?? '—'}/submission)</option>
                          </select>
                        </Row>
                        <Row label="Assign./month">
                          <input type="number" className="select-base" min={1} value={sel.assignments_per_month ?? 5} onChange={(e) => updateSel(p.id, { assignments_per_month: Number(e.target.value) || 0 })} />
                        </Row>
                        <Row label="Pages/submission">
                          <select className="select-base" value={sel.pages_per_submission ?? 1} onChange={(e) => updateSel(p.id, { pages_per_submission: Number(e.target.value) as 1 | 6 })}>
                            <option value={1}>1 page (quiz / short answer)</option>
                            <option value={6}>6 pages (research paper)</option>
                          </select>
                          {sel.pages_per_submission === 6 && <Warn>6-page submissions carry ~5× COGS vs 1-page.</Warn>}
                        </Row>
                        <Row label="LMS platform">
                          <select className="select-base" value={sel.lms_platform ?? 'Canvas'} onChange={(e) => updateSel(p.id, { lms_platform: e.target.value as typeof sel.lms_platform })}>
                            <option>Canvas</option>
                            <option>D2L</option>
                            <option>Blackboard</option>
                            <option>Moodle</option>
                          </select>
                          {sel.lms_platform === 'D2L' && <Warn>D2L has known integration challenges — flag for tech review.</Warn>}
                          {(sel.lms_platform === 'Blackboard' || sel.lms_platform === 'Moodle') && <Warn>{sel.lms_platform} support is limited — confirm integration readiness.</Warn>}
                        </Row>
                        <OverrideRow value={sel.override_price} onChange={(v) => updateSel(p.id, { override_price: v })} />
                      </>
                    )}

                    {p.slug === 'trusted' && (
                      <>
                        <Row label="Pricing mode">
                          <select className="select-base" value={sel.trusted_tier ?? 'Standalone'} onChange={(e) => {
                            updateSel(p.id, { trusted_tier: e.target.value, override_price: undefined })
                          }}>
                            <option value="Standalone">Standalone</option>
                            <option value="Bundle Add-on">Bundle Add-on</option>
                          </select>
                          <p className="text-xs text-neutral-400 mt-0.5">Standalone and bundle use different storage/analysis rates — never mix.</p>
                        </Row>
                        <Row label="Base rate ($/student/yr)">
                          <div className="flex items-center">
                            <span className="inline-flex items-center px-2 h-8 rounded-l-md border border-r-0 border-neutral-300 bg-neutral-50 text-neutral-500 text-xs select-none">$</span>
                            <input
                              type="number"
                              className="select-base rounded-l-none border-l-0"
                              min={0}
                              step={0.01}
                              value={sel.override_price ?? findPrice(sel.trusted_tier ?? 'Standalone', 'per_student') ?? ''}
                              placeholder={String(findPrice(sel.trusted_tier ?? 'Standalone', 'per_student') ?? '')}
                              onChange={(e) => updateSel(p.id, { override_price: e.target.value ? Number(e.target.value) : undefined })}
                            />
                          </div>
                          {sel.override_price != null && sel.override_price !== (findPrice(sel.trusted_tier ?? 'Standalone', 'per_student') ?? 0) && (
                            <p className="text-xs text-amber-600 mt-0.5">
                              Custom rate — config default is ${findPrice(sel.trusted_tier ?? 'Standalone', 'per_student') ?? '—'}/student/yr. Verify against approved workbook.
                            </p>
                          )}
                        </Row>
                        <Row label="Assign./month">
                          <input type="number" className="select-base" min={1} value={sel.trusted_assignments_per_month ?? 4} onChange={(e) => updateSel(p.id, { trusted_assignments_per_month: Number(e.target.value) || 0 })} />
                        </Row>
                        <Row label="Video playback">
                          <select className="select-base" value={sel.video_playback ? 'yes' : 'no'} onChange={(e) => updateSel(p.id, { video_playback: e.target.value === 'yes' })}>
                            <option value="no">Excluded</option>
                            <option value="yes">Included (+$6/student/yr)</option>
                          </select>
                          {sel.video_playback && sel.trusted_tier !== 'Standalone' && <Warn>Video playback surcharge only applies to Standalone model.</Warn>}
                        </Row>
                      </>
                    )}

                    {p.slug === 'examspace' && (
                      <>
                        <Row label="Tier">
                          <select className="select-base" value={sel.examspace_tier ?? 'Medium'} onChange={(e) => updateSel(p.id, { examspace_tier: e.target.value })}>
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
                          <select className="select-base" value={sel.gpu_requirement ? 'yes' : 'no'} onChange={(e) => updateSel(p.id, { gpu_requirement: e.target.value === 'yes' })}>
                            <option value="no">No — standard compute</option>
                            <option value="yes">Yes — GPU workload</option>
                          </select>
                          {sel.gpu_requirement && sel.examspace_tier !== 'GPU' && <Warn>GPU flagged but non-GPU tier selected — verify.</Warn>}
                        </Row>
                        <OverrideRow value={sel.override_price} onChange={(v) => updateSel(p.id, { override_price: v })} />
                      </>
                    )}

                    <ProductIntel product={p} facts={productFacts[p.id] ?? []} />
                  </div>
                )}
              </div>
            )
          })}
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

function OverrideRow({ value, onChange }: { value: number | undefined; onChange: (v: number | undefined) => void }) {
  return (
    <Row label="Override price">
      <div className="flex items-center">
        <span className="inline-flex items-center px-2 h-8 rounded-l-md border border-r-0 border-neutral-300 bg-neutral-50 text-neutral-500 text-xs select-none">$</span>
        <input type="number" className="select-base rounded-l-none border-l-0" placeholder="Config default" value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)} min={0} step={0.01} />
      </div>
    </Row>
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
    <div className="mt-3 border-t border-brand-100 pt-2.5">
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
