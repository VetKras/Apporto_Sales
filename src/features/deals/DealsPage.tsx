import { useState, useEffect } from 'react'
import { Plus, RefreshCw, ChevronDown, ChevronUp, AlertTriangle, CheckCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { DealWorkspace } from './DealWorkspace'
import type { Database } from '@/types/database'
import { cn } from '@/lib/utils'

type Deal = Database['public']['Tables']['deals']['Row']

export function DealsPage() {
  const { profile } = useAuth()
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newCustomer, setNewCustomer] = useState('')
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null)

  async function fetchDeals() {
    const { data } = await supabase
      .from('deals')
      .select('*')
      .order('updated_at', { ascending: false })
    setDeals(data ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchDeals() }, [])

  async function createDeal() {
    if (!newCustomer.trim()) return
    const { data, error } = await supabase
      .from('deals')
      .insert({ customer_name: newCustomer.trim(), owner_profile_id: profile?.id ?? null, status: 'draft' })
      .select()
      .single()
    if (!error && data) {
      setDeals((d) => [data, ...d])
      setActiveDeal(data)
      setNewCustomer('')
      setCreating(false)
    }
  }

  if (activeDeal) {
    return (
      <DealWorkspace
        deal={activeDeal}
        onClose={() => { setActiveDeal(null); fetchDeals() }}
      />
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 bg-white flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Deals & Quotes</h1>
          <p className="text-sm text-neutral-500">{deals.length} deal{deals.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn-primary" onClick={() => setCreating(true)}>
          <Plus className="w-4 h-4" /> New Deal
        </button>
      </div>

      {/* New deal form */}
      {creating && (
        <div className="px-6 py-3 bg-brand-50 border-b border-brand-200 flex items-center gap-3">
          <input
            className="input-base max-w-xs"
            placeholder="Customer / institution name"
            value={newCustomer}
            onChange={(e) => setNewCustomer(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createDeal()}
            autoFocus
          />
          <button className="btn-primary" onClick={createDeal}>Create</button>
          <button className="btn-secondary" onClick={() => setCreating(false)}>Cancel</button>
        </div>
      )}

      {/* Deal list */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center gap-2 text-neutral-400 text-sm">
            <RefreshCw className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : deals.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-neutral-500 text-sm mb-3">No deals yet.</p>
            <button className="btn-primary" onClick={() => setCreating(true)}>
              <Plus className="w-4 h-4" /> Create your first deal
            </button>
          </div>
        ) : (
          <div className="grid gap-3 max-w-4xl">
            {deals.map((d) => (
              <button
                key={d.id}
                onClick={() => setActiveDeal(d)}
                className="card p-4 text-left hover:shadow-md transition-shadow group"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-neutral-900 group-hover:text-brand-700 transition-colors">
                      {d.customer_name}
                    </div>
                    <div className="text-sm text-neutral-500 mt-0.5">
                      {d.stage ? `Stage: ${d.stage} · ` : ''}{d.status}
                    </div>
                  </div>
                  <div className={cn(
                    'text-xs font-medium px-2 py-1 rounded-full',
                    d.status === 'draft' ? 'bg-neutral-100 text-neutral-600' : 'bg-brand-100 text-brand-700'
                  )}>
                    {d.status}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
