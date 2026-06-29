import { useState } from 'react'
import { ChevronDown, ChevronRight, AlertTriangle, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { COTUTOR_MODELS, COTUTOR_DEFAULT_MODEL, type DealInputs, type SelectedProduct, type PricingModel } from '@/lib/pricing-engine'
import type { Database } from '@/types/database'

type Product = Database['public']['Tables']['products']['Row']

interface Props {
  inputs: Omit<DealInputs, 'deal_id'>
  products: Product[]
  pricingModels: PricingModel[]
  onInputsChange: (inputs: Omit<DealInputs, 'deal_id'>) => void
}

const COMPLIANCE_OPTIONS = ['FERPA DPA', 'VPAT/WCAG 2.2 AA', 'LTI 1.3', 'SOC 2 Type II', 'HECVAT']

function defaultSelectedProduct(p: Product): SelectedProduct {
  const base: SelectedProduct = { product_id: p.id, product_slug: p.slug, product_name: p.name }
  switch (p.slug) {
    case 'cotutor':    return { ...base, tier_name: 'Campus / Standard', ai_model: COTUTOR_DEFAULT_MODEL, assignments_per_course: 4 }
    case 'powergrader': return { ...base, pricing_type: 'per_student', tier_name: 'Per Student', assignments_per_month: 5, pages_per_submission: 1, lms_platform: 'Canvas' }
    case 'trusted':    return { ...base, trusted_tier: 'Standalone', trusted_assignments_per_month: 4, video_playback: false }
    case 'examspace':  return { ...base, examspace_tier: 'Large', gpu_requirement: false }
    default: return base
  }
}

export function QuoteInputsPanel({ inputs, products, pricingModels, onInputsChange }: Props) {
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

      {/* ── Products ─────────────────────────────────────────────────────── */}
      <Section label="Products" expanded={productExpanded} onToggle={() => setProductExpanded((e) => !e)}>
        <div className="space-y-1.5">
          {products.map((p) => {
            const sel = inputs.selected_products.find((s) => s.product_id === p.id)
            const isSelected = !!sel
            return (
              <div key={p.id} className={cn('rounded-lg border transition-colors', isSelected ? 'border-brand-300 bg-brand-50' : 'border-neutral-200')}>
                {/* Checkbox row */}
                <button onClick={() => toggleProduct(p)} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left">
                  <div className={cn('w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors', isSelected ? 'bg-brand-600 border-brand-600' : 'border-neutral-300')}>
                    {isSelected && <div className="w-2 h-2 bg-white rounded-sm" />}
                  </div>
                  <span className="text-sm font-medium text-neutral-900">{p.name}</span>
                  <span className="text-xs text-neutral-400 truncate">{p.category}</span>
                </button>

                {/* Product-specific config as compact field rows */}
                {isSelected && sel && (
                  <div className="px-3 pb-3 space-y-2 border-t border-brand-100 pt-2.5">

                    {p.slug === 'cotutor' && (
                      <>
                        <Row label="Tier">
                          <select className="select-base" value={sel.tier_name ?? 'Campus / Standard'} onChange={(e) => updateSel(p.id, { tier_name: e.target.value })}>
                            <option value="Departmental / Premium">Departmental / Premium (≤2,000 · ${findPrice('Departmental / Premium', 'per_student') ?? '—'})</option>
                            <option value="Campus / Standard">Campus / Standard (≤5,000 · ${findPrice('Campus / Standard', 'per_student') ?? '—'})</option>
                            <option value="Platform / Entry">Platform / Entry (10k+ · ${findPrice('Platform / Entry', 'per_student') ?? '—'})</option>
                          </select>
                        </Row>
                        <Row label="AI model">
                          {(() => {
                            const selectedModel = COTUTOR_MODELS.find((m) => m.id === (sel.ai_model ?? COTUTOR_DEFAULT_MODEL))
                            const anthropicModels = COTUTOR_MODELS.filter((m) => m.provider === 'Anthropic')
                            const openaiModels = COTUTOR_MODELS.filter((m) => m.provider === 'OpenAI')
                            const cogsRatio = selectedModel
                              ? (selectedModel.inputPricePerMTok / 0.20).toFixed(1)
                              : null
                            return (
                              <>
                                <select
                                  className="select-base"
                                  value={sel.ai_model ?? COTUTOR_DEFAULT_MODEL}
                                  onChange={(e) => updateSel(p.id, { ai_model: e.target.value })}
                                >
                                  <optgroup label="Anthropic">
                                    {anthropicModels.map((m) => (
                                      <option key={m.id} value={m.id}>
                                        {m.label} — ${m.inputPricePerMTok.toFixed(2)}/${m.outputPricePerMTok.toFixed(2)} per M tok
                                      </option>
                                    ))}
                                  </optgroup>
                                  <optgroup label="OpenAI">
                                    {openaiModels.map((m) => (
                                      <option key={m.id} value={m.id}>
                                        {m.label} — ${m.inputPricePerMTok.toFixed(2)}/${m.outputPricePerMTok.toFixed(2)} per M tok
                                      </option>
                                    ))}
                                  </optgroup>
                                </select>
                                {selectedModel && (
                                  <p className="text-xs text-neutral-400 mt-0.5">
                                    {selectedModel.provider} · in ${selectedModel.inputPricePerMTok}/out ${selectedModel.outputPricePerMTok} per M tokens · {cogsRatio}× vs GPT-5.4 Nano baseline
                                  </p>
                                )}
                                {selectedModel && selectedModel.inputPricePerMTok > 1.50 && selectedModel.inputPricePerMTok <= 4.00 && (
                                  <Warn>Moderate COGS ({cogsRatio}× baseline) — verify gross margin before finalizing price.</Warn>
                                )}
                                {selectedModel && selectedModel.inputPricePerMTok > 4.00 && selectedModel.inputPricePerMTok <= 8.00 && (
                                  <Warn>High COGS ({cogsRatio}× baseline) — margin review required before quoting.</Warn>
                                )}
                                {selectedModel && selectedModel.inputPricePerMTok > 8.00 && (
                                  <Warn>Premium COGS ({cogsRatio}× baseline) — requires explicit leadership approval before quoting.</Warn>
                                )}
                              </>
                            )
                          })()}
                        </Row>
                        <Row label="Assignments/course">
                          <input type="number" className="select-base" min={1} value={sel.assignments_per_course ?? 4} onChange={(e) => updateSel(p.id, { assignments_per_course: Number(e.target.value) || 0 })} />
                        </Row>
                        <OverrideRow value={sel.override_price} onChange={(v) => updateSel(p.id, { override_price: v })} />
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
                            // Clear override when mode changes so DB default for new tier shows correctly
                            updateSel(p.id, { trusted_tier: e.target.value, override_price: undefined })
                          }}>
                            <option value="Standalone">Standalone</option>
                            <option value="Bundle Add-on">Bundle Add-on</option>
                          </select>
                          <p className="text-xs text-neutral-400 mt-0.5">Standalone and bundle use different storage/analysis rates — never mix.</p>
                        </Row>
                        <Row label="Base rate ($/student/yr)">
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-neutral-400">$</span>
                            <input
                              type="number"
                              className="select-base pl-5"
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
                          <select className="select-base" value={sel.examspace_tier ?? 'Large'} onChange={(e) => updateSel(p.id, { examspace_tier: e.target.value })}>
                            <option value="Large">Large — 10 apps · $16/seat-day</option>
                            <option value="GPU">GPU — 10 apps · $23/seat-day</option>
                          </select>
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
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Section>

      {/* ── Deal Inputs ──────────────────────────────────────────────────── */}
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
                    {s}
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
            <p className="text-xs text-amber-600">ExamSpace: platform fee ($1,200/yr) + setup fee ($2,500) added for new customers.</p>
          )}
          {(inputs.contract_term === '2-year' || inputs.contract_term === '3-year') && (
            <p className="text-xs text-neutral-400">Multi-year terms require Finance review for revenue recognition treatment.</p>
          )}
        </div>
      </Section>

      {/* ── Deal Terms ───────────────────────────────────────────────────── */}
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

      {/* ── Discount ─────────────────────────────────────────────────────── */}
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

          {/* Bundle suggestion */}
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

// ─── Shared primitives ────────────────────────────────────────────────────────

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
      <input type="number" className="select-base" placeholder="Config default" value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)} min={0} step={0.01} />
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
