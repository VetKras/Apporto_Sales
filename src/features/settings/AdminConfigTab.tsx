import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import {
  loadAllPricingConfigs, loadPricingModelsForVersion, loadCoTutorPricingContext,
  calculateCoTutorPrice, DEFAULT_RULES,
} from '@/lib/pricing-engine'
import type { PricingRules, CoTutorPricingAssumptions, CoTutorAiModel } from '@/lib/pricing-engine'
import { upsertIntegrationSetting, getAllIntegrationSettings } from '@/lib/db'
import { formatCurrency, cn } from '@/lib/utils'
import { Save, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import type { Database } from '@/types/database'

type PricingModel = Database['public']['Tables']['pricing_models']['Row']

const RULES_PROVIDER = 'pricing_rules'

// PowerGrader/TrustEd/ExamSpace stay in the generic tier table below — CoTutor no longer has
// pricing_models rows (formula-driven, see the dedicated "CoTutor Pricing Engine" section).
const PRODUCT_LABELS: Record<string, string> = {
  'seed-product-powergrader':'PowerGrader',
  'seed-product-trusted':    'TrustEd',
  'seed-product-examspace':  'ExamSpace',
}

// CoTutor's own reference point, matching CoTutor_Pricing_Final.xlsx's SALES_QUOTE example —
// used only for the live preview readout below, not saved anywhere.
const COTUTOR_REFERENCE = { students: 10000, assignmentsPerMonth: 4, contractMonthsPerYear: 9 as const }

function calcMargin(price: number, cost: number): string {
  if (!price || price === 0) return '—'
  return `${(((price - cost) / price) * 100).toFixed(1)}%`
}

export function AdminConfigTab({ profileId }: { profileId: string | null }) {
  const [models, setModels] = useState<PricingModel[]>([])
  const [editedModels, setEditedModels] = useState<Record<string, { price: string; cost: string }>>({})
  const [rules, setRules] = useState<PricingRules>(DEFAULT_RULES)
  const [cotutorAssumptions, setCotutorAssumptions] = useState<CoTutorPricingAssumptions | null>(null)
  const [cotutorModels, setCotutorModels] = useState<CoTutorAiModel[]>([])
  const [editedCotutorModels, setEditedCotutorModels] = useState<Record<string, { input: string; cached: string; output: string }>>({})
  const [loading, setLoading] = useState(true)
  const [savingPrices, setSavingPrices] = useState<string | null>(null)
  const [savingRules, setSavingRules] = useState(false)
  const [savingCotutorAssumptions, setSavingCotutorAssumptions] = useState(false)
  const [savingCotutorModels, setSavingCotutorModels] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [section, setSection] = useState<'prices' | 'rules' | 'cotutor'>('prices')

  function showToast(type: 'success' | 'error', msg: string) {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3000)
  }

  useEffect(() => {
    async function load() {
      const [configs, settings] = await Promise.all([
        loadAllPricingConfigs(),
        getAllIntegrationSettings(),
      ])
      const active = configs.find((c) => c.is_active)
      if (active) {
        const [mods, cotutorCtx] = await Promise.all([
          loadPricingModelsForVersion(active.id),
          loadCoTutorPricingContext(active.id).catch(() => null),
        ])
        setModels(mods)
        const init: Record<string, { price: string; cost: string }> = {}
        mods.forEach((m) => {
          init[m.id] = {
            price: m.default_price != null ? String(m.default_price) : '',
            cost:  m.default_cost  != null ? String(m.default_cost)  : '',
          }
        })
        setEditedModels(init)

        if (cotutorCtx) {
          setCotutorAssumptions(cotutorCtx.assumptions)
          setCotutorModels(cotutorCtx.models)
          const initModels: Record<string, { input: string; cached: string; output: string }> = {}
          cotutorCtx.models.forEach((m) => {
            initModels[m.id] = {
              input: String(m.input_rate_per_1m),
              cached: String(m.cached_input_rate_per_1m),
              output: String(m.output_rate_per_1m),
            }
          })
          setEditedCotutorModels(initModels)
        }
      }

      const rulesRow = settings.find((s) => s.provider === RULES_PROVIDER)
      if (rulesRow?.api_key) {
        try { setRules({ ...DEFAULT_RULES, ...JSON.parse(rulesRow.api_key) }) } catch {}
      }

      setLoading(false)
    }
    load()
  }, [])

  function updateCotutorAssumption(patch: Partial<CoTutorPricingAssumptions>) {
    setCotutorAssumptions((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  async function saveCotutorAssumptions() {
    if (!cotutorAssumptions) return
    setSavingCotutorAssumptions(true)
    const { error } = await supabase
      .from('cotutor_pricing_assumptions')
      .update({
        target_gross_margin: cotutorAssumptions.target_gross_margin,
        active_user_adoption_rate: cotutorAssumptions.active_user_adoption_rate,
        fixed_infra_per_student_year: cotutorAssumptions.fixed_infra_per_student_year,
        student_messages_per_assignment: cotutorAssumptions.student_messages_per_assignment,
        validation_input_tokens_per_message: cotutorAssumptions.validation_input_tokens_per_message,
        validation_output_tokens_per_message: cotutorAssumptions.validation_output_tokens_per_message,
        chat_input_tokens_per_message: cotutorAssumptions.chat_input_tokens_per_message,
        chat_output_tokens_per_message: cotutorAssumptions.chat_output_tokens_per_message,
        chat_history_tokens_per_turn: cotutorAssumptions.chat_history_tokens_per_turn,
        validation_pass_rate: cotutorAssumptions.validation_pass_rate,
        cache_hit_rate: cotutorAssumptions.cache_hit_rate,
      })
      .eq('id', cotutorAssumptions.id)
    if (error) showToast('error', `Failed to save CoTutor assumptions: ${error.message}`)
    else showToast('success', 'CoTutor pricing assumptions saved.')
    setSavingCotutorAssumptions(false)
  }

  async function saveCotutorModels() {
    setSavingCotutorModels(true)
    const updates = cotutorModels.map((m) => {
      const edited = editedCotutorModels[m.id]
      return supabase
        .from('cotutor_ai_models')
        .update({
          input_rate_per_1m: Number(edited?.input) || 0,
          cached_input_rate_per_1m: Number(edited?.cached) || 0,
          output_rate_per_1m: Number(edited?.output) || 0,
        })
        .eq('id', m.id)
    })
    const results = await Promise.all(updates)
    const failed = results.filter((r) => r.error)
    if (failed.length) showToast('error', `${failed.length} model row(s) failed to save.`)
    else showToast('success', 'CoTutor AI model rates saved.')
    setSavingCotutorModels(false)
  }

  async function savePrices(productId: string) {
    const productModels = models.filter((m) => m.product_id === productId)
    setSavingPrices(productId)
    const updates = productModels.map((m) => {
      const edited = editedModels[m.id]
      return supabase
        .from('pricing_models')
        .update({
          default_price: edited?.price !== '' ? Number(edited.price) : null,
          default_cost:  edited?.cost  !== '' ? Number(edited.cost)  : null,
        })
        .eq('id', m.id)
    })
    const results = await Promise.all(updates)
    const failed = results.filter((r) => r.error)
    if (failed.length) {
      showToast('error', `${failed.length} row(s) failed to save.`)
    } else {
      showToast('success', `${PRODUCT_LABELS[productId] ?? productId} prices saved.`)
    }
    setSavingPrices(null)
  }

  async function saveRules() {
    setSavingRules(true)
    const { error } = await upsertIntegrationSetting(RULES_PROVIDER, JSON.stringify(rules), profileId)
    if (error) showToast('error', `Failed to save rules: ${error}`)
    else showToast('success', 'Pricing rules saved.')
    setSavingRules(false)
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-neutral-400 text-sm py-8">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading config…
      </div>
    )
  }

  const productGroups = Object.keys(PRODUCT_LABELS).map((pid) => ({
    productId: pid,
    label: PRODUCT_LABELS[pid],
    models: models.filter((m) => m.product_id === pid),
  }))

  return (
    <div className="max-w-3xl space-y-6">
      {toast && (
        <div className={cn(
          'fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium border',
          toast.type === 'success'
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : 'bg-red-50 text-red-800 border-red-200'
        )}>
          {toast.type === 'success'
            ? <CheckCircle className="w-4 h-4 flex-shrink-0" />
            : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          {toast.msg}
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold text-neutral-700">Admin Configuration</h2>
        <p className="text-xs text-neutral-500 mt-0.5">
          Changes here apply to all users across all deals. Authority level 3+ only.
        </p>
      </div>

      <div className="flex gap-1">
        {([
          { id: 'prices',  label: 'Product Prices & COGS' },
          { id: 'rules',   label: 'Pricing Rules' },
          { id: 'cotutor', label: 'CoTutor Pricing Engine' },
        ] as const).map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
              section === s.id ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:bg-neutral-100'
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === 'prices' && (
        <div className="space-y-6">
          {productGroups.map(({ productId, label, models: pModels }) => (
            <div key={productId} className="card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-neutral-900">{label}</h3>
                <button
                  className="btn-primary py-1.5 text-xs flex items-center gap-1.5"
                  onClick={() => savePrices(productId)}
                  disabled={savingPrices === productId}
                >
                  {savingPrices === productId
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
                    : <><Save className="w-3.5 h-3.5" /> Save {label}</>}
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200">
                      <th className="text-left py-2 pr-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide">Tier</th>
                      <th className="text-left py-2 pr-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide">Unit</th>
                      <th className="text-left py-2 pr-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide w-28">List Price ($)</th>
                      <th className="text-left py-2 pr-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide w-28">COGS ($)</th>
                      <th className="text-left py-2 text-xs font-semibold text-neutral-500 uppercase tracking-wide w-24">Margin %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {pModels.map((m) => {
                      const edited = editedModels[m.id] ?? { price: '', cost: '' }
                      const price = Number(edited.price) || 0
                      const cost  = Number(edited.cost)  || 0
                      const marginPct = price > 0 ? ((price - cost) / price) * 100 : 0
                      return (
                        <tr key={m.id}>
                          <td className="py-2 pr-3 text-neutral-800 font-medium text-xs">{m.tier_name}</td>
                          <td className="py-2 pr-3 text-neutral-500 text-xs">{m.unit}</td>
                          <td className="py-2 pr-3">
                            <div className="flex items-center">
                              <span className="inline-flex items-center px-2 h-8 rounded-l-md border border-r-0 border-neutral-300 bg-neutral-50 text-neutral-500 text-xs select-none">$</span>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                className="input-base py-1 text-sm w-full rounded-l-none border-l-0"
                                value={edited.price}
                                onChange={(e) => setEditedModels((prev) => ({
                                  ...prev,
                                  [m.id]: { ...prev[m.id], price: e.target.value },
                                }))}
                              />
                            </div>
                          </td>
                          <td className="py-2 pr-3">
                            <div className="flex items-center">
                              <span className="inline-flex items-center px-2 h-8 rounded-l-md border border-r-0 border-neutral-300 bg-neutral-50 text-neutral-500 text-xs select-none">$</span>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                className="input-base py-1 text-sm w-full rounded-l-none border-l-0"
                                value={edited.cost}
                                onChange={(e) => setEditedModels((prev) => ({
                                  ...prev,
                                  [m.id]: { ...prev[m.id], cost: e.target.value },
                                }))}
                              />
                            </div>
                          </td>
                          <td className="py-2">
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                max="100"
                                className={cn(
                                  'input-base py-1 text-sm w-full',
                                  marginPct >= 60 ? 'text-emerald-700' : 'text-amber-600'
                                )}
                                value={price > 0 ? marginPct.toFixed(1) : ''}
                                onChange={(e) => {
                                  const m_pct = Number(e.target.value)
                                  if (m_pct >= 100 || m_pct < 0) return
                                  const ratio = 1 - m_pct / 100
                                  if (cost > 0) {
                                    setEditedModels((prev) => ({
                                      ...prev,
                                      [m.id]: { ...prev[m.id], price: (cost / ratio).toFixed(2) },
                                    }))
                                  } else if (price > 0) {
                                    setEditedModels((prev) => ({
                                      ...prev,
                                      [m.id]: { ...prev[m.id], cost: (price * ratio).toFixed(2) },
                                    }))
                                  }
                                }}
                              />
                              <span className="text-neutral-400 text-xs">%</span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {section === 'rules' && (
        <div className="space-y-6">
          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-semibold text-neutral-900">Discount Approval Thresholds</h3>
            <p className="text-xs text-neutral-500">Discount % at or below the limit for each level can be approved by that role.</p>
            <div className="grid grid-cols-3 gap-4">
              {([
                { key: 'sales_max',   label: 'Sales rep max %',  desc: 'No approval needed' },
                { key: 'manager_max', label: 'Manager max %',    desc: 'Manager sign-off' },
                { key: 'vp_max',      label: 'VP max %',         desc: 'VP sign-off; above = CFO/Exec' },
              ] as const).map(({ key, label, desc }) => (
                <div key={key}>
                  <label className="label-base">{label}</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      className="input-base py-1.5 text-sm"
                      value={rules.approval[key]}
                      onChange={(e) => setRules((r) => ({
                        ...r,
                        approval: { ...r.approval, [key]: Number(e.target.value) },
                      }))}
                    />
                    <span className="text-neutral-500 text-sm">%</span>
                  </div>
                  <p className="text-xs text-neutral-400 mt-1">{desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-semibold text-neutral-900">Bundle Discount Suggestions</h3>
            <p className="text-xs text-neutral-500">Suggested discount shown when a deal includes multiple products. Not auto-applied.</p>
            <div className="grid grid-cols-3 gap-4">
              {([
                { key: 'two',   label: '2 products' },
                { key: 'three', label: '3 products' },
                { key: 'four',  label: '4 products' },
              ] as const).map(({ key, label }) => (
                <div key={key}>
                  <label className="label-base">{label}</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      max="50"
                      className="input-base py-1.5 text-sm"
                      value={rules.bundle_discounts[key]}
                      onChange={(e) => setRules((r) => ({
                        ...r,
                        bundle_discounts: { ...r.bundle_discounts, [key]: Number(e.target.value) },
                      }))}
                    />
                    <span className="text-neutral-500 text-sm">%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-semibold text-neutral-900">TCO & Margin Targets</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label-base">Default TCO multiplier</label>
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  max="5"
                  className="input-base py-1.5 text-sm"
                  value={rules.tco_default_multiplier}
                  onChange={(e) => setRules((r) => ({ ...r, tco_default_multiplier: Number(e.target.value) }))}
                />
                <p className="text-xs text-neutral-400 mt-1">
                  Quote shows TCO range of {((rules.tco_default_multiplier - 0.2) * 100).toFixed(0)}%–{(rules.tco_default_multiplier * 100).toFixed(0)}% of ARR
                </p>
              </div>
              <div>
                <label className="label-base">Target gross margin %</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    className="input-base py-1.5 text-sm"
                    value={rules.target_gross_margin_pct}
                    onChange={(e) => setRules((r) => ({ ...r, target_gross_margin_pct: Number(e.target.value) }))}
                  />
                  <span className="text-neutral-500 text-sm">%</span>
                </div>
                <p className="text-xs text-neutral-400 mt-1">Shown as a reference line on quote output</p>
              </div>
            </div>
          </div>

          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-semibold text-neutral-900">ExamSpace Volume Discounts</h3>
            <p className="text-xs text-neutral-500">Applied automatically based on deal ARR for ExamSpace deals.</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200">
                  <th className="text-left py-2 pr-4 text-xs font-semibold text-neutral-500 uppercase tracking-wide">Deal value ≥</th>
                  <th className="text-left py-2 text-xs font-semibold text-neutral-500 uppercase tracking-wide">Discount %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {rules.examspace_volume_discounts.map((row, i) => (
                  <tr key={i}>
                    <td className="py-2 pr-4">
                      <div className="flex items-center">
                        <span className="inline-flex items-center px-2 h-8 rounded-l-md border border-r-0 border-neutral-300 bg-neutral-50 text-neutral-500 text-xs select-none">$</span>
                        <input
                          type="number"
                          min="0"
                          className="input-base py-1 text-sm w-32 rounded-l-none border-l-0"
                          value={row.threshold_usd}
                          onChange={(e) => {
                            const next = [...rules.examspace_volume_discounts]
                            next[i] = { ...next[i], threshold_usd: Number(e.target.value) }
                            setRules((r) => ({ ...r, examspace_volume_discounts: next }))
                          }}
                        />
                      </div>
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          max="50"
                          className="input-base py-1 text-sm w-24"
                          value={row.discount_pct}
                          onChange={(e) => {
                            const next = [...rules.examspace_volume_discounts]
                            next[i] = { ...next[i], discount_pct: Number(e.target.value) }
                            setRules((r) => ({ ...r, examspace_volume_discounts: next }))
                          }}
                        />
                        <span className="text-neutral-500 text-xs">%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            className="btn-primary flex items-center gap-2"
            onClick={saveRules}
            disabled={savingRules}
          >
            {savingRules ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Save className="w-4 h-4" /> Save all rules</>}
          </button>
        </div>
      )}

      {section === 'cotutor' && (
        <div className="space-y-6">
          {!cotutorAssumptions ? (
            <p className="text-sm text-neutral-400">CoTutor pricing assumptions unavailable — check that migration 021 has been applied.</p>
          ) : (
            <>
              <div className="card p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-900">Business Levers</h3>
                    <p className="text-xs text-neutral-500 mt-0.5">The three numbers that set CoTutor's price. Changing these changes every future quote immediately.</p>
                  </div>
                  <button className="btn-primary py-1.5 text-xs flex items-center gap-1.5" onClick={saveCotutorAssumptions} disabled={savingCotutorAssumptions}>
                    {savingCotutorAssumptions ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</> : <><Save className="w-3.5 h-3.5" /> Save</>}
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="label-base">Target Gross Margin %</label>
                    <div className="flex items-center gap-1">
                      <input type="number" min="0" max="94" step="0.1" className="input-base py-1.5 text-sm"
                        value={(cotutorAssumptions.target_gross_margin * 100).toFixed(1)}
                        onChange={(e) => updateCotutorAssumption({ target_gross_margin: Number(e.target.value) / 100 })} />
                      <span className="text-neutral-500 text-sm">%</span>
                    </div>
                    <p className="text-xs text-neutral-400 mt-1">$1.00 of cost becomes ${(1 / (1 - cotutorAssumptions.target_gross_margin)).toFixed(2)} of price. Raise → price up.</p>
                  </div>
                  <div>
                    <label className="label-base">Active User Adoption %</label>
                    <div className="flex items-center gap-1">
                      <input type="number" min="1" max="100" step="1" className="input-base py-1.5 text-sm"
                        value={(cotutorAssumptions.active_user_adoption_rate * 100).toFixed(0)}
                        onChange={(e) => updateCotutorAssumption({ active_user_adoption_rate: Number(e.target.value) / 100 })} />
                      <span className="text-neutral-500 text-sm">%</span>
                    </div>
                    <p className="text-xs text-neutral-400 mt-1">Share of enrolled students assumed to actually use CoTutor. Raise → assumed AI bill up → price up.</p>
                  </div>
                  <div>
                    <label className="label-base">Fixed Infra $/Student/Yr</label>
                    <div className="flex items-center gap-1">
                      <span className="text-neutral-500 text-sm">$</span>
                      <input type="number" min="0" step="0.01" className="input-base py-1.5 text-sm"
                        value={cotutorAssumptions.fixed_infra_per_student_year}
                        onChange={(e) => updateCotutorAssumption({ fixed_infra_per_student_year: Number(e.target.value) })} />
                    </div>
                    <p className="text-xs text-neutral-400 mt-1">Servers, DB, auth — owed even if a student never opens CoTutor.</p>
                  </div>
                </div>
                {cotutorModels.length > 0 && (() => {
                  const defaultModel = cotutorModels.find((m) => m.is_default) ?? cotutorModels[0]
                  const preview = calculateCoTutorPrice(
                    COTUTOR_REFERENCE.students, COTUTOR_REFERENCE.assignmentsPerMonth, COTUTOR_REFERENCE.contractMonthsPerYear,
                    defaultModel.model_id, { assumptions: cotutorAssumptions, models: cotutorModels }
                  )
                  return (
                    <p className="text-xs text-neutral-500 bg-neutral-50 rounded px-3 py-2 border border-neutral-200">
                      Reference price at {COTUTOR_REFERENCE.students.toLocaleString()} students / {defaultModel.label} / {COTUTOR_REFERENCE.assignmentsPerMonth} assignments-mo / {COTUTOR_REFERENCE.contractMonthsPerYear}-month contract:{' '}
                      <span className="font-semibold text-neutral-800">${preview.customerPricePerStudentPerYear.toFixed(2)}/student/yr</span>
                      {' '}(COGS ${preview.totalBlendedCogsPerStudentPerYear.toFixed(2)}, ACV {formatCurrency(preview.totalAnnualContractValue)})
                    </p>
                  )
                })()}
              </div>

              <div className="card p-5 space-y-4">
                <h3 className="text-sm font-semibold text-neutral-900">Technical Usage Assumptions</h3>
                <p className="text-xs text-neutral-500">Product/eng-owned. Update as real usage telemetry comes in.</p>
                <div className="grid grid-cols-2 gap-4">
                  {([
                    { key: 'student_messages_per_assignment', label: 'Messages / Assignment', pct: false, desc: 'Biggest cost lever — more messages compounds cost.' },
                    { key: 'validation_pass_rate', label: 'Validation Pass Rate', pct: true, desc: 'Share of messages approved for the full (expensive) tutoring call.' },
                    { key: 'cache_hit_rate', label: 'Cache Hit Rate', pct: true, desc: 'Share of input billed at the discounted cached rate.' },
                    { key: 'validation_input_tokens_per_message', label: 'Validation Input Tok/Msg', pct: false, desc: 'Safety screen input size — no chat history included.' },
                    { key: 'validation_output_tokens_per_message', label: 'Validation Output Tok/Msg', pct: false, desc: "Safety screen's pass/fail verdict." },
                    { key: 'chat_input_tokens_per_message', label: 'Chat Input Tok/Msg', pct: false, desc: 'Turn-1 tutoring request size — history grows on top.' },
                    { key: 'chat_output_tokens_per_message', label: 'Chat Output Tok/Msg', pct: false, desc: "Tutor's written reply length." },
                    { key: 'chat_history_tokens_per_turn', label: 'Chat History Tok/Turn', pct: false, desc: 'How much the conversation grows each exchange.' },
                  ] as const).map(({ key, label, desc, pct }) => (
                    <div key={key}>
                      <label className="label-base">{label}</label>
                      <div className="flex items-center gap-1">
                        <input
                          type="number" min="0" step={pct ? 1 : 1} className="input-base py-1.5 text-sm"
                          value={pct ? (cotutorAssumptions[key] * 100).toFixed(0) : cotutorAssumptions[key]}
                          onChange={(e) => updateCotutorAssumption({ [key]: pct ? Number(e.target.value) / 100 : Number(e.target.value) } as Partial<CoTutorPricingAssumptions>)}
                        />
                        {pct && <span className="text-neutral-500 text-sm">%</span>}
                      </div>
                      <p className="text-xs text-neutral-400 mt-1">{desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-900">Approved AI Models</h3>
                    <p className="text-xs text-neutral-500 mt-0.5">Only models listed here are quotable — this is the curated list the CoTutor dropdown reads from, not a general model catalog. USD per 1M tokens.</p>
                  </div>
                  <button className="btn-primary py-1.5 text-xs flex items-center gap-1.5" onClick={saveCotutorModels} disabled={savingCotutorModels}>
                    {savingCotutorModels ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</> : <><Save className="w-3.5 h-3.5" /> Save</>}
                  </button>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200">
                      <th className="text-left py-2 pr-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide">Model</th>
                      <th className="text-left py-2 pr-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide">Provider</th>
                      <th className="text-left py-2 pr-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide w-28">Input $/M</th>
                      <th className="text-left py-2 pr-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide w-28">Cached $/M</th>
                      <th className="text-left py-2 text-xs font-semibold text-neutral-500 uppercase tracking-wide w-28">Output $/M</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {cotutorModels.map((m) => {
                      const edited = editedCotutorModels[m.id] ?? { input: '', cached: '', output: '' }
                      return (
                        <tr key={m.id}>
                          <td className="py-2 pr-3 text-neutral-800 font-medium text-xs">
                            {m.label}{m.is_default && <span className="ml-1.5 text-xs bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded-full font-medium">default</span>}
                          </td>
                          <td className="py-2 pr-3">
                            <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-emerald-100 text-emerald-700">{m.provider}</span>
                          </td>
                          {(['input', 'cached', 'output'] as const).map((field) => (
                            <td key={field} className="py-2 pr-3">
                              <div className="flex items-center">
                                <span className="inline-flex items-center px-2 h-8 rounded-l-md border border-r-0 border-neutral-300 bg-neutral-50 text-neutral-500 text-xs select-none">$</span>
                                <input
                                  type="number" step="0.01" min="0"
                                  className="input-base py-1 text-sm w-full rounded-l-none border-l-0"
                                  value={edited[field]}
                                  onChange={(e) => setEditedCotutorModels((prev) => ({ ...prev, [m.id]: { ...prev[m.id], [field]: e.target.value } }))}
                                />
                              </div>
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
