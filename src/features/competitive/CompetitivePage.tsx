import { useState, useEffect, useMemo } from 'react'
import {
  Plus, Search, X, ChevronDown, ChevronUp, ChevronRight,
  Clock, AlertTriangle, Shield, DollarSign, Monitor, TrendingUp, Edit2,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { Database } from '@/types/database'
import { CompetitorFormModal } from './CompetitorFormModal'

type Product = Database['public']['Tables']['products']['Row']
type Competitor = Database['public']['Tables']['competitors']['Row']
type MatrixRow = Database['public']['Tables']['competitive_matrix']['Row']

const TIERS = ['tier-1', 'tier-2', 'tier-3', 'watch'] as const
const ESCALATIONS = ['escalated', 'new', 'monitor', 'stable', 'watch'] as const

const TIER_ORDER: Record<string, number> = { 'tier-1': 0, 'tier-2': 1, 'tier-3': 2, 'watch': 3 }
const ESC_ORDER: Record<string, number> = { escalated: 0, new: 1, monitor: 2, stable: 3, watch: 4 }
const CONF_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 }

type SortCol = 'name' | 'tier' | 'escalation' | 'confidence' | 'freshness_date'

function tierLabel(tier: string | null) {
  switch (tier) {
    case 'tier-1': return 'Tier 1'
    case 'tier-2': return 'Tier 2'
    case 'tier-3': return 'Tier 3'
    case 'watch':  return 'Watch'
    default:       return tier ?? '—'
  }
}

function tierColor(tier: string | null) {
  switch (tier) {
    case 'tier-1': return 'bg-red-100 text-red-700 border-red-200'
    case 'tier-2': return 'bg-amber-100 text-amber-700 border-amber-200'
    case 'tier-3': return 'bg-neutral-100 text-neutral-600 border-neutral-200'
    case 'watch':  return 'bg-purple-100 text-purple-700 border-purple-200'
    default:       return 'bg-neutral-100 text-neutral-400 border-neutral-200'
  }
}

function EscalationBadge({ status }: { status: string }) {
  switch (status) {
    case 'escalated': return <span className="inline-flex text-xs font-semibold px-1.5 py-0.5 rounded-full bg-red-600 text-white">ESCALATED</span>
    case 'new':       return <span className="inline-flex text-xs font-semibold px-1.5 py-0.5 rounded-full bg-blue-600 text-white">NEW</span>
    case 'monitor':   return <span className="inline-flex text-xs font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">Monitor</span>
    case 'watch':     return <span className="inline-flex text-xs font-medium px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200">Watch</span>
    case 'stable':    return <span className="inline-flex text-xs font-medium px-1.5 py-0.5 rounded-full bg-neutral-100 text-neutral-500 border border-neutral-200">Stable</span>
    default:          return <span className="text-xs text-neutral-400">{status}</span>
  }
}

function ExpandedDetail({ row }: { row: MatrixRow }) {
  return (
    <div className="px-6 py-5 bg-neutral-50 grid grid-cols-2 gap-x-8 gap-y-4 text-xs">
      {row.sales_positioning_line && (
        <div className="col-span-2 italic text-neutral-700 border-l-2 border-brand-300 pl-3 py-0.5 leading-relaxed">
          "{row.sales_positioning_line}"
        </div>
      )}
      {row.strategic_window && (
        <div className="col-span-2 flex items-start gap-2 text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <Clock className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span className="leading-relaxed">{row.strategic_window}</span>
        </div>
      )}
      {row.threat_rationale && (
        <div>
          <div className="flex items-center gap-1 label-base mb-0.5">
            <AlertTriangle className="w-3 h-3 text-amber-500" /> Why this tier
          </div>
          <p className="text-neutral-700 leading-relaxed">{row.threat_rationale}</p>
        </div>
      )}
      {row.key_overlap && (
        <div>
          <div className="flex items-center gap-1 label-base mb-0.5">
            <TrendingUp className="w-3 h-3 text-neutral-400" /> Key overlap
          </div>
          <p className="text-neutral-700 leading-relaxed">{row.key_overlap}</p>
        </div>
      )}
      {row.pricing_intel && (
        <div>
          <div className="flex items-center gap-1 label-base mb-0.5">
            <DollarSign className="w-3 h-3 text-neutral-400" /> Pricing intel
          </div>
          <p className="text-neutral-700 leading-relaxed">{row.pricing_intel}</p>
        </div>
      )}
      {row.lms_coverage && (
        <div>
          <div className="flex items-center gap-1 label-base mb-0.5">
            <Monitor className="w-3 h-3 text-neutral-400" /> LMS coverage
          </div>
          <p className="text-neutral-700 leading-relaxed">{row.lms_coverage}</p>
        </div>
      )}
      {row.ferpa_positioning && (
        <div>
          <div className="flex items-center gap-1 label-base mb-0.5">
            <Shield className="w-3 h-3 text-neutral-400" /> FERPA positioning
          </div>
          <p className="text-neutral-700 leading-relaxed">{row.ferpa_positioning}</p>
        </div>
      )}
      {row.latest_notes && (
        <div className="col-span-2">
          <div className="label-base mb-0.5">Notes</div>
          <p className="text-neutral-700 leading-relaxed">{row.latest_notes}</p>
        </div>
      )}
      {row.evidence_source && (
        <div className="col-span-2 text-neutral-400 italic">Source: {row.evidence_source}</div>
      )}
    </div>
  )
}

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <ChevronDown className="w-3 h-3 opacity-25" />
  return dir === 'asc'
    ? <ChevronUp className="w-3 h-3 text-brand-600" />
    : <ChevronDown className="w-3 h-3 text-brand-600" />
}

export function CompetitivePage() {
  const [products, setProducts] = useState<Product[]>([])
  const [competitors, setCompetitors] = useState<Competitor[]>([])
  const [matrix, setMatrix] = useState<MatrixRow[]>([])
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [tierFilters, setTierFilters] = useState<Set<string>>(new Set())
  const [escalationFilters, setEscalationFilters] = useState<Set<string>>(new Set())

  const [sortCol, setSortCol] = useState<SortCol>('tier')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [editRow, setEditRow] = useState<MatrixRow | null>(null)

  async function loadData() {
    const [{ data: prods }, { data: comps }, { data: mat }] = await Promise.all([
      supabase.from('products').select('*').eq('status', 'active'),
      supabase.from('competitors').select('*').order('name'),
      supabase.from('competitive_matrix').select('*'),
    ])
    setProducts(prods ?? [])
    setCompetitors(comps ?? [])
    setMatrix(mat ?? [])
    if (prods?.[0] && !selectedProduct) setSelectedProduct(prods[0].id)
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  function handleSort(col: SortCol) {
    if (col === sortCol) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  function toggleFilter(set: Set<string>, setFn: (s: Set<string>) => void, val: string) {
    const next = new Set(set)
    if (next.has(val)) next.delete(val)
    else next.add(val)
    setFn(next)
  }

  function clearFilters() {
    setSearch('')
    setTierFilters(new Set())
    setEscalationFilters(new Set())
  }

  const productRows = useMemo(() =>
    matrix.filter(r => r.product_id === selectedProduct),
    [matrix, selectedProduct]
  )

  const filteredMatrix = useMemo(() => {
    let rows = [...productRows]
    if (search) {
      const q = search.toLowerCase()
      rows = rows.filter(r => {
        const comp = competitors.find(c => c.id === r.competitor_id)
        return (
          (comp?.name ?? '').toLowerCase().includes(q) ||
          (comp?.category ?? '').toLowerCase().includes(q) ||
          (r.competitor_strength ?? '').toLowerCase().includes(q) ||
          (r.apporto_edge ?? '').toLowerCase().includes(q)
        )
      })
    }
    if (tierFilters.size > 0) rows = rows.filter(r => tierFilters.has(r.threat_tier ?? ''))
    if (escalationFilters.size > 0) rows = rows.filter(r => escalationFilters.has(r.escalation_status))

    return rows.sort((a, b) => {
      let diff = 0
      if (sortCol === 'name') {
        const na = (competitors.find(c => c.id === a.competitor_id)?.name ?? '').toLowerCase()
        const nb = (competitors.find(c => c.id === b.competitor_id)?.name ?? '').toLowerCase()
        diff = na.localeCompare(nb)
      } else if (sortCol === 'tier') {
        diff = (TIER_ORDER[a.threat_tier ?? ''] ?? 9) - (TIER_ORDER[b.threat_tier ?? ''] ?? 9)
      } else if (sortCol === 'escalation') {
        diff = (ESC_ORDER[a.escalation_status] ?? 9) - (ESC_ORDER[b.escalation_status] ?? 9)
      } else if (sortCol === 'confidence') {
        diff = (CONF_ORDER[a.confidence] ?? 9) - (CONF_ORDER[b.confidence] ?? 9)
      } else if (sortCol === 'freshness_date') {
        diff = (a.freshness_date ?? '').localeCompare(b.freshness_date ?? '')
      }
      return sortDir === 'asc' ? diff : -diff
    })
  }, [productRows, competitors, search, tierFilters, escalationFilters, sortCol, sortDir])

  const presentTiers = useMemo(() => {
    const s = new Set(productRows.map(r => r.threat_tier).filter(Boolean) as string[])
    return TIERS.filter(t => s.has(t))
  }, [productRows])

  const presentEscalations = useMemo(() => {
    const s = new Set(productRows.map(r => r.escalation_status).filter(Boolean))
    return ESCALATIONS.filter(e => s.has(e))
  }, [productRows])

  const escalatedCount = productRows.filter(r => r.escalation_status === 'escalated').length
  const tier1Count = productRows.filter(r => r.threat_tier === 'tier-1').length
  const hasActiveFilters = search.length > 0 || tierFilters.size > 0 || escalationFilters.size > 0

  function Th({ col, children, className }: { col: SortCol; children: React.ReactNode; className?: string }) {
    return (
      <th
        onClick={() => handleSort(col)}
        className={cn(
          'px-3 py-2.5 text-left text-xs font-medium text-neutral-500 cursor-pointer select-none whitespace-nowrap hover:text-neutral-800 transition-colors',
          className
        )}
      >
        <div className="flex items-center gap-1">
          {children}
          <SortIcon active={sortCol === col} dir={sortDir} />
        </div>
      </th>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-neutral-200 bg-white flex-shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Competitive Intelligence</h1>
          <p className="text-sm text-neutral-500">Battlecard data · Competitor positioning · Escalation tracking</p>
        </div>
        <button
          onClick={() => { setEditRow(null); setModalOpen(true) }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Competitor
        </button>
      </div>

      {/* Product tabs */}
      <div className="flex gap-1 px-6 py-3 border-b border-neutral-200 bg-white flex-shrink-0">
        {products.map(p => (
          <button
            key={p.id}
            onClick={() => { setSelectedProduct(p.id); clearFilters() }}
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

      {/* Filter bar */}
      <div className="px-6 py-2.5 border-b border-neutral-100 bg-white flex-shrink-0 flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 pr-7 py-1.5 text-sm border border-neutral-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-400 w-44"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
              <X className="w-3 h-3 text-neutral-400 hover:text-neutral-600" />
            </button>
          )}
        </div>

        {presentTiers.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-neutral-400">Tier:</span>
            {presentTiers.map(t => (
              <button
                key={t}
                onClick={() => toggleFilter(tierFilters, setTierFilters, t)}
                className={cn(
                  'text-xs px-2 py-0.5 rounded border transition-colors',
                  tierFilters.has(t) ? tierColor(t) : 'bg-white text-neutral-500 border-neutral-200 hover:border-neutral-300'
                )}
              >
                {tierLabel(t)}
              </button>
            ))}
          </div>
        )}

        {presentEscalations.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-neutral-400">Status:</span>
            {presentEscalations.map(e => (
              <button
                key={e}
                onClick={() => toggleFilter(escalationFilters, setEscalationFilters, e)}
                className={cn(
                  'text-xs px-2 py-0.5 rounded border transition-colors',
                  escalationFilters.has(e)
                    ? 'bg-neutral-800 text-white border-neutral-800'
                    : 'bg-white text-neutral-500 border-neutral-200 hover:border-neutral-300'
                )}
              >
                {e.charAt(0).toUpperCase() + e.slice(1)}
              </button>
            ))}
          </div>
        )}

        {hasActiveFilters && (
          <button onClick={clearFilters} className="text-xs text-neutral-400 hover:text-neutral-600 underline">
            Clear
          </button>
        )}

        <div className="ml-auto flex items-center gap-3 text-xs">
          <span className="text-neutral-400">{filteredMatrix.length} of {productRows.length}</span>
          {tier1Count > 0 && <span className="text-red-600 font-medium">{tier1Count} Tier 1</span>}
          {escalatedCount > 0 && (
            <span className="text-red-700 font-semibold bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
              {escalatedCount} escalated
            </span>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-8 text-sm text-neutral-400">Loading…</div>
        ) : filteredMatrix.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-3xl mb-3">🔍</div>
            <p className="text-neutral-500 text-sm mb-1">
              {productRows.length === 0 ? 'No competitive data yet for this product.' : 'No results match your filters.'}
            </p>
            <p className="text-neutral-400 text-xs">
              {productRows.length === 0
                ? 'Click "Add Competitor" to start building the battlecard.'
                : 'Try adjusting your filters or search term.'}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm border-collapse min-w-[820px]">
            <thead className="sticky top-0 bg-neutral-50 border-b border-neutral-200 z-10">
              <tr>
                <Th col="name" className="pl-5 w-[220px]">Competitor</Th>
                <Th col="tier" className="w-[110px]">Tier</Th>
                <Th col="escalation" className="w-[120px]">Status</Th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-neutral-500">Strength</th>
                <th className="px-3 py-2.5 text-left text-xs font-medium text-neutral-500">Apporto edge</th>
                <Th col="confidence" className="w-[95px]">Confidence</Th>
                <Th col="freshness_date" className="w-[90px]">Updated</Th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {filteredMatrix.map(row => {
                const comp = competitors.find(c => c.id === row.competitor_id)
                const isExpanded = expandedId === row.id
                return (
                  <>
                    <tr
                      key={row.id}
                      className={cn(
                        'border-b border-neutral-100 cursor-pointer group transition-colors',
                        isExpanded ? 'bg-blue-50/50 border-blue-100' : 'hover:bg-neutral-50'
                      )}
                      onClick={() => setExpandedId(isExpanded ? null : row.id)}
                    >
                      <td className="px-3 py-3 pl-5">
                        <div className="flex items-center gap-2">
                          <ChevronRight className={cn(
                            'w-3.5 h-3.5 text-neutral-400 flex-shrink-0 transition-transform duration-150',
                            isExpanded && 'rotate-90'
                          )} />
                          <div>
                            <div className="font-medium text-neutral-900 leading-snug">{comp?.name ?? row.competitor_id}</div>
                            {comp?.category && <div className="text-xs text-neutral-400 mt-0.5">{comp.category}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className={cn('text-xs font-medium px-2 py-0.5 rounded border', tierColor(row.threat_tier))}>
                          {tierLabel(row.threat_tier)}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <EscalationBadge status={row.escalation_status} />
                      </td>
                      <td className="px-3 py-3 max-w-[200px]">
                        <p className="text-xs text-neutral-600 line-clamp-2 leading-relaxed">{row.competitor_strength ?? '—'}</p>
                      </td>
                      <td className="px-3 py-3 max-w-[200px]">
                        <p className="text-xs text-neutral-600 line-clamp-2 leading-relaxed">{row.apporto_edge ?? '—'}</p>
                      </td>
                      <td className="px-3 py-3">
                        <span className={cn('text-xs font-medium',
                          row.confidence === 'high' ? 'text-emerald-600' :
                          row.confidence === 'medium' ? 'text-amber-600' :
                          'text-red-500'
                        )}>
                          {row.confidence}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-neutral-400 whitespace-nowrap">
                        {row.freshness_date ?? '—'}
                      </td>
                      <td className="px-3 py-3 text-right pr-4">
                        <button
                          onClick={e => { e.stopPropagation(); setEditRow(row); setModalOpen(true) }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-neutral-200"
                          title="Edit"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-neutral-500" />
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${row.id}-detail`} className="border-b border-neutral-200">
                        <td colSpan={8} className="p-0">
                          <ExpandedDetail row={row} />
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <CompetitorFormModal
          products={products}
          competitors={competitors}
          selectedProductId={selectedProduct}
          editRow={editRow}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); loadData() }}
        />
      )}
    </div>
  )
}
