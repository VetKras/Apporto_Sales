import { useState, useEffect } from 'react'
import {
  ArrowLeft, Calculator, Save, AlertCircle, ChevronDown, Trash2, Clock,
  Send, X, CheckCircle, Loader2
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import {
  calculateQuote, loadActivePricingConfig, loadPricingRules, persistQuoteLines,
  persistQuoteSnapshot, loadQuoteSnapshots, removeQuoteSnapshot,
  buildQuoteSourceTrace, loadCoTutorPricingContext, type DealInputs, type QuoteResult,
  type PricingConfigVersion, type PricingModel, type PricingRules,
  type QuoteSnapshot, type CoTutorPricingContext, DEFAULT_RULES,
} from '@/lib/pricing-engine'
import {
  PROPOSAL_SECTION_DEFAULTS,
  type ProposalSections,
  type ProposalSectionKey,
} from './ProposalTemplate'
import { QuoteInputsPanel } from './QuoteInputsPanel'
import { QuoteOutputPanel } from './QuoteOutputPanel'
import { PortiaPanel } from '@/features/portia/PortiaPanel'
import type { Database } from '@/types/database'
import { cn, formatCurrency } from '@/lib/utils'

type Deal = Database['public']['Tables']['deals']['Row']
type Product = Database['public']['Tables']['products']['Row']
type ProductFact = Database['public']['Tables']['product_facts']['Row']
type Competitor = Database['public']['Tables']['competitors']['Row']
type MatrixRow = Database['public']['Tables']['competitive_matrix']['Row']

interface Props {
  deal: Deal
  onClose: () => void
}

const MODE_FEATURE_KEYS: Partial<Record<'quote' | 'proposal' | 'battlecard' | 'strategy', string>> = {
  proposal: 'proposal_generation',
  battlecard: 'battlecard_generation',
  strategy: 'strategy_generation',
}

const EMPTY_INPUTS: Omit<DealInputs, 'deal_id'> = {
  student_count: 0,
  faculty_count: 0,
  course_sections: 0,
  exam_days: 0,
  seats_per_exam_day: 0,
  customer_status: 'new',
  discount_percent: 0,
  selected_products: [],
  contract_term: 'annual',
  tco_multiplier: 1.6,
  true_up_clause: false,
  compliance_requirements: [],
}

export function DealWorkspace({ deal, onClose }: Props) {
  const { profile, hasFeature } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [productFacts, setProductFacts] = useState<Record<string, ProductFact[]>>({})
  const [matrix, setMatrix] = useState<MatrixRow[]>([])
  const [competitors, setCompetitors] = useState<Competitor[]>([])
  const [configVersion, setConfigVersion] = useState<PricingConfigVersion | null>(null)
  const [pricingModels, setPricingModels] = useState<PricingModel[]>([])
  const [cotutorContext, setCotutorContext] = useState<CoTutorPricingContext | null>(null)
  const [quoteResult, setQuoteResult] = useState<QuoteResult | null>(null)
  const [pricingRules, setPricingRules] = useState<PricingRules>(DEFAULT_RULES)
  const [saving, setSaving] = useState(false)
  const [calculating, setCalculating] = useState(false)
  const [centerMode, setCenterMode] = useState<'quote' | 'proposal' | 'battlecard' | 'strategy'>('quote')
  const [centerContent, setCenterContent] = useState<string>('')
  const [configError, setConfigError] = useState<string | null>(null)

  const [savedQuotes, setSavedQuotes] = useState<QuoteSnapshot[]>([])
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [loadedQuoteId, setLoadedQuoteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [hsModalOpen, setHsModalOpen] = useState(false)
  const [hsEmail, setHsEmail] = useState('')
  const [hsPushing, setHsPushing] = useState(false)
  const [hsResult, setHsResult] = useState<{ type: 'success' | 'error'; message: string; url?: string } | null>(null)

  const [inputs, setInputs] = useState<Omit<DealInputs, 'deal_id'>>(EMPTY_INPUTS)

  const [proposalSections, setProposalSections] = useState<ProposalSections>(PROPOSAL_SECTION_DEFAULTS)

  function handleProposalSectionChange(key: ProposalSectionKey, value: string) {
    setProposalSections((s) => ({ ...s, [key]: value }))
  }

  useEffect(() => {
    async function load() {
      const [{ data: prods }, { data: allFacts }, config, snapshots, rules, { data: comps }, { data: mat }] = await Promise.all([
        supabase.from('products').select('*').eq('status', 'active'),
        supabase.from('product_facts').select('*'),
        loadActivePricingConfig(),
        loadQuoteSnapshots(deal.id),
        loadPricingRules(),
        supabase.from('competitors').select('*').order('name'),
        supabase.from('competitive_matrix').select('*'),
      ])
      setProducts(prods ?? [])
      setCompetitors(comps ?? [])
      setMatrix(mat ?? [])
      const factsByProduct: Record<string, ProductFact[]> = {}
      for (const f of (allFacts ?? [])) {
        if (!factsByProduct[f.product_id]) factsByProduct[f.product_id] = []
        factsByProduct[f.product_id].push(f)
      }
      setProductFacts(factsByProduct)
      setSavedQuotes(snapshots)
      setPricingRules(rules)
      if (config) {
        setConfigVersion(config.version)
        setPricingModels(config.models)
        try {
          setCotutorContext(await loadCoTutorPricingContext(config.version.id))
        } catch (e) {
          setConfigError(`CoTutor pricing assumptions unavailable: ${e instanceof Error ? e.message : String(e)}`)
        }
      } else {
        setConfigError('No active pricing config found. Contact your admin.')
      }
    }
    load()
  }, [deal.id])

  // If the loaded/saved centerMode points at a feature that's since been disabled for this
  // user, fall back to 'quote' rather than rendering a mode they can no longer reach via the
  // (now-hidden) tab button.
  useEffect(() => {
    const key = MODE_FEATURE_KEYS[centerMode]
    if (key && !hasFeature(key)) setCenterMode('quote')
  }, [centerMode, hasFeature])

  useEffect(() => {
    if (!dropdownOpen) return
    function handler(e: MouseEvent) {
      const target = e.target as Element
      if (!target.closest('[data-quotes-dropdown]')) setDropdownOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dropdownOpen])

  function handleCalculate() {
    if (!configVersion || pricingModels.length === 0) return
    if (!cotutorContext) { setConfigError('CoTutor pricing assumptions unavailable — cannot calculate.'); return }
    if (inputs.selected_products.length === 0) return
    setCalculating(true)
    try {
      const dealInputs: DealInputs = { ...inputs, deal_id: deal.id }
      const result = calculateQuote(dealInputs, configVersion, pricingModels, cotutorContext, pricingRules)
      setQuoteResult(result)
      setLoadedQuoteId(null)
    } finally {
      setCalculating(false)
    }
  }

  async function handleSaveQuote() {
    if (!quoteResult) return
    setSaving(true)
    setConfigError(null)

    const n = savedQuotes.length + 1
    const name = `Quote ${n}`

    const [linesResult, snapshotResult] = await Promise.all([
      persistQuoteLines(quoteResult),
      persistQuoteSnapshot(quoteResult, name, profile?.id ?? null),
    ])

    if (linesResult.error) {
      setConfigError(`Save failed: ${linesResult.error}`)
      setSaving(false)
      return
    }
    if (snapshotResult.error) {
      setConfigError(`Snapshot save failed: ${snapshotResult.error}`)
      setSaving(false)
      return
    }

    const updated = await loadQuoteSnapshots(deal.id)
    setSavedQuotes(updated)
    if (snapshotResult.id) setLoadedQuoteId(snapshotResult.id)
    setSaving(false)
  }

  async function handleLoadSnapshot(snap: QuoteSnapshot) {
    const result = snap.result_snapshot as unknown as QuoteResult
    const snapInputs = snap.inputs_snapshot as unknown as DealInputs
    const { deal_id: _removed, ...restInputs } = snapInputs
    setInputs({ ...EMPTY_INPUTS, ...restInputs })
    setQuoteResult(result)
    setLoadedQuoteId(snap.id)
    setDropdownOpen(false)
    setCenterMode('quote')
  }

  async function handleDeleteSnapshot(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    setDeletingId(id)
    await removeQuoteSnapshot(id)
    const updated = await loadQuoteSnapshots(deal.id)
    setSavedQuotes(updated)
    if (loadedQuoteId === id) {
      setLoadedQuoteId(null)
      setQuoteResult(null)
      setInputs(EMPTY_INPUTS)
    }
    setDeletingId(null)
  }

  async function handleSaveOutput(content: string, type: string, classification: 'customer_facing' | 'internal_only' | 'mixed_draft') {
    await supabase.from('quote_outputs').insert({
      deal_id: deal.id,
      output_type: type,
      classification,
      content,
      source_trace: quoteResult ? buildQuoteSourceTrace(quoteResult) : {},
      config_version_id: quoteResult?.config_version_id ?? null,
      created_by: profile?.id ?? null,
    })
  }

  async function handleHubSpotPush() {
    setHsPushing(true)
    setHsResult(null)
    try {
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/hubspot-action`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify({
            action: 'push_deal',
            payload: {
              dealName: deal.customer_name,
              amount: quoteResult?.final_total ?? undefined,
              contactEmail: hsEmail.trim() || undefined,
            },
          }),
        }
      )
      const json = await res.json()
      if (json.success) {
        setHsResult({ type: 'success', message: `Deal created in HubSpot.`, url: json.hubspotUrl })
        setHsEmail('')
      } else {
        setHsResult({ type: 'error', message: json.error ?? 'Push failed.' })
      }
    } catch {
      setHsResult({ type: 'error', message: 'Network error. Check your connection.' })
    }
    setHsPushing(false)
  }

  const activeSnap = savedQuotes.find((q) => q.id === loadedQuoteId)

  return (
    <>
    <div className="flex h-full overflow-hidden">
      <div className="w-80 flex-shrink-0 panel-base">
        <div className="panel-header">
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={onClose} className="btn-ghost py-1 px-1.5 flex-shrink-0">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-neutral-900 truncate max-w-36">{deal.customer_name}</div>
              {configVersion && (
                <div className="text-xs text-neutral-400">Config: {configVersion.version_name}</div>
              )}
            </div>
          </div>
          <button
            className="btn-primary py-1.5 text-xs flex-shrink-0"
            onClick={handleCalculate}
            disabled={calculating || !configVersion || !cotutorContext || inputs.selected_products.length === 0}
          >
            <Calculator className="w-3.5 h-3.5" />
            Calculate
          </button>
        </div>

        {configError && (
          <div className="mx-4 mt-3 p-3 bg-error-50 text-error-700 text-xs rounded-lg flex gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {configError}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          <QuoteInputsPanel
            inputs={inputs}
            products={products}
            pricingModels={pricingModels}
            cotutorContext={cotutorContext}
            productFacts={productFacts}
            onInputsChange={setInputs}
          />
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0 border-r border-neutral-200">
        <div className="panel-header">
          <div className="flex items-center gap-1">
            {(['quote', 'proposal', 'battlecard', 'strategy'] as const)
              .filter((m) => !MODE_FEATURE_KEYS[m] || hasFeature(MODE_FEATURE_KEYS[m]!))
              .map((m) => (
              <button
                key={m}
                onClick={() => setCenterMode(m)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize',
                  centerMode === m
                    ? 'bg-brand-600 text-white'
                    : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700'
                )}
              >
                {m}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative" data-quotes-dropdown>
              <button
                onClick={() => setDropdownOpen((o) => !o)}
                className={cn(
                  'btn-secondary py-1.5 text-xs gap-1.5',
                  savedQuotes.length === 0 && 'opacity-50 cursor-not-allowed'
                )}
                disabled={savedQuotes.length === 0}
                title={savedQuotes.length === 0 ? 'No saved quotes yet' : 'Load a saved quote'}
              >
                <Clock className="w-3.5 h-3.5" />
                {activeSnap ? activeSnap.name : 'Saved quotes'}
                <span className="ml-0.5 text-neutral-400 text-xs">({savedQuotes.length})</span>
                <ChevronDown className="w-3 h-3 text-neutral-400" />
              </button>

              {dropdownOpen && savedQuotes.length > 0 && (
                <div className="absolute right-0 top-full mt-1 z-20 bg-white rounded-xl border border-neutral-200 shadow-lg w-72 py-1 overflow-hidden">
                  <div className="px-3 py-2 text-xs font-semibold text-neutral-400 uppercase tracking-wide border-b border-neutral-100">
                    Saved quotes for this deal
                  </div>
                  {savedQuotes.map((snap) => (
                    <button
                      key={snap.id}
                      onClick={() => handleLoadSnapshot(snap)}
                      className={cn(
                        'w-full text-left px-3 py-2.5 hover:bg-neutral-50 transition-colors flex items-center justify-between group',
                        loadedQuoteId === snap.id && 'bg-brand-50'
                      )}
                    >
                      <div>
                        <div className={cn(
                          'text-sm font-medium',
                          loadedQuoteId === snap.id ? 'text-brand-700' : 'text-neutral-900'
                        )}>
                          {snap.name}
                        </div>
                        <div className="text-xs text-neutral-400 mt-0.5">
                          {formatCurrency(snap.final_total)} &middot; {new Date(snap.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <button
                        onClick={(e) => handleDeleteSnapshot(e, snap.id)}
                        disabled={deletingId === snap.id}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded text-neutral-400 hover:text-red-500 hover:bg-red-50 transition-all"
                        title="Delete this quote"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {quoteResult && (
              <button
                onClick={handleSaveQuote}
                disabled={saving}
                className="btn-primary py-1.5 text-xs"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Saving…' : 'Save quote'}
              </button>
            )}
            <button
              onClick={() => { setHsModalOpen(true); setHsResult(null) }}
              className="btn-secondary py-1.5 text-xs border-[#FF7A59] text-[#FF7A59] hover:bg-orange-50"
              title="Push deal to HubSpot CRM"
            >
              <Send className="w-3.5 h-3.5" />
              HubSpot
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <QuoteOutputPanel
            deal={deal}
            quoteResult={quoteResult}
            mode={centerMode}
            centerContent={centerContent}
            onCenterContentChange={setCenterContent}
            onSaveOutput={handleSaveOutput}
            profile={profile}
            proposalSections={proposalSections}
            onProposalSectionChange={handleProposalSectionChange}
            matrix={matrix}
            competitors={competitors}
            products={products}
          />
        </div>
      </div>

      <div className="w-80 flex-shrink-0 panel-base border-r-0">
        <PortiaPanel
          deal={deal}
          quoteResult={quoteResult}
          profile={profile}
          centerMode={centerMode}
          proposalSections={proposalSections}
          onProposalSectionChange={handleProposalSectionChange}
          inputs={inputs}
          onInputsChange={setInputs}
          onCalculate={handleCalculate}
          centerContent={centerContent}
          onCenterContentChange={setCenterContent}
          matrix={matrix}
          competitors={competitors}
        />
      </div>
    </div>

    {hsModalOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#FF7A59] flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-xs">HS</span>
              </div>
              <div>
                <div className="text-sm font-semibold text-neutral-900">Push to HubSpot</div>
                <div className="text-xs text-neutral-500">{deal.customer_name}</div>
              </div>
            </div>
            <button onClick={() => setHsModalOpen(false)} className="btn-ghost py-1 px-1.5">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-5 py-4 space-y-4">
            <div className="bg-neutral-50 rounded-lg px-4 py-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-neutral-500">Deal name</span>
                <span className="font-medium text-neutral-900">{deal.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Amount</span>
                <span className="font-semibold text-brand-700">
                  {quoteResult ? formatCurrency(quoteResult.final_total) : 'No quote — $0'}
                </span>
              </div>
            </div>

            <div>
              <label className="label-base">Contact email (optional)</label>
              <input
                type="email"
                className="input-base"
                placeholder="contact@institution.edu"
                value={hsEmail}
                onChange={(e) => setHsEmail(e.target.value)}
                autoComplete="email"
              />
              <p className="text-xs text-neutral-400 mt-1">
                If provided, a contact will be created/found in HubSpot and linked to this deal.
              </p>
            </div>

            {hsResult && (
              <div className={cn(
                'text-xs px-3 py-2.5 rounded-lg border flex items-start gap-2',
                hsResult.type === 'success'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-error-50 text-error-700 border-red-200'
              )}>
                {hsResult.type === 'success'
                  ? <CheckCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />}
                <div>
                  {hsResult.message}
                  {hsResult.url && (
                    <a
                      href={hsResult.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block mt-1 font-medium underline"
                    >
                      Open in HubSpot
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 px-5 py-4 border-t border-neutral-200 bg-neutral-50">
            <button className="btn-secondary" onClick={() => setHsModalOpen(false)}>
              {hsResult?.type === 'success' ? 'Close' : 'Cancel'}
            </button>
            {hsResult?.type !== 'success' && (
              <button
                className="btn-primary"
                onClick={handleHubSpotPush}
                disabled={hsPushing}
              >
                {hsPushing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                {hsPushing ? 'Pushing…' : 'Push to HubSpot'}
              </button>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  )
}
