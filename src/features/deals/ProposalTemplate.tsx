import { formatCurrency } from '@/lib/utils'
import type { QuoteResult } from '@/lib/pricing-engine'
import type { Database } from '@/types/database'

type Deal = Database['public']['Tables']['deals']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

// ─── Section definitions ──────────────────────────────────────────────────────

export const PROPOSAL_SECTION_KEYS = [
  'executive_summary',
  'challenge',
  'solution_notes',
  'value_statement',
  'implementation',
  'why_apporto',
  'next_steps',
] as const

export type ProposalSectionKey = typeof PROPOSAL_SECTION_KEYS[number]
export type ProposalSections = Record<ProposalSectionKey, string>

export const PROPOSAL_SECTION_DEFAULTS: ProposalSections = {
  executive_summary: '',
  challenge: '',
  solution_notes: '',
  value_statement: '',
  implementation:
    'Standard Apporto implementation milestones:\n\n' +
    '• Week 1 — Kick-off, stakeholder alignment, and technical scoping\n' +
    '• Weeks 2–3 — LMS integration, SSO/authentication setup, environment configuration\n' +
    '• Week 4 — Faculty training, pilot cohort selection, and guided launch\n' +
    '• Week 5+ — Full rollout, adoption monitoring, and Customer Success check-ins\n\n' +
    'Apporto provides a dedicated Customer Success Manager throughout onboarding and the first year of deployment.',
  why_apporto:
    'Apporto AI Suite is purpose-built for higher education:\n\n' +
    '• Assignment-aware AI — CoTutor is bound to faculty rubrics and course context, not a general chatbot\n' +
    '• Process-based integrity — TrustEd captures behavioral evidence; faculty remain the decision authority\n' +
    '• True VDI exam security — ExamSpace uses virtual desktop infrastructure, not browser extensions\n' +
    '• Native LMS integration — Canvas, D2L, Blackboard, and Moodle\n' +
    '• Institution data sovereignty — student data is never used for model training\n' +
    '• Dedicated HE support — implementation, training, and CS teams specialized in higher education',
  next_steps:
    '1. Stakeholder review of this proposal (target: [date])\n' +
    '2. Technical discovery session with Apporto Solutions Engineering\n' +
    '3. Pilot scope confirmation — target course sections and faculty champions\n' +
    '4. Legal review and MSA execution\n' +
    '5. Order Form signing and kickoff scheduling',
}

export const SECTION_LABELS: Record<ProposalSectionKey, string> = {
  executive_summary: 'Executive Summary',
  challenge: 'The Challenge',
  solution_notes: 'Solution Fit',
  value_statement: 'Investment Rationale',
  implementation: 'Implementation & Onboarding',
  why_apporto: 'Why Apporto',
  next_steps: 'Next Steps',
}

const SECTION_PLACEHOLDERS: Record<ProposalSectionKey, string> = {
  executive_summary:
    'Describe the strategic context and opportunity. Why is this institution investing in AI-powered education tools now? What outcomes are they seeking?',
  challenge:
    'What specific challenges — academic integrity, grading efficiency, assessment security, or student support gaps — is this institution facing? What is the cost of inaction?',
  solution_notes:
    "Describe how the selected Apporto products map to this institution's specific needs, workflows, and integration requirements.",
  value_statement:
    'Frame the ROI and strategic value. Consider faculty hours saved, student outcome improvements, compliance risk reduction, and institutional competitive positioning.',
  implementation: 'Outline key milestones, onboarding support, and any phased rollout plan.',
  why_apporto: "Describe Apporto's key differentiators relevant to this customer.",
  next_steps: 'List specific action items, owners, and target dates.',
}

const PRODUCT_DESCRIPTIONS: Record<string, string> = {
  cotutor:
    'AI-powered, assignment-aware writing assistant embedded in Canvas, Google Docs, and Microsoft Word. Provides real-time Socratic guidance within faculty-defined rubrics — not a general chatbot.',
  powergrader:
    'AI-assisted grading that generates draft scores and detailed rubric feedback for faculty review. Significantly reduces grading time while preserving full faculty authority over final grades.',
  trusted:
    'Behavioral authorship verification that captures writing-process signals throughout assignment completion. Provides evidence-based context to support faculty academic integrity decisions.',
  examspace:
    'Secure VDI-based exam environment with full application control, lockdown capability, and complete audit trails — goes beyond browser-only proctoring.',
}

// ─── Plain-text export ────────────────────────────────────────────────────────

export function generateProposalText(
  deal: Deal,
  quoteResult: QuoteResult,
  sections: ProposalSections,
  profile: Profile | null,
): string {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const lines = quoteResult.lines ?? []
  const slugMap = new Map(
    (quoteResult.inputs_snapshot.selected_products ?? []).map((p) => [p.product_id, p.product_slug]),
  )
  const hr = '='.repeat(60)
  const sub = '-'.repeat(40)

  let t = `PROPOSAL\n${hr}\n\n`
  t += `Prepared for: ${deal.customer_name}\n`
  t += `Date: ${today}\n`
  if (profile?.name)
    t += `Prepared by: ${profile.name}${profile.title ? `, ${profile.title}` : ''}\n`
  t += `Pricing config: ${quoteResult.config_version_name}\n\n`

  if (sections.executive_summary)
    t += `EXECUTIVE SUMMARY\n${sub}\n${sections.executive_summary}\n\n`
  if (sections.challenge)
    t += `THE CHALLENGE\n${sub}\n${sections.challenge}\n\n`

  t += `PROPOSED SOLUTION\n${sub}\n`
  for (const line of lines) {
    const slug = slugMap.get(line.product_id) ?? ''
    t += `\n${line.product_name} — ${line.tier_label}\n`
    const desc = PRODUCT_DESCRIPTIONS[slug]
    if (desc) t += `${desc}\n`
    t += `${line.quantity.toLocaleString()} ${line.unit} × ${formatCurrency(line.unit_price)} = ${formatCurrency(line.net_price)}\n`
  }
  if (sections.solution_notes) t += `\n${sections.solution_notes}\n`
  t += '\n'

  t += `INVESTMENT SUMMARY\n${sub}\n`
  for (const line of lines) {
    t += `  ${line.product_name} (${line.tier_label}): ${line.quantity.toLocaleString()} ${line.unit} × ${formatCurrency(line.unit_price)} = ${formatCurrency(line.net_price)}\n`
  }
  if (quoteResult.discount_percent > 0)
    t += `  Discount: ${quoteResult.discount_percent}% (−${formatCurrency(quoteResult.discount_amount)})\n`
  t += `  Total ARR: ${formatCurrency(quoteResult.final_total)}\n`
  if (quoteResult.per_student_price != null)
    t += `  All-in per student: ${formatCurrency(quoteResult.per_student_price)}/student/yr\n`
  if (sections.value_statement) t += `\n${sections.value_statement}\n`
  t += '\n'

  if (sections.implementation)
    t += `IMPLEMENTATION & ONBOARDING\n${sub}\n${sections.implementation}\n\n`
  if (sections.why_apporto)
    t += `WHY APPORTO\n${sub}\n${sections.why_apporto}\n\n`

  t += `CONTRACT TERMS\n${sub}\n`
  t += `Contract term: ${quoteResult.assumptions.contract_term}\n`
  t += `Customer status: ${quoteResult.inputs_snapshot.customer_status === 'new' ? 'New customer' : 'Existing customer'}\n`
  if ((quoteResult.assumptions.compliance_requirements?.length ?? 0) > 0)
    t += `Compliance: ${quoteResult.assumptions.compliance_requirements.join(', ')}\n`
  if (quoteResult.assumptions.true_up_clause)
    t += `True-up/down clause: included\n`
  t += '\n'

  if (sections.next_steps)
    t += `NEXT STEPS\n${sub}\n${sections.next_steps}\n\n`

  t += `${hr}\n`
  t += `Prepared using Apporto pricing configuration ${quoteResult.config_version_name}.\n`
  t += `All figures are reference estimates pending final approval and contract execution.\n`
  return t
}

// ─── Component primitives ─────────────────────────────────────────────────────

function AutoTag() {
  return (
    <span className="ml-2 text-[9px] font-bold text-sky-600 bg-sky-50 border border-sky-200 px-1.5 py-0.5 rounded uppercase tracking-wide align-middle">
      auto
    </span>
  )
}

function DocSection({
  title,
  auto,
  children,
}: {
  title: string
  auto?: boolean
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center">
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-neutral-400">{title}</h3>
        {auto && <AutoTag />}
      </div>
      {children}
    </section>
  )
}

function EditableField({
  sectionKey,
  value,
  onChange,
}: {
  sectionKey: ProposalSectionKey
  value: string
  onChange: (key: ProposalSectionKey, value: string) => void
}) {
  function resize(el: HTMLTextAreaElement) {
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }
  return (
    <textarea
      className="w-full text-sm text-neutral-800 leading-relaxed resize-none focus:outline-none placeholder:text-neutral-300 bg-transparent min-h-[4.5rem] border-b border-dashed border-neutral-200 focus:border-brand-300 pb-1 transition-colors"
      placeholder={SECTION_PLACEHOLDERS[sectionKey]}
      value={value}
      onChange={(e) => {
        onChange(sectionKey, e.target.value)
        resize(e.target)
      }}
      onFocus={(e) => resize(e.target)}
    />
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  deal: Deal
  quoteResult: QuoteResult
  profile: Profile | null
  sections: ProposalSections
  onSectionChange: (key: ProposalSectionKey, value: string) => void
}

export function ProposalTemplate({ deal, quoteResult, profile, sections, onSectionChange }: Props) {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const lines = quoteResult.lines ?? []
  const slugMap = new Map(
    (quoteResult.inputs_snapshot.selected_products ?? []).map((p) => [p.product_id, p.product_slug]),
  )

  return (
    <div className="max-w-2xl mx-auto space-y-8 text-neutral-800">

      {/* Document header */}
      <div className="flex items-start justify-between pb-6 border-b border-neutral-200">
        <div>
          <div className="text-2xl font-bold text-neutral-900 tracking-tight">Proposal</div>
          <div className="text-base text-neutral-600 font-medium mt-1">{deal.customer_name}</div>
        </div>
        <div className="text-right text-xs text-neutral-400 space-y-1">
          <div>{today}</div>
          {profile?.name && (
            <div className="text-neutral-500">
              {profile.name}
              {profile.title ? <span className="text-neutral-400">, {profile.title}</span> : null}
            </div>
          )}
          <div className="text-neutral-300 text-[10px]">Config: {quoteResult.config_version_name}</div>
        </div>
      </div>

      {/* Executive Summary */}
      <DocSection title="Executive Summary">
        <EditableField sectionKey="executive_summary" value={sections.executive_summary} onChange={onSectionChange} />
      </DocSection>

      {/* The Challenge */}
      <DocSection title="The Challenge">
        <EditableField sectionKey="challenge" value={sections.challenge} onChange={onSectionChange} />
      </DocSection>

      {/* Proposed Solution */}
      <DocSection title="Proposed Solution" auto>
        <div className="space-y-3">
          {lines.map((line, i) => {
            const slug = slugMap.get(line.product_id) ?? ''
            const desc = PRODUCT_DESCRIPTIONS[slug]
            return (
              <div key={i} className="flex gap-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-neutral-900">{line.product_name}</div>
                  <div className="text-xs text-neutral-500 mt-0.5 mb-1.5">{line.tier_label}</div>
                  {desc && (
                    <p className="text-xs text-neutral-600 leading-relaxed">{desc}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0 space-y-0.5">
                  <div className="text-sm font-bold text-neutral-900">{formatCurrency(line.net_price)}</div>
                  <div className="text-xs text-neutral-400">
                    {line.quantity.toLocaleString()} {line.unit.split('/')[0]}
                  </div>
                  <div className="text-xs text-neutral-400">
                    {formatCurrency(line.unit_price)} / {line.unit.split('/').slice(1).join('/') || 'unit'}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <div className="mt-2">
          <EditableField sectionKey="solution_notes" value={sections.solution_notes} onChange={onSectionChange} />
        </div>
      </DocSection>

      {/* Investment Summary */}
      <DocSection title="Investment Summary" auto>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200">
              <th className="text-left py-2 pr-4 text-xs font-semibold text-neutral-400 uppercase tracking-wide">Product</th>
              <th className="text-left py-2 pr-4 text-xs font-semibold text-neutral-400 uppercase tracking-wide">Tier</th>
              <th className="text-right py-2 pr-4 text-xs font-semibold text-neutral-400 uppercase tracking-wide">Qty</th>
              <th className="text-right py-2 pr-4 text-xs font-semibold text-neutral-400 uppercase tracking-wide">Unit $</th>
              <th className="text-right py-2 text-xs font-semibold text-neutral-400 uppercase tracking-wide">Net ARR</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {lines.map((line, i) => (
              <tr key={i}>
                <td className="py-2.5 pr-4 font-medium text-neutral-900">{line.product_name}</td>
                <td className="py-2.5 pr-4 text-neutral-500 text-xs">{line.tier_label}</td>
                <td className="py-2.5 pr-4 text-right text-neutral-600">
                  {line.quantity.toLocaleString()} {line.unit.split('/')[0]}
                </td>
                <td className="py-2.5 pr-4 text-right text-neutral-600">{formatCurrency(line.unit_price)}</td>
                <td className="py-2.5 text-right font-semibold text-neutral-900">{formatCurrency(line.net_price)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="border-t border-neutral-200 pt-3 space-y-1.5">
          {quoteResult.discount_percent > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">Discount ({quoteResult.discount_percent}%)</span>
              <span className="text-red-500">−{formatCurrency(quoteResult.discount_amount)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold text-neutral-900">
            <span>Total ARR</span>
            <span>{formatCurrency(quoteResult.final_total)}</span>
          </div>
          {quoteResult.per_student_price != null && (
            <div className="flex justify-between text-xs text-neutral-400">
              <span>All-in per student</span>
              <span>{formatCurrency(quoteResult.per_student_price)}/student/yr</span>
            </div>
          )}
        </div>
        <div className="mt-3">
          <EditableField sectionKey="value_statement" value={sections.value_statement} onChange={onSectionChange} />
        </div>
      </DocSection>

      {/* Implementation */}
      <DocSection title="Implementation & Onboarding">
        <EditableField sectionKey="implementation" value={sections.implementation} onChange={onSectionChange} />
      </DocSection>

      {/* Why Apporto */}
      <DocSection title="Why Apporto">
        <EditableField sectionKey="why_apporto" value={sections.why_apporto} onChange={onSectionChange} />
      </DocSection>

      {/* Contract Terms */}
      <DocSection title="Contract Terms" auto>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <div>
            <div className="text-xs text-neutral-400 uppercase tracking-wide mb-0.5">Contract term</div>
            <div className="font-medium text-neutral-900 capitalize">{quoteResult.assumptions.contract_term}</div>
          </div>
          <div>
            <div className="text-xs text-neutral-400 uppercase tracking-wide mb-0.5">Customer status</div>
            <div className="font-medium text-neutral-900 capitalize">
              {quoteResult.inputs_snapshot.customer_status} customer
            </div>
          </div>
          {(quoteResult.assumptions.compliance_requirements?.length ?? 0) > 0 && (
            <div className="col-span-2">
              <div className="text-xs text-neutral-400 uppercase tracking-wide mb-0.5">Compliance requirements</div>
              <div className="font-medium text-neutral-900">
                {quoteResult.assumptions.compliance_requirements.join(', ')}
              </div>
            </div>
          )}
          {quoteResult.assumptions.true_up_clause && (
            <div className="col-span-2">
              <span className="inline-block text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2.5 py-1">
                True-up/down clause included
              </span>
            </div>
          )}
        </div>
      </DocSection>

      {/* Next Steps */}
      <DocSection title="Next Steps">
        <EditableField sectionKey="next_steps" value={sections.next_steps} onChange={onSectionChange} />
      </DocSection>

      {/* Footer */}
      <div className="text-[11px] text-neutral-300 italic border-t border-neutral-100 pt-4">
        Prepared using Apporto pricing configuration {quoteResult.config_version_name}. All figures are
        reference estimates pending final approval and contract execution.
      </div>
    </div>
  )
}
