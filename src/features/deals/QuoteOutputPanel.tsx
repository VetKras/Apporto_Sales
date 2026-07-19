import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Save, Copy, Lock, Globe, AlertTriangle, FileText, ExternalLink, Info, Sparkles } from 'lucide-react'
import { cn, formatCurrency, formatPercent, approvalColor } from '@/lib/utils'
import { type QuoteResult, type DealInputs } from '@/lib/pricing-engine'
import {
  ProposalTemplate,
  generateProposalText,
  generateProposalSections,
  PROPOSAL_SECTION_KEYS,
  type ProposalSections,
  type ProposalSectionKey,
} from './ProposalTemplate'
import { BattlecardPanel } from './BattlecardPanel'
import { StrategyPanel } from './StrategyPanel'
import type { Database } from '@/types/database'

type Deal = Database['public']['Tables']['deals']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']
type Competitor = Database['public']['Tables']['competitors']['Row']
type MatrixRow = Database['public']['Tables']['competitive_matrix']['Row']
type Product = Database['public']['Tables']['products']['Row']

interface Props {
  deal: Deal
  quoteResult: QuoteResult | null
  mode: 'quote' | 'proposal' | 'battlecard' | 'strategy'
  centerContent: string
  onCenterContentChange: (c: string) => void
  onSaveOutput: (content: string, type: string, classification: 'customer_facing' | 'internal_only' | 'mixed_draft') => void
  profile: Profile | null
  proposalSections: ProposalSections
  onProposalSectionChange: (key: ProposalSectionKey, value: string) => void
  matrix: MatrixRow[]
  competitors: Competitor[]
  products: Product[]
}

function WarningBadge({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  if (onClick) {
    return (
      <button
        onClick={onClick}
        className="w-full flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-2 border border-amber-200 hover:bg-amber-100 hover:border-amber-300 transition-colors text-left group"
      >
        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
        <span className="flex-1">{children}</span>
        <ExternalLink className="w-3 h-3 flex-shrink-0 mt-0.5 opacity-50 group-hover:opacity-100 transition-opacity" />
      </button>
    )
  }
  return (
    <div className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-2 border border-amber-200">
      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  )
}

export function QuoteOutputPanel({ deal, quoteResult, mode, centerContent, onCenterContentChange, onSaveOutput, profile, proposalSections, onProposalSectionChange, matrix, competitors, products }: Props) {
  const selectedProductIds = quoteResult?.lines.map(l => l.product_id) ?? []
  const emptyInputs: Omit<DealInputs, 'deal_id'> = {
    student_count: quoteResult?.inputs_snapshot.student_count ?? 0,
    faculty_count: quoteResult?.inputs_snapshot.faculty_count ?? 0,
    course_sections: quoteResult?.inputs_snapshot.course_sections ?? 0,
    exam_days: quoteResult?.inputs_snapshot.exam_days ?? 0,
    seats_per_exam_day: quoteResult?.inputs_snapshot.seats_per_exam_day ?? 0,
    customer_status: quoteResult?.inputs_snapshot.customer_status ?? 'new',
    discount_percent: quoteResult?.discount_percent ?? 0,
    selected_products: [],
    contract_term: (quoteResult?.assumptions.contract_term as DealInputs['contract_term']) ?? 'annual',
    tco_multiplier: quoteResult?.assumptions.tco_multiplier_used ?? 1.6,
    true_up_clause: quoteResult?.assumptions.true_up_clause ?? false,
    compliance_requirements: quoteResult?.assumptions.compliance_requirements ?? [],
  }
  const navigate = useNavigate()
  const [classification, setClassification] = useState<'customer_facing' | 'internal_only' | 'mixed_draft'>('mixed_draft')
  const [saving, setSaving] = useState(false)

  function getProposalText(): string {
    if (!quoteResult) return ''
    return generateProposalText(deal, quoteResult, proposalSections, profile)
  }

  async function handleSave() {
    setSaving(true)
    const content = mode === 'proposal' ? getProposalText() : centerContent
    if (content) await onSaveOutput(content, mode, classification)
    setSaving(false)
  }

  function handleCopy() {
    const content = mode === 'proposal' ? getProposalText() : centerContent
    if (content) navigator.clipboard.writeText(content)
  }

  if (mode === 'quote') {
    return (
      <div className="p-6 space-y-6">
        {!quoteResult ? (
          <div className="flex flex-col items-center justify-center py-16 text-neutral-400">
            <div className="w-16 h-16 rounded-2xl bg-neutral-100 flex items-center justify-center mb-4">
              <span className="text-3xl">📊</span>
            </div>
            <p className="text-sm font-medium text-neutral-600 mb-1">No quote calculated yet</p>
            <p className="text-xs text-neutral-400">Select products, enter deal inputs, then click Calculate.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 text-xs text-neutral-500 bg-neutral-50 rounded-lg px-3 py-2 border border-neutral-200">
              <span className="font-medium">Config:</span> {quoteResult.config_version_name}
              <span className="ml-2 text-neutral-400">· calculated {new Date().toLocaleString()}</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200">
                    <th className="text-left py-2 pr-4 text-xs font-semibold text-neutral-500 uppercase tracking-wide">Product</th>
                    <th className="text-left py-2 pr-4 text-xs font-semibold text-neutral-500 uppercase tracking-wide">Tier</th>
                    <th className="text-right py-2 pr-4 text-xs font-semibold text-neutral-500 uppercase tracking-wide">Qty</th>
                    <th className="text-right py-2 pr-4 text-xs font-semibold text-neutral-500 uppercase tracking-wide">Unit $</th>
                    <th className="text-right py-2 pr-4 text-xs font-semibold text-neutral-500 uppercase tracking-wide">List</th>
                    <th className="text-right py-2 text-xs font-semibold text-neutral-500 uppercase tracking-wide">Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {(quoteResult.lines ?? []).map((line, i) => (
                    <tr key={i} className="hover:bg-neutral-50">
                      <td className="py-2.5 pr-4 font-medium text-neutral-900">{line.product_name}</td>
                      <td className="py-2.5 pr-4 text-neutral-600 text-xs">{line.tier_label}</td>
                      <td className="py-2.5 pr-4 text-right text-neutral-600">{line.quantity.toLocaleString()} {line.unit.split('/')[0]}</td>
                      <td className="py-2.5 pr-4 text-right text-neutral-600">{formatCurrency(line.unit_price)}</td>
                      <td className="py-2.5 pr-4 text-right text-neutral-700">{formatCurrency(line.list_price)}</td>
                      <td className="py-2.5 text-right font-medium text-neutral-900">{formatCurrency(line.net_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(quoteResult.assumptions.shared_student_cohort_products?.length ?? 0) > 1 && (
                <p className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mt-2">
                  Shared cohort: {quoteResult.inputs_snapshot.student_count.toLocaleString()} students are billed across {quoteResult.assumptions.shared_student_cohort_products.join(', ')} — the same population, not additive headcounts.
                </p>
              )}
            </div>

            <div className="border-t border-neutral-200 pt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500">List total</span>
                <span className="text-neutral-700">{formatCurrency(quoteResult.list_total)}</span>
              </div>
              {quoteResult.discount_percent > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-500">Discount ({quoteResult.discount_percent}%)</span>
                  <span className="text-red-600">-{formatCurrency(quoteResult.discount_amount)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-semibold border-t border-neutral-200 pt-2 mt-2">
                <span className="text-neutral-900">Total ARR</span>
                <span className="text-brand-700">{formatCurrency(quoteResult.final_total)}</span>
              </div>

              {quoteResult.per_student_price != null && (
                <div className="flex justify-between text-sm text-neutral-500">
                  <span>
                    All-in per student
                    {quoteResult.assumptions.shared_student_cohort_products?.length > 1 && (
                      <span className="text-xs text-neutral-400"> (all products, same {quoteResult.inputs_snapshot.student_count.toLocaleString()} students)</span>
                    )}
                  </span>
                  <span>{formatCurrency(quoteResult.per_student_price)}/student/yr</span>
                </div>
              )}
            </div>

            <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
              <div className="flex items-center gap-2 mb-1.5">
                <Info className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-semibold text-blue-900 uppercase tracking-wide">Fair Usage</span>
              </div>
              <p className="text-xs text-blue-800 leading-relaxed">
                Pricing is based on the enrolled student count and course configuration stated in this quote.
                Usage is monitored on a rolling basis. If actual enrollment or usage volume exceeds the
                quoted figures by more than 10%, a true-up adjustment will apply at the next billing
                cycle. CoTutor AI tutoring sessions are subject to a per-student annual cap aligned with
                the quoted tier; reasonable overages are included, but sustained excess usage may trigger
                a tier review. PowerGrader submissions are capped at the assumed pages per submission;
                significantly longer submissions may incur additional processing fees. All usage data is
                shared transparently with the institution through quarterly reports.
              </p>
            </div>

            <div className="badge-internal inline-block mb-2">Internal only</div>
            <div className="grid grid-cols-2 gap-3 p-4 bg-amber-50 rounded-xl border border-amber-200 text-sm">
              <div>
                <div className="label-base">Approval required</div>
                <div className={cn('font-semibold', approvalColor(quoteResult.approval_level))}>
                  {quoteResult.approval_level}
                </div>
              </div>
              {quoteResult.gross_margin_percent != null && (
                <div>
                  <div className="label-base">Gross margin</div>
                  <div className="font-semibold text-neutral-900">{formatPercent(quoteResult.gross_margin_percent)}</div>
                </div>
              )}
              {quoteResult.tco_low != null && (
                <div className="col-span-2">
                  <div className="label-base">TCO range estimate (internal)</div>
                  <div className="text-neutral-700">{formatCurrency(quoteResult.tco_low)} – {formatCurrency(quoteResult.tco_high ?? 0)}</div>
                </div>
              )}
              {quoteResult.bundle_suggestion && !quoteResult.bundle_suggestion.already_applied && (
                <div className="col-span-2 text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2 border border-emerald-200">
                  Bundle suggestion: {quoteResult.bundle_suggestion.product_count} products qualify for {quoteResult.bundle_suggestion.suggested_discount_percent}% discount (not yet applied).
                </div>
              )}
            </div>

            {quoteResult.assumptions && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Assumptions &amp; notes</div>
                <div className="text-xs text-neutral-500 space-y-1 p-3 bg-neutral-50 rounded-lg border border-neutral-200">
                  {(quoteResult.assumptions.shared_student_cohort_products?.length ?? 0) > 1 && (
                    <div className="text-blue-700 font-medium">
                      Student cohort: {quoteResult.inputs_snapshot.student_count.toLocaleString()} students shared across {quoteResult.assumptions.shared_student_cohort_products.join(', ')} — headcounts are not additive.
                    </div>
                  )}
                  {quoteResult.assumptions.estimated_assignments_per_year != null && (
                    <div>Est. assignments/year (sections × 6): {quoteResult.assumptions.estimated_assignments_per_year.toLocaleString()}</div>
                  )}
                  {quoteResult.assumptions.estimated_exam_days_per_year != null && (
                    <div>Est. exam days/year (sections × 2): {quoteResult.assumptions.estimated_exam_days_per_year.toLocaleString()}</div>
                  )}
                  <div>Contract term: {quoteResult.assumptions.contract_term}</div>
                  <div>TCO multiplier: {quoteResult.assumptions.tco_multiplier_used}×</div>
                  {quoteResult.assumptions.true_up_clause && (
                    <div className="text-emerald-600">True-up/down clause included — flag for Finance review.</div>
                  )}
                  {(quoteResult.assumptions.compliance_requirements?.length ?? 0) > 0 && (
                    <div>Compliance: {quoteResult.assumptions.compliance_requirements.join(', ')}</div>
                  )}
                  {quoteResult.assumptions.video_playback_surcharge_per_student != null && (
                    <div className="text-blue-600">TrustEd video playback included (+${quoteResult.assumptions.video_playback_surcharge_per_student}/student/yr — verify in approved pricing sheet).</div>
                  )}
                </div>

                {(quoteResult.assumptions.ai_model_cogs_warning || quoteResult.assumptions.pages_submission_warning || quoteResult.assumptions.lms_integration_risk) && (
                  <div className="space-y-1.5">
                    {quoteResult.assumptions.ai_model_cogs_warning && (
                      <WarningBadge onClick={() => navigate('/settings?tab=admin')}>
                        CoTutor: actual margin ({quoteResult.assumptions.cotutor_margin_percent?.toFixed(1)}%) is running below the {quoteResult.assumptions.cotutor_target_margin_percent?.toFixed(1)}% target — the override price is compressing margin. Verify before sharing with customer.
                      </WarningBadge>
                    )}
                    {quoteResult.assumptions.pages_submission_warning && (
                      <WarningBadge>PowerGrader: 6-page submissions — ~5× cost swing vs 1-page. Always confirm page count with customer.</WarningBadge>
                    )}
                    {quoteResult.assumptions.lms_integration_risk && (
                      <WarningBadge>{quoteResult.assumptions.lms_integration_risk}</WarningBadge>
                    )}
                  </div>
                )}

                <p className="text-xs text-neutral-400 italic pt-1">
                  All figures are reference estimates. Verify against the approved pricing workbook and obtain required discount approval before sharing with any customer.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  if (mode === 'proposal') {
    if (!quoteResult) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
          <div className="w-16 h-16 rounded-2xl bg-neutral-100 flex items-center justify-center mb-4">
            <FileText className="w-7 h-7 text-neutral-300" />
          </div>
          <p className="text-sm font-semibold text-neutral-600 mb-2">No quote selected</p>
          <p className="text-xs text-neutral-400 text-center max-w-xs leading-relaxed">
            Calculate a quote or load a saved quote first. The proposal template will auto-populate with customer details, product descriptions, and pricing.
          </p>
        </div>
      )
    }

    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-neutral-200 bg-neutral-50 flex-shrink-0">
          <select
            className="input-base w-auto py-1 text-xs"
            value={classification}
            onChange={(e) => setClassification(e.target.value as typeof classification)}
          >
            <option value="mixed_draft">Draft (mixed)</option>
            <option value="customer_facing">Customer-facing</option>
            <option value="internal_only">Internal only</option>
          </select>
          {classification === 'internal_only' && (
            <span className="badge-internal flex items-center gap-1"><Lock className="w-3 h-3" />Internal</span>
          )}
          {classification === 'customer_facing' && (
            <span className="badge-customer flex items-center gap-1"><Globe className="w-3 h-3" />Customer</span>
          )}
          <div className="ml-auto flex gap-2">
            <button
              className="btn-secondary py-1.5 text-xs"
              onClick={() => {
                if (!quoteResult) return
                const generated = generateProposalSections(deal, quoteResult, profile)
                PROPOSAL_SECTION_KEYS.forEach((key) => {
                  if (generated[key]) onProposalSectionChange(key, generated[key])
                })
              }}
              title="Fill proposal sections from quote data (no AI required)"
            >
              <Sparkles className="w-3.5 h-3.5" /> Auto-fill
            </button>
            <button className="btn-ghost py-1 text-xs" onClick={handleCopy}>
              <Copy className="w-3.5 h-3.5" /> Copy as text
            </button>
            <button className="btn-secondary py-1.5 text-xs" onClick={handleSave} disabled={saving}>
              <Save className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-10 py-10 bg-white">
          <ProposalTemplate
            deal={deal}
            quoteResult={quoteResult}
            profile={profile}
            sections={proposalSections}
            onSectionChange={onProposalSectionChange}
          />
        </div>
      </div>
    )
  }

  // ── Battlecard ───────────────────────────────────────────────────────────────────────────────
  if (mode === 'battlecard') {
    if (!quoteResult) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
          <div className="w-16 h-16 rounded-2xl bg-neutral-100 flex items-center justify-center mb-4">
            <FileText className="w-7 h-7 text-neutral-300" />
          </div>
          <p className="text-sm font-semibold text-neutral-600 mb-2">No quote selected</p>
          <p className="text-xs text-neutral-400 text-center max-w-xs leading-relaxed">
            Calculate a quote first. The battlecard will populate with competitive intelligence for the selected products.
          </p>
        </div>
      )
    }
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-neutral-200 bg-neutral-50 flex-shrink-0">
          <select
            className="input-base w-auto py-1 text-xs"
            value={classification}
            onChange={(e) => setClassification(e.target.value as typeof classification)}
          >
            <option value="internal_only">Internal only</option>
            <option value="mixed_draft">Draft (mixed)</option>
          </select>
          {classification === 'internal_only' && (
            <span className="badge-internal flex items-center gap-1"><Lock className="w-3 h-3" />Internal</span>
          )}
          <div className="ml-auto flex gap-2">
            <button
              className="btn-ghost py-1 text-xs"
              onClick={() => centerContent && navigator.clipboard.writeText(centerContent)}
              disabled={!centerContent}
            >
              <Copy className="w-3.5 h-3.5" /> Copy brief
            </button>
            <button className="btn-secondary py-1.5 text-xs" onClick={handleSave} disabled={saving || !centerContent}>
              <Save className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <BattlecardPanel
            matrix={matrix}
            competitors={competitors}
            products={products}
            selectedProductIds={selectedProductIds}
            centerContent={centerContent}
          />
        </div>
      </div>
    )
  }

  // ── Strategy ─────────────────────────────────────────────────────────────────────────────────
  if (!quoteResult) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
        <div className="w-16 h-16 rounded-2xl bg-neutral-100 flex items-center justify-center mb-4">
          <FileText className="w-7 h-7 text-neutral-300" />
        </div>
        <p className="text-sm font-semibold text-neutral-600 mb-2">No quote selected</p>
        <p className="text-xs text-neutral-400 text-center max-w-xs leading-relaxed">
          Calculate a quote first. The strategy panel will populate with deal context, active threats, and space for Portia's strategy brief.
        </p>
      </div>
    )
  }
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-neutral-200 bg-neutral-50 flex-shrink-0">
        <select
          className="input-base w-auto py-1 text-xs"
          value={classification}
          onChange={(e) => setClassification(e.target.value as typeof classification)}
        >
          <option value="internal_only">Internal only</option>
          <option value="mixed_draft">Draft (mixed)</option>
        </select>
        {classification === 'internal_only' && (
          <span className="badge-internal flex items-center gap-1"><Lock className="w-3 h-3" />Internal</span>
        )}
        <div className="ml-auto flex gap-2">
          <button
            className="btn-ghost py-1 text-xs"
            onClick={() => centerContent && navigator.clipboard.writeText(centerContent)}
            disabled={!centerContent}
          >
            <Copy className="w-3.5 h-3.5" /> Copy brief
          </button>
          <button className="btn-secondary py-1.5 text-xs" onClick={handleSave} disabled={saving || !centerContent}>
            <Save className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <StrategyPanel
          deal={deal}
          quoteResult={quoteResult}
          inputs={emptyInputs}
          matrix={matrix}
          competitors={competitors}
          products={products}
          selectedProductIds={selectedProductIds}
          centerContent={centerContent}
        />
      </div>
    </div>
  )
}
