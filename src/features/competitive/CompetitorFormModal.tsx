import { useState } from 'react'
import { X, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { Database } from '@/types/database'

type Product = Database['public']['Tables']['products']['Row']
type Competitor = Database['public']['Tables']['competitors']['Row']
type MatrixRow = Database['public']['Tables']['competitive_matrix']['Row']

interface Props {
  products: Product[]
  competitors: Competitor[]
  selectedProductId: string | null
  editRow: MatrixRow | null
  onClose: () => void
  onSaved: () => void
}

const inputCls = 'w-full px-2.5 py-1.5 text-sm border border-neutral-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-400 bg-white'
const textareaCls = inputCls + ' resize-none'
const selectCls = inputCls

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label-base block mb-1">{label}</label>
      {children}
    </div>
  )
}

export function CompetitorFormModal({ products, competitors, selectedProductId, editRow, onClose, onSaved }: Props) {
  const isEdit = !!editRow
  const existingComp = isEdit ? competitors.find(c => c.id === editRow.competitor_id) : null

  const [competitorMode, setCompetitorMode] = useState<'existing' | 'new'>(isEdit ? 'existing' : 'new')
  const [selectedCompetitorId, setSelectedCompetitorId] = useState(editRow?.competitor_id ?? '')
  const [newCompName, setNewCompName] = useState('')
  const [newCompCategory, setNewCompCategory] = useState('')
  const [newCompWebsite, setNewCompWebsite] = useState('')

  const [productId, setProductId] = useState(editRow?.product_id ?? selectedProductId ?? '')
  const [tier, setTier] = useState(editRow?.threat_tier ?? 'tier-2')
  const [escalation, setEscalation] = useState(editRow?.escalation_status ?? 'stable')
  const [positioningLine, setPositioningLine] = useState(editRow?.sales_positioning_line ?? '')
  const [strength, setStrength] = useState(editRow?.competitor_strength ?? '')
  const [edge, setEdge] = useState(editRow?.apporto_edge ?? '')
  const [strategicWindow, setStrategicWindow] = useState(editRow?.strategic_window ?? '')
  const [confidence, setConfidence] = useState(editRow?.confidence ?? 'medium')
  const [freshnessDate, setFreshnessDate] = useState(editRow?.freshness_date ?? '')

  const [showAdvanced, setShowAdvanced] = useState(false)
  const [threatRationale, setThreatRationale] = useState(editRow?.threat_rationale ?? '')
  const [keyOverlap, setKeyOverlap] = useState(editRow?.key_overlap ?? '')
  const [pricingIntel, setPricingIntel] = useState(editRow?.pricing_intel ?? '')
  const [lmsCoverage, setLmsCoverage] = useState(editRow?.lms_coverage ?? '')
  const [ferpaPositioning, setFerpaPositioning] = useState(editRow?.ferpa_positioning ?? '')
  const [latestNotes, setLatestNotes] = useState(editRow?.latest_notes ?? '')
  const [evidenceSource, setEvidenceSource] = useState(editRow?.evidence_source ?? '')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setError(null)
    setSaving(true)
    try {
      let competitorId = isEdit ? editRow!.competitor_id : selectedCompetitorId

      if (!isEdit && competitorMode === 'new') {
        if (!newCompName.trim()) throw new Error('Competitor name is required')
        const { data, error: err } = await supabase
          .from('competitors')
          .insert({ name: newCompName.trim(), category: newCompCategory.trim() || null, website: newCompWebsite.trim() || null })
          .select('id')
          .single()
        if (err) throw err
        competitorId = data.id
      } else if (!isEdit) {
        if (!competitorId) throw new Error('Please select a competitor')
      }

      const payload = {
        product_id: productId,
        competitor_id: competitorId,
        threat_tier: tier || null,
        escalation_status: escalation,
        sales_positioning_line: positioningLine.trim() || null,
        competitor_strength: strength.trim() || null,
        apporto_edge: edge.trim() || null,
        strategic_window: strategicWindow.trim() || null,
        confidence,
        freshness_date: freshnessDate || null,
        threat_rationale: threatRationale.trim() || null,
        key_overlap: keyOverlap.trim() || null,
        pricing_intel: pricingIntel.trim() || null,
        lms_coverage: lmsCoverage.trim() || null,
        ferpa_positioning: ferpaPositioning.trim() || null,
        latest_notes: latestNotes.trim() || null,
        evidence_source: evidenceSource.trim() || null,
      }

      if (isEdit) {
        const { error: err } = await supabase.from('competitive_matrix').update(payload).eq('id', editRow!.id)
        if (err) throw err
      } else {
        const { error: err } = await supabase.from('competitive_matrix').insert(payload)
        if (err) throw err
      }
      onSaved()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-end" onClick={onClose}>
      <div
        className="w-[540px] h-full bg-white flex flex-col shadow-xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 flex-shrink-0">
          <h2 className="text-base font-semibold text-neutral-900">
            {isEdit ? `Edit: ${existingComp?.name ?? ''}` : 'Add Competitor'}
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-neutral-100 rounded-md transition-colors">
            <X className="w-4 h-4 text-neutral-500" />
          </button>
        </div>

        {/* Form body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {/* Product */}
          <Field label="Product">
            <select value={productId} onChange={e => setProductId(e.target.value)} className={selectCls}>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>

          {/* Competitor */}
          {isEdit ? (
            <Field label="Competitor">
              <input
                value={existingComp?.name ?? editRow!.competitor_id}
                disabled
                className={cn(inputCls, 'bg-neutral-50 text-neutral-500')}
              />
            </Field>
          ) : (
            <div className="space-y-3">
              <div className="flex rounded-md overflow-hidden border border-neutral-200">
                {(['new', 'existing'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setCompetitorMode(mode)}
                    className={cn(
                      'flex-1 py-1.5 text-sm font-medium transition-colors',
                      competitorMode === mode
                        ? 'bg-brand-600 text-white'
                        : 'text-neutral-600 hover:bg-neutral-50'
                    )}
                  >
                    {mode === 'new' ? 'New competitor' : 'Existing competitor'}
                  </button>
                ))}
              </div>

              {competitorMode === 'new' ? (
                <div className="space-y-3 p-3 bg-neutral-50 rounded-lg border border-neutral-200">
                  <Field label="Name *">
                    <input value={newCompName} onChange={e => setNewCompName(e.target.value)} placeholder="e.g. Citrix" className={inputCls} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Category">
                      <input value={newCompCategory} onChange={e => setNewCompCategory(e.target.value)} placeholder="e.g. DaaS / VDI" className={inputCls} />
                    </Field>
                    <Field label="Website">
                      <input value={newCompWebsite} onChange={e => setNewCompWebsite(e.target.value)} placeholder="https://..." className={inputCls} />
                    </Field>
                  </div>
                </div>
              ) : (
                <Field label="Select competitor">
                  <select value={selectedCompetitorId} onChange={e => setSelectedCompetitorId(e.target.value)} className={selectCls}>
                    <option value="">— choose —</option>
                    {competitors.map(c => <option key={c.id} value={c.id}>{c.name}{c.category ? ` (${c.category})` : ''}</option>)}
                  </select>
                </Field>
              )}
            </div>
          )}

          <hr className="border-neutral-100" />

          {/* Core battlecard */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Threat tier">
              <select value={tier ?? ''} onChange={e => setTier(e.target.value)} className={selectCls}>
                <option value="tier-1">Tier 1 — Direct threat</option>
                <option value="tier-2">Tier 2 — Partial overlap</option>
                <option value="tier-3">Tier 3 — Low threat</option>
                <option value="watch">Watch — Needs research</option>
              </select>
            </Field>
            <Field label="Escalation status">
              <select value={escalation} onChange={e => setEscalation(e.target.value)} className={selectCls}>
                <option value="escalated">Escalated</option>
                <option value="new">New</option>
                <option value="monitor">Monitor</option>
                <option value="stable">Stable</option>
                <option value="watch">Watch</option>
              </select>
            </Field>
          </div>

          <Field label="Sales positioning line">
            <textarea
              rows={2}
              value={positioningLine}
              onChange={e => setPositioningLine(e.target.value)}
              placeholder="One-liner for reps to use in the field..."
              className={textareaCls}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Competitor strength">
              <textarea rows={3} value={strength} onChange={e => setStrength(e.target.value)} placeholder="What they do well..." className={textareaCls} />
            </Field>
            <Field label="Apporto edge">
              <textarea rows={3} value={edge} onChange={e => setEdge(e.target.value)} placeholder="Why we win..." className={textareaCls} />
            </Field>
          </div>

          <Field label="Strategic window">
            <textarea
              rows={2}
              value={strategicWindow}
              onChange={e => setStrategicWindow(e.target.value)}
              placeholder="Time-sensitive opportunity or threat..."
              className={textareaCls}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Confidence">
              <select value={confidence} onChange={e => setConfidence(e.target.value)} className={selectCls}>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </Field>
            <Field label="Last updated">
              <input type="date" value={freshnessDate} onChange={e => setFreshnessDate(e.target.value)} className={inputCls} />
            </Field>
          </div>

          {/* Advanced intel — collapsible */}
          <div className="border border-neutral-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setShowAdvanced(v => !v)}
              className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-medium text-neutral-500 hover:bg-neutral-50 transition-colors"
            >
              <span>Advanced intel</span>
              {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {showAdvanced && (
              <div className="px-3 pb-4 pt-2 space-y-3 border-t border-neutral-100">
                <Field label="Why this tier">
                  <textarea rows={2} value={threatRationale} onChange={e => setThreatRationale(e.target.value)} className={textareaCls} />
                </Field>
                <Field label="Key overlap">
                  <textarea rows={2} value={keyOverlap} onChange={e => setKeyOverlap(e.target.value)} className={textareaCls} />
                </Field>
                <Field label="Pricing intel">
                  <textarea rows={2} value={pricingIntel} onChange={e => setPricingIntel(e.target.value)} className={textareaCls} />
                </Field>
                <Field label="LMS coverage">
                  <textarea rows={2} value={lmsCoverage} onChange={e => setLmsCoverage(e.target.value)} className={textareaCls} />
                </Field>
                <Field label="FERPA positioning">
                  <textarea rows={2} value={ferpaPositioning} onChange={e => setFerpaPositioning(e.target.value)} className={textareaCls} />
                </Field>
                <Field label="Notes">
                  <textarea rows={2} value={latestNotes} onChange={e => setLatestNotes(e.target.value)} className={textareaCls} />
                </Field>
                <Field label="Evidence source">
                  <input value={evidenceSource} onChange={e => setEvidenceSource(e.target.value)} placeholder="URL, doc title, etc." className={inputCls} />
                </Field>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-neutral-200 flex-shrink-0 flex items-center gap-3">
          {error && <p className="text-xs text-red-600 flex-1">{error}</p>}
          <div className={cn('flex gap-2', !error && 'ml-auto')}>
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add competitor'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
