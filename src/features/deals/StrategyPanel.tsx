import { AlertTriangle, TrendingUp } from 'lucide-react'
import { cn, formatCurrency, approvalColor } from '@/lib/utils'
import type { QuoteResult, DealInputs } from '@/lib/pricing-engine'
import type { Database } from '@/types/database'

type Deal = Database['public']['Tables']['deals']['Row']
type Competitor = Database['public']['Tables']['competitors']['Row']
type MatrixRow = Database['public']['Tables']['competitive_matrix']['Row']
type Product = Database['public']['Tables']['products']['Row']

const TIER_ORDER: Record<string, number> = { 'tier-1': 0, 'tier-2': 1, 'tier-3': 2, 'watch': 3 }
const ESC_ORDER: Record<string, number> = { escalated: 0, new: 1, monitor: 2, stable: 3, watch: 4 }

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

interface Props {
  deal: Deal
  quoteResult: QuoteResult
  inputs: Omit<DealInputs, 'deal_id'>
  matrix: MatrixRow[]
  competitors: Competitor[]
  products: Product[]
  selectedProductIds: string[]
  centerContent: string
}

export function StrategyPanel({ deal, quoteResult, matrix, competitors, products, selectedProductIds, centerContent }: Props) {
  const selectedProducts = selectedProductIds
    .map(id => products.find(p => p.id === id))
    .filter((p): p is Product => Boolean(p))

  const relevantRows = matrix.filter(r => selectedProductIds.includes(r.product_id))

  const threats = [...relevantRows]
    .filter(r => r.escalation_status === 'escalated' || r.threat_tier === 'tier-1')
    .sort((a, b) => {
      const escDiff = (ESC_ORDER[a.escalation_status] ?? 99) - (ESC_ORDER[b.escalation_status] ?? 99)
      if (escDiff !== 0) return escDiff
      return (TIER_ORDER[a.threat_tier ?? ''] ?? 99) - (TIER_ORDER[b.threat_tier ?? ''] ?? 99)
    })
    .slice(0, 5)

  return (
    <div className="p-6 space-y-6">
      {/* Deal context strip */}
      <div className="grid grid-cols-2 gap-3 p-4 bg-neutral-50 rounded-xl border border-neutral-200 text-xs">
        <div>
          <div className="label-base">Customer</div>
          <div className="font-medium text-neutral-900">{deal.customer_name}</div>
        </div>
        <div>
          <div className="label-base">Status</div>
          <div className="font-medium text-neutral-900 capitalize">{quoteResult.inputs_snapshot.customer_status}</div>
        </div>
        <div>
          <div className="label-base">Products</div>
          <div className="font-medium text-neutral-900">{selectedProducts.map(p => p.name).join(', ') || '—'}</div>
        </div>
        <div>
          <div className="label-base">Quote total</div>
          <div className="font-semibold text-brand-700">{formatCurrency(quoteResult.final_total)}</div>
        </div>
        <div>
          <div className="label-base">Term</div>
          <div className="font-medium text-neutral-900 capitalize">{quoteResult.assumptions.contract_term}</div>
        </div>
        <div>
          <div className="label-base">Approval required</div>
          <div className={cn('font-semibold', approvalColor(quoteResult.approval_level))}>
            {quoteResult.approval_level}
          </div>
        </div>
        {quoteResult.discount_percent > 0 && (
          <div className="col-span-2">
            <div className="label-base">Discount</div>
            <div className="font-medium text-neutral-900">{quoteResult.discount_percent}%</div>
          </div>
        )}
      </div>

      {/* Active threats */}
      {threats.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
            <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Active threats</span>
          </div>
          <div className="space-y-2">
            {threats.map(row => {
              const comp = competitors.find(c => c.id === row.competitor_id)
              return (
                <div key={row.id} className="flex items-start gap-2 px-3 py-2.5 border border-neutral-200 rounded-lg bg-white text-xs">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium text-neutral-900">{comp?.name ?? row.competitor_id}</span>
                      {row.threat_tier && (
                        <span className={cn('px-1.5 py-0.5 rounded border text-xs font-medium', tierColor(row.threat_tier))}>
                          {row.threat_tier === 'tier-1' ? 'T1' : row.threat_tier === 'tier-2' ? 'T2' : row.threat_tier}
                        </span>
                      )}
                      <EscalationBadge status={row.escalation_status} />
                    </div>
                    {row.sales_positioning_line && (
                      <p className="text-neutral-500 mt-0.5 leading-relaxed">{row.sales_positioning_line}</p>
                    )}
                    {row.apporto_edge && (
                      <p className="text-emerald-700 mt-0.5 leading-relaxed">Edge: {row.apporto_edge}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Strategy brief */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="w-3.5 h-3.5 text-brand-500" />
          <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Strategy brief</span>
        </div>
        {centerContent ? (
          <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 text-sm text-neutral-800 whitespace-pre-wrap leading-relaxed">
            {centerContent}
          </div>
        ) : (
          <div className="border border-dashed border-neutral-200 rounded-lg p-5 text-center">
            <p className="text-xs text-neutral-400 leading-relaxed">
              Ask Portia: "Generate a strategy brief for {deal.customer_name}"
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
