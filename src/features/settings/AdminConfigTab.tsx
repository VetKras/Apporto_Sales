import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { loadAllPricingConfigs, loadPricingModelsForVersion, COTUTOR_MODELS, DEFAULT_RULES } from '@/lib/pricing-engine'
import type { PricingRules } from '@/lib/pricing-engine'
import { upsertIntegrationSetting, getAllIntegrationSettings } from '@/lib/db'
import { formatCurrency, cn } from '@/lib/utils'
import { Save, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import type { Database } from '@/types/database'

type PricingModel = Database['public']['Tables']['pricing_models']['Row']

const RULES_PROVIDER = 'pricing_rules'
const AI_COSTS_PROVIDER = 'ai_model_costs_override'

export interface AiModelCosts {
  [modelId: string]: { inputPricePerMTok: number; outputPricePerMTok: number }
}

const PRODUCT_LABELS: Record<string, string> = {
  'seed-product-cotutor':    'CoTutor',
  'seed-product-powergrader':'PowerGrader',
  'seed-product-trusted':    'TrustEd',
  'seed-product-examspace':  'ExamSpace',
}

function calcMargin(price: number, cost: number): string {
  if (!price || price === 0) return '—'
  return `${(((price - cost) / price) * 100).toFixed(1)}%`
}

export function AdminConfigTab({ profileId }: { profileId: string | null }) {
  const [models, setModels] = useState<PricingModel[]>([])
  const [editedModels, setEditedModels] = useState<Record<string, { price: string; cost: string }>>({})
  const [rules, setRules] = useState<PricingRules>(DEFAULT_RULES)
  const [aiCosts, setAiCosts] = useState<AiModelCosts>({})
  const [loading, setLoading] = useState(true)
  const [savingPrices, setSavingPrices] = useState<string | null>(null)
  const [savingRules, setSavingRules] = useState(false)
  const [savingAi, setSavingAi] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [section, setSection] = useState<'prices' | 'rules' | 'ai'>('prices')

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
        const mods = await loadPricingModelsForVersion(active.id)
        setModels(mods)
        const init: Record<string, { price: string; cost: string }> = {}
        mods.forEach((m) => {
          init[m.id] = {
            price: m.default_price != null ? String(m.default_price) : '',
            cost:  m.default_cost  != null ? String(m.default_cost)  : '',
          }
        })
        setEditedModels(init)
      }

      const rulesRow = settings.find((s) => s.provider === RULES_PROVIDER)
      if (rulesRow?.api_key) {
        try { setRules({ ...DEFAULT_RULES, ...JSON.parse(rulesRow.api_key) }) } catch {}
      }

      const aiRow = settings.find((s) => s.provider === AI_COSTS_PROVIDER)
      if (aiRow?.api_key) {
        try { setAiCosts(JSON.parse(aiRow.api_key)) } catch {}
      }

      setLoading(false)
    }
    load()
  }, [])

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

  async function saveAiCosts() {
    setSavingAi(true)
    const { error } = await upsertIntegrationSetting(AI_COSTS_PROVIDER, JSON.stringify(aiCosts), profileId)
    if (error) showToast('error', `Failed to save AI costs: ${error}`)
    else showToast('success', 'AI model costs saved.')
    setSavingAi(false)
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
          { id: 'prices', label: 'Product Prices & COGS' },
          { id: 'rules',  label: 'Pricing Rules' },
          { id: 'ai',     label: 'AI Model Costs' },
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

      {section === 'ai' && (
        <div className="space-y-4">
          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-semibold text-neutral-900">AI Model Token Costs</h3>
            <p className="text-xs text-neutral-500">
              Used for CoTutor COGS calculations. Overrides the built-in rates when set.
              Prices are USD per 1M tokens.
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200">
                  <th className="text-left py-2 pr-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide">Model</th>
                  <th className="text-left py-2 pr-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide">Provider</th>
                  <th className="text-left py-2 pr-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide w-32">Input $/M tok</th>
                  <th className="text-left py-2 text-xs font-semibold text-neutral-500 uppercase tracking-wide w-32">Output $/M tok</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {COTUTOR_MODELS.map((m) => {
                  const override = aiCosts[m.id]
                  return (
                    <tr key={m.id}>
                      <td className="py-2 pr-3 text-neutral-800 font-medium text-xs">{m.label}</td>
                      <td className="py-2 pr-3">
                        <span className={cn(
                          'text-xs px-1.5 py-0.5 rounded font-medium',
                          m.provider === 'Anthropic' ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'
                        )}>
                          {m.provider}
                        </span>
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center">
                          <span className="inline-flex items-center px-2 h-8 rounded-l-md border border-r-0 border-neutral-300 bg-neutral-50 text-neutral-500 text-xs select-none">$</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder={String(m.inputPricePerMTok)}
                            className="input-base py-1 text-sm w-full rounded-l-none border-l-0"
                            value={override?.inputPricePerMTok ?? ''}
                            onChange={(e) => setAiCosts((prev) => ({
                              ...prev,
                              [m.id]: {
                                inputPricePerMTok: Number(e.target.value),
                                outputPricePerMTok: prev[m.id]?.outputPricePerMTok ?? m.outputPricePerMTok,
                              },
                            }))}
                          />
                        </div>
                      </td>
                      <td className="py-2">
                        <div className="flex items-center">
                          <span className="inline-flex items-center px-2 h-8 rounded-l-md border border-r-0 border-neutral-300 bg-neutral-50 text-neutral-500 text-xs select-none">$</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder={String(m.outputPricePerMTok)}
                            className="input-base py-1 text-sm w-full rounded-l-none border-l-0"
                            value={override?.outputPricePerMTok ?? ''}
                            onChange={(e) => setAiCosts((prev) => ({
                              ...prev,
                              [m.id]: {
                                inputPricePerMTok: prev[m.id]?.inputPricePerMTok ?? m.inputPricePerMTok,
                                outputPricePerMTok: Number(e.target.value),
                              },
                            }))}
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="text-xs text-neutral-400">Leave blank to use the built-in default rates.</p>
          </div>

          <button
            className="btn-primary flex items-center gap-2"
            onClick={saveAiCosts}
            disabled={savingAi}
          >
            {savingAi ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Save className="w-4 h-4" /> Save AI model costs</>}
          </button>
        </div>
      )}
    </div>
  )
}
