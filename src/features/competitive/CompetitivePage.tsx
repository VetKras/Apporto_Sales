import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { Database } from '@/types/database'

type Product = Database['public']['Tables']['products']['Row']
type Competitor = Database['public']['Tables']['competitors']['Row']
type MatrixRow = Database['public']['Tables']['competitive_matrix']['Row']

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

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-neutral-200 bg-white flex-shrink-0">
        <h1 className="text-lg font-semibold text-neutral-900">Competitive</h1>
        <p className="text-sm text-neutral-500">Battlecard data · Competitor positioning · Data gaps</p>
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
          <div className="space-y-4 max-w-3xl">
            {filteredMatrix.map((row) => {
              const comp = competitors.find((c) => c.id === row.competitor_id)
              return (
                <div key={row.id} className="card p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-semibold text-neutral-900">{comp?.name ?? row.competitor_id}</div>
                      <div className="text-xs text-neutral-500">{comp?.category}</div>
                    </div>
                    {row.threat_tier && (
                      <span className={cn(
                        'text-xs font-medium px-2 py-0.5 rounded-full',
                        row.threat_tier === 'high' ? 'bg-red-100 text-red-700' :
                        row.threat_tier === 'medium' ? 'bg-amber-100 text-amber-700' :
                        'bg-neutral-100 text-neutral-600'
                      )}>
                        {row.threat_tier} threat
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {row.competitor_strength && (
                      <div>
                        <div className="label-base text-red-600">Competitor strength</div>
                        <p className="text-neutral-700 leading-relaxed">{row.competitor_strength}</p>
                      </div>
                    )}
                    {row.apporto_edge && (
                      <div>
                        <div className="label-base text-emerald-600">Apporto edge</div>
                        <p className="text-neutral-700 leading-relaxed">{row.apporto_edge}</p>
                      </div>
                    )}
                    {row.latest_notes && (
                      <div className="col-span-2">
                        <div className="label-base">Notes</div>
                        <p className="text-neutral-600">{row.latest_notes}</p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-neutral-100">
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
            })}
          </div>
        )}

        {/* Competitors reference */}
        <div className="mt-8 max-w-3xl">
          <h2 className="text-sm font-semibold text-neutral-700 mb-3">Tracked competitors</h2>
          <div className="grid gap-2 grid-cols-2">
            {competitors.map((c) => (
              <div key={c.id} className="card p-3">
                <div className="text-sm font-medium text-neutral-800">{c.name}</div>
                <div className="text-xs text-neutral-500 mt-0.5">{c.category}</div>
                {c.notes && <div className="text-xs text-neutral-400 mt-1 leading-relaxed">{c.notes}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
