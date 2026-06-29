import { useState, useEffect } from 'react'
import { AlertTriangle, TrendingUp, Clock, Shield, DollarSign, Monitor, ChevronDown, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { Database } from '@/types/database'

type Product = Database['public']['Tables']['products']['Row']
type Competitor = Database['public']['Tables']['competitors']['Row']
type MatrixRow = Database['public']['Tables']['competitive_matrix']['Row']

function tierColor(tier: string | null) {
  switch (tier) {
    case 'tier-1': return 'bg-red-100 text-red-700 border-red-200'
    case 'tier-2': return 'bg-amber-100 text-amber-700 border-amber-200'
    case 'tier-3': return 'bg-neutral-100 text-neutral-600 border-neutral-200'
    case 'watch':  return 'bg-purple-100 text-purple-700 border-purple-200'
    default:       return 'bg-neutral-100 text-neutral-500 border-neutral-200'
  }
}

function tierLabel(tier: string | null) {
  switch (tier) {
    case 'tier-1': return 'Tier 1 — Direct threat'
    case 'tier-2': return 'Tier 2 — Partial overlap'
    case 'tier-3': return 'Tier 3 — Low threat'
    case 'watch':  return 'Watch — Needs research'
    default:       return tier ?? 'Unknown'
  }
}

function escalationBadge(status: string) {
  switch (status) {
    case 'escalated': return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-600 text-white">ESCALATED</span>
    case 'new':       return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-600 text-white">NEW</span>
    case 'monitor':   return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">Monitor</span>
    case 'watch':     return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200">Watch</span>
    default:          return null
  }
}

function InfoRow({ label, value, icon }: { label: string; value: string | null; icon?: React.ReactNode }) {
  if (!value) return null
  return (
    <div>
      <div className="flex items-center gap-1.5 label-base mb-0.5">
        {icon}
        {label}
      </div>
      <p className="text-xs text-neutral-700 leading-relaxed">{value}</p>
    </div>
  )
}

function CompetitorCard({ row, competitor }: { row: MatrixRow; competitor: Competitor | undefined }) {
  const [expanded, setExpanded] = useState(false)
  const hasExtra = row.threat_rationale || row.key_overlap || row.pricing_intel ||
                   row.lms_coverage || row.ferpa_positioning || row.strategic_window ||
                   row.evidence_source

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-neutral-900">{competitor?.name ?? row.competitor_id}</span>
              {escalationBadge(row.escalation_status)}
            </div>
            <div className="text-xs text-neutral-500 mt-0.5">{competitor?.category}</div>
          </div>
          <span className={cn('text-xs font-medium px-2 py-0.5 rounded border flex-shrink-0 whitespace-nowrap', tierColor(row.threat_tier))}>
            {tierLabel(row.threat_tier)}
          </span>
        </div>

        {/* Sales positioning one-liner */}
        {row.sales_positioning_line && (
          <div className="mt-2 text-sm text-neutral-800 italic border-l-2 border-brand-300 pl-3 leading-relaxed">
            "{row.sales_positioning_line}"
          </div>
        )}
      </div>

      {/* Core strength / edge grid */}
      <div className="grid grid-cols-2 gap-4 px-4 pb-4 text-sm">
        {row.competitor_strength && (
          <div>
            <div className="label-base text-red-600 mb-0.5">Competitor strength</div>
            <p className="text-neutral-700 leading-relaxed text-xs">{row.competitor_strength}</p>
          </div>
        )}
        {row.apporto_edge && (
          <div>
            <div className="label-base text-emerald-600 mb-0.5">Apporto edge</div>
            <p className="text-neutral-700 leading-relaxed text-xs">{row.apporto_edge}</p>
          </div>
        )}
      </div>

      {/* Strategic window — always visible if present */}
      {row.strategic_window && (
        <div className="mx-4 mb-4 flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <Clock className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span className="leading-relaxed">{row.strategic_window}</span>
        </div>
      )}

      {/* Expandable detail */}
      {hasExtra && (
        <>
          <button
            onClick={() => setExpanded((e) => !e)}
            className="w-full flex items-center justify-between px-4 py-2.5 border-t border-neutral-100 hover:bg-neutral-50 transition-colors text-xs font-medium text-neutral-500"
          >
            <span>Intelligence detail</span>
            {expanded
              ? <ChevronDown className="w-3.5 h-3.5" />
              : <ChevronRight className="w-3.5 h-3.5" />}
          </button>

          {expanded && (
            <div className="px-4 pb-4 space-y-3 border-t border-neutral-100">
              <InfoRow
                label="Why this tier"
                value={row.threat_rationale}
                icon={<AlertTriangle className="w-3 h-3 text-amber-500" />}
              />
              <InfoRow
                label="Key overlap"
                value={row.key_overlap}
                icon={<TrendingUp className="w-3 h-3 text-neutral-400" />}
              />
              <InfoRow
                label="Pricing intel"
                value={row.pricing_intel}
                icon={<DollarSign className="w-3 h-3 text-neutral-400" />}
              />
              <InfoRow
                label="LMS coverage"
                value={row.lms_coverage}
                icon={<Monitor className="w-3 h-3 text-neutral-400" />}
              />
              <InfoRow
                label="FERPA positioning"
                value={row.ferpa_positioning}
                icon={<Shield className="w-3 h-3 text-neutral-400" />}
              />
              {row.latest_notes && (
                <InfoRow label="Notes" value={row.latest_notes} />
              )}
              {row.evidence_source && (
                <p className="text-xs text-neutral-400 italic">Source: {row.evidence_source}</p>
              )}
            </div>
          )}
        </>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-neutral-100 bg-neutral-50">
        <span className={cn(
          'text-xs',
          row.confidence === 'high' ? 'text-emerald-600' :
          row.confidence === 'medium' ? 'text-amber-600' :
          'text-red-500'
        )}>
          Confidence: {row.confidence}
        </span>
        {row.freshness_date && (
          <span className="text-xs text-neutral-400">Updated {row.freshness_date}</span>
        )}
      </div>
    </div>
  )
}

export function CompetitivePage() {
  const [products, setProducts] = useState<Product[]>([])
  const [competitors, setCompetitors] = useState<Competitor[]>([])
  const [matrix, setMatrix] = useState<MatrixRow[]>([])
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: prods }, { data: comps }, { data: mat }] = await Promise.all([
        supabase.from('products').select('*').eq('status', 'active'),
        supabase.from('competitors').select('*').order('name'),
        supabase.from('competitive_matrix').select('*'),
      ])
      setProducts(prods ?? [])
      setCompetitors(comps ?? [])
      setMatrix(mat ?? [])
      if (prods?.[0]) setSelectedProduct(prods[0].id)
      setLoading(false)
    }
    load()
  }, [])

  const filteredMatrix = matrix.filter((m) => m.product_id === selectedProduct)

  // Sort: escalated first, then new, then tier-1, tier-2, tier-3, watch
  const tierOrder: Record<string, number> = { 'tier-1': 2, 'tier-2': 3, 'tier-3': 4, 'watch': 5 }
  const escalationOrder: Record<string, number> = { escalated: 0, new: 1, monitor: 2, stable: 3, watch: 4 }
  const sortedMatrix = [...filteredMatrix].sort((a, b) => {
    const eDiff = (escalationOrder[a.escalation_status] ?? 9) - (escalationOrder[b.escalation_status] ?? 9)
    if (eDiff !== 0) return eDiff
    return (tierOrder[a.threat_tier ?? ''] ?? 9) - (tierOrder[b.threat_tier ?? ''] ?? 9)
  })

  const escalatedCount = filteredMatrix.filter((r) => r.escalation_status === 'escalated').length
  const tier1Count     = filteredMatrix.filter((r) => r.threat_tier === 'tier-1').length

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-neutral-200 bg-white flex-shrink-0">
        <h1 className="text-lg font-semibold text-neutral-900">Competitive Intelligence</h1>
        <p className="text-sm text-neutral-500">Battlecard data · Competitor positioning · Escalation tracking</p>
      </div>

      {/* Product tabs */}
      <div className="flex gap-1 px-6 py-3 border-b border-neutral-200 bg-white flex-shrink-0">
        {products.map((p) => (
          <button
            key={p.id}
            onClick={() => setSelectedProduct(p.id)}
            className={cn(
              'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
              selectedProduct === p.id
                ? 'bg-brand-600 text-white'
                : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700'
            )}
          >
            {p.name}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="text-sm text-neutral-400">Loading…</div>
        ) : filteredMatrix.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-3xl mb-3">🔍</div>
            <p className="text-neutral-500 text-sm mb-1">No competitive data yet for this product.</p>
            <p className="text-neutral-400 text-xs">Upload competitive analysis documents or have Portia help build the battlecard.</p>
          </div>
        ) : (
          <div className="max-w-3xl space-y-6">
            {/* Summary bar */}
            <div className="flex items-center gap-4 text-xs text-neutral-500">
              <span>{filteredMatrix.length} competitors tracked</span>
              {tier1Count > 0 && (
                <span className="text-red-600 font-medium">{tier1Count} Tier 1</span>
              )}
              {escalatedCount > 0 && (
                <span className="text-red-700 font-semibold bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                  {escalatedCount} escalated
                </span>
              )}
            </div>

            {/* Cards */}
            <div className="space-y-4">
              {sortedMatrix.map((row) => (
                <CompetitorCard
                  key={row.id}
                  row={row}
                  competitor={competitors.find((c) => c.id === row.competitor_id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
