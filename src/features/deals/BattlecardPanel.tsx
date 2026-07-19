import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronDown, ChevronUp, ExternalLink, AlertTriangle, Clock,
  Shield, DollarSign, Monitor, TrendingUp, Target,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Database } from '@/types/database'

type Product = Database['public']['Tables']['products']['Row']
type Competitor = Database['public']['Tables']['competitors']['Row']
type MatrixRow = Database['public']['Tables']['competitive_matrix']['Row']

const TIER_ORDER: Record<string, number> = { 'tier-1': 0, 'tier-2': 1, 'tier-3': 2, 'watch': 3 }
const ESC_ORDER: Record<string, number> = { escalated: 0, new: 1, monitor: 2, stable: 3, watch: 4 }

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

function sortRows(rows: MatrixRow[]): MatrixRow[] {
  return [...rows].sort((a, b) => {
    const escDiff = (ESC_ORDER[a.escalation_status] ?? 99) - (ESC_ORDER[b.escalation_status] ?? 99)
    if (escDiff !== 0) return escDiff
    return (TIER_ORDER[a.threat_tier ?? ''] ?? 99) - (TIER_ORDER[b.threat_tier ?? ''] ?? 99)
  })
}

function CompetitorCard({ row, competitor }: { row: MatrixRow; competitor: Competitor | undefined }) {
  const [expanded, setExpanded] = useState(row.escalation_status === 'escalated')
  const name = competitor?.name ?? row.competitor_id

  return (
    <div className="border border-neutral-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-neutral-50 transition-colors text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm text-neutral-900">{name}</span>
            {row.threat_tier && (
              <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded border', tierColor(row.threat_tier))}>
                {tierLabel(row.threat_tier)}
              </span>
            )}
            <EscalationBadge status={row.escalation_status} />
          </div>
          {row.sales_positioning_line && !expanded && (
            <p className="text-xs text-neutral-500 truncate mt-0.5">{row.sales_positioning_line}</p>
          )}
        </div>
        {expanded
          ? <ChevronUp className="w-4 h-4 text-neutral-400 flex-shrink-0" />
          : <ChevronDown className="w-4 h-4 text-neutral-400 flex-shrink-0" />
        }
      </button>

      {expanded && (
        <div className="border-t border-neutral-100 bg-neutral-50">
          {row.sales_positioning_line && (
            <div className="mx-3 mt-2 mb-1 px-3 py-2 italic text-xs text-neutral-700 border-l-2 border-brand-300 leading-relaxed">
              "{row.sales_positioning_line}"
            </div>
          )}

          {(row.competitor_strength || row.apporto_edge) && (
            <div className="grid grid-cols-2 border-t border-neutral-100 mt-1">
              <div className="px-3 py-2.5 border-r border-neutral-100">
                <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-1">Their strength</div>
                <p className="text-xs text-neutral-700 leading-relaxed">{row.competitor_strength ?? '—'}</p>
              </div>
              <div className="px-3 py-2.5">
                <div className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-1">Our edge</div>
                <p className="text-xs text-neutral-700 leading-relaxed">{row.apporto_edge ?? '—'}</p>
              </div>
            </div>
          )}

          <div className="px-3 py-3 grid grid-cols-2 gap-x-4 gap-y-3 text-xs border-t border-neutral-100">
            {row.strategic_window && (
              <div className="col-span-2 flex items-start gap-2 text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
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
              <div className="col-span-2">
                <div className="flex items-center gap-1 label-base mb-0.5">
                  <Shield className="w-3 h-3 text-neutral-400" /> FERPA positioning
                </div>
                <p className="text-neutral-700 leading-relaxed">{row.ferpa_positioning}</p>
              </div>
            )}
            {row.evidence_source && (
              <div className="col-span-2 text-neutral-400 italic">Source: {row.evidence_source}</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

interface Props {
  matrix: MatrixRow[]
  competitors: Competitor[]
  products: Product[]
  selectedProductIds: string[]
  centerContent: string
}

export function BattlecardPanel({ matrix, competitors, products, selectedProductIds, centerContent }: Props) {
  const navigate = useNavigate()

  const filteredRows = matrix.filter(r => selectedProductIds.includes(r.product_id))

  if (filteredRows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <Target className="w-10 h-10 text-neutral-200 mb-4" />
        <p className="text-sm font-medium text-neutral-600 mb-1">No competitive data for selected products</p>
        <p className="text-xs text-neutral-400 mb-4 leading-relaxed">
          Add competitor data for the products in this quote to populate the battlecard.
        </p>
        <button
          onClick={() => navigate('/competitive')}
          className="flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700"
        >
          <ExternalLink className="w-3.5 h-3.5" /> Open competitive page
        </button>
      </div>
    )
  }

  const byProduct = selectedProductIds
    .map(pid => ({
      product: products.find(p => p.id === pid),
      rows: sortRows(filteredRows.filter(r => r.product_id === pid)),
    }))
    .filter(g => g.rows.length > 0)

  return (
    <div className="p-6 space-y-8">
      {byProduct.map(({ product, rows }) => (
        <div key={product?.id ?? 'unknown'}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
              {product?.name ?? 'Unknown Product'}
            </h3>
            <span className="text-xs text-neutral-400">{rows.length} competitor{rows.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="space-y-2">
            {rows.map(row => (
              <CompetitorCard
                key={row.id}
                row={row}
                competitor={competitors.find(c => c.id === row.competitor_id)}
              />
            ))}
          </div>
        </div>
      ))}

      {centerContent ? (
        <div>
          <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Portia Brief</div>
          <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 text-sm text-neutral-800 whitespace-pre-wrap leading-relaxed">
            {centerContent}
          </div>
        </div>
      ) : (
        <div className="text-xs text-neutral-400 text-center py-3 border-t border-neutral-100">
          Ask Portia: "Generate a competitive brief for this deal"
        </div>
      )}

      <div className="text-center pb-2">
        <button
          onClick={() => navigate('/competitive')}
          className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-brand-600 transition-colors"
        >
          <ExternalLink className="w-3 h-3" /> Manage competitive data
        </button>
      </div>
    </div>
  )
}
