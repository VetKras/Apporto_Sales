import { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight, Package, AlertTriangle, CheckCircle, Info } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { Database } from '@/types/database'

type Product = Database['public']['Tables']['products']['Row']
type ProductFact = Database['public']['Tables']['product_facts']['Row']

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [facts, setFacts] = useState<Record<string, ProductFact[]>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: prods } = await supabase.from('products').select('*').eq('status', 'active').order('name')
      const { data: allFacts } = await supabase.from('product_facts').select('*').order('fact_type')
      const byProduct: Record<string, ProductFact[]> = {}
      for (const f of (allFacts ?? [])) {
        if (!byProduct[f.product_id]) byProduct[f.product_id] = []
        byProduct[f.product_id].push(f)
      }
      setProducts(prods ?? [])
      setFacts(byProduct)
      if (prods?.[0]) setExpanded(prods[0].id)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="p-6 text-sm text-neutral-400">Loading products…</div>

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-neutral-200 bg-white flex-shrink-0">
        <h1 className="text-lg font-semibold text-neutral-900">Products</h1>
        <p className="text-sm text-neutral-500">V1 AI Suite: CoTutor · PowerGrader · TrustEd · ExamSpace</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-3 max-w-3xl">
        {products.map((p) => {
          const productFacts = facts[p.id] ?? []
          const isOpen = expanded === p.id
          const salesClaims = productFacts.filter((f) => f.fact_type === 'sales_safe_claim')
          const risks = productFacts.filter((f) => f.fact_type === 'known_risk')
          const integrations = productFacts.filter((f) => f.fact_type === 'integration')
          const capabilities = productFacts.filter((f) => f.fact_type === 'capability')

          return (
            <div key={p.id} className="card overflow-hidden">
              <button
                onClick={() => setExpanded(isOpen ? null : p.id)}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-neutral-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-brand-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Package className="w-4 h-4 text-brand-600" />
                  </div>
                  <div>
                    <div className="text-base font-semibold text-neutral-900">{p.name}</div>
                    <div className="text-xs text-neutral-500">{p.category}</div>
                  </div>
                </div>
                {isOpen ? <ChevronDown className="w-4 h-4 text-neutral-400" /> : <ChevronRight className="w-4 h-4 text-neutral-400" />}
              </button>

              {isOpen && (
                <div className="border-t border-neutral-100 px-4 pb-4 space-y-4">
                  <div className="pt-3">
                    <p className="text-sm text-neutral-700 leading-relaxed">{p.positioning}</p>
                    <p className="text-sm text-neutral-600 mt-2 leading-relaxed">{p.description}</p>
                  </div>

                  {salesClaims.length > 0 && (
                    <FactGroup icon={<CheckCircle className="w-3.5 h-3.5 text-emerald-600" />} label="Sales-safe claims" color="emerald">
                      {salesClaims.map((f) => <FactRow key={f.id} fact={f} />)}
                    </FactGroup>
                  )}

                  {capabilities.length > 0 && (
                    <FactGroup icon={<Info className="w-3.5 h-3.5 text-brand-600" />} label="Capabilities" color="brand">
                      {capabilities.map((f) => <FactRow key={f.id} fact={f} />)}
                    </FactGroup>
                  )}

                  {integrations.length > 0 && (
                    <FactGroup icon={<Info className="w-3.5 h-3.5 text-neutral-500" />} label="Integrations" color="neutral">
                      {integrations.map((f) => <FactRow key={f.id} fact={f} />)}
                    </FactGroup>
                  )}

                  {risks.length > 0 && (
                    <FactGroup icon={<AlertTriangle className="w-3.5 h-3.5 text-amber-600" />} label="Known risks / data gaps" color="amber">
                      {risks.map((f) => <FactRow key={f.id} fact={f} />)}
                    </FactGroup>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function FactGroup({ icon, label, color, children }: {
  icon: React.ReactNode; label: string; color: string; children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        {icon}
        <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">{label}</span>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function FactRow({ fact }: { fact: ProductFact }) {
  return (
    <div className="text-sm text-neutral-700 flex gap-2">
      <span className="text-neutral-300 flex-shrink-0 mt-0.5">·</span>
      <span className="leading-relaxed">{fact.content}</span>
    </div>
  )
}
