import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { formatCurrency, cn, authorityColor } from '@/lib/utils'
import { loadAllPricingConfigs, loadPricingModelsForVersion } from '@/lib/pricing-engine'
import { AdminConfigTab } from './AdminConfigTab'
import {
  getAllIntegrationSettings,
  upsertIntegrationSetting,
  clearIntegrationSetting,
  deleteIntegrationSetting,
  type IntegrationSettingsRow,
} from '@/lib/db'
import { CheckCircle, XCircle, Loader2, ExternalLink, Eye, EyeOff, Plus, Trash2, Key } from 'lucide-react'
import type { Database } from '@/types/database'

type PricingConfigVersion = Database['public']['Tables']['pricing_config_versions']['Row']
type PricingModel = Database['public']['Tables']['pricing_models']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

export function SettingsPage() {
  const { profile, _prv } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [configs, setConfigs] = useState<PricingConfigVersion[]>([])
  const [selectedConfig, setSelectedConfig] = useState<string | null>(null)
  const [models, setModels] = useState<PricingModel[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const initialTab = searchParams.get('tab') as 'pricing' | 'team' | 'integrations' | 'admin' | null
  const [activeTab, setActiveTab] = useState<'pricing' | 'team' | 'integrations' | 'admin'>(initialTab ?? 'pricing')
  const [loading, setLoading] = useState(true)

  const level = profile?.authority_level ?? 0
  const canSeeTeam = level >= 4 || _prv

  useEffect(() => {
    async function load() {
      const [cfgs, { data: profs }] = await Promise.all([
        loadAllPricingConfigs(),
        supabase.from('profiles').select('*').order('authority_level', { ascending: false }),
      ])
      setConfigs(cfgs)
      setProfiles(profs ?? [])
      const active = cfgs.find((c) => c.is_active)
      if (active) {
        setSelectedConfig(active.id)
        const mods = await loadPricingModelsForVersion(active.id)
        setModels(mods)
      }
      setLoading(false)
    }
    load()
  }, [])

  async function handleSelectConfig(id: string) {
    setSelectedConfig(id)
    const mods = await loadPricingModelsForVersion(id)
    setModels(mods)
  }

  // Redirect L1-L2 users who navigate directly to /settings
  useEffect(() => {
    if (!loading && level < 3 && !_prv) navigate('/deals', { replace: true })
  }, [loading, level, _prv, navigate])

  if (!loading && level < 3 && !_prv) return null

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-neutral-200 bg-white flex-shrink-0">
        <h1 className="text-lg font-semibold text-neutral-900">Settings</h1>
        <p className="text-sm text-neutral-500">Pricing config · Team authority levels · Integrations</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 py-3 border-b border-neutral-200 bg-white flex-shrink-0">
        {([
          { id: 'pricing'      as const, label: 'Pricing Config'    },
          { id: 'integrations' as const, label: 'Integrations'      },
          ...(canSeeTeam ? [{ id: 'team'  as const, label: 'Team & Authority' }] : []),
          { id: 'admin'        as const, label: 'Admin Config'      },
        ]).map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={cn(
              'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
              activeTab === t.id ? 'bg-brand-600 text-white' : 'text-neutral-500 hover:bg-neutral-100'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'pricing' && (
          <div className="max-w-3xl space-y-6">
            <div>
              <h2 className="text-sm font-semibold text-neutral-700 mb-3">Config versions</h2>
              <div className="space-y-2">
                {configs.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleSelectConfig(c.id)}
                    className={cn(
                      'w-full card p-3 text-left flex items-center justify-between transition-shadow hover:shadow-md',
                      selectedConfig === c.id && 'ring-2 ring-brand-500'
                    )}
                  >
                    <div>
                      <div className="text-sm font-medium text-neutral-900">{c.version_name}</div>
                      <div className="text-xs text-neutral-500 mt-0.5">{c.notes}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {c.is_active && (
                        <span className="text-xs font-medium px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full">Active</span>
                      )}
                      <span className="text-xs text-neutral-400">{c.effective_date}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {selectedConfig && models.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-neutral-700 mb-3">
                  Pricing models
                  {configs.find((c) => c.id === selectedConfig)?.is_active && (
                    <span className="ml-2 text-xs font-normal text-emerald-600">(active config — these values drive all quotes)</span>
                  )}
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-neutral-200">
                        {['Product', 'Tier', 'Type', 'Unit', 'Default price', 'Confidence'].map((h) => (
                          <th key={h} className="text-left py-2 pr-4 text-xs font-semibold text-neutral-500 uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {models.map((m) => (
                        <tr key={m.id} className="hover:bg-neutral-50">
                          <td className="py-2 pr-4 text-neutral-700 text-xs">{m.product_id.replace('seed-product-', '')}</td>
                          <td className="py-2 pr-4 text-neutral-900 font-medium">{m.tier_name}</td>
                          <td className="py-2 pr-4 text-neutral-500 text-xs">{m.pricing_type}</td>
                          <td className="py-2 pr-4 text-neutral-500 text-xs">{m.unit}</td>
                          <td className="py-2 pr-4 font-semibold text-brand-700">
                            {m.default_price != null ? formatCurrency(m.default_price) : '—'}
                          </td>
                          <td className="py-2">
                            <span className={cn(
                              'text-xs font-medium',
                              m.confidence === 'high' ? 'text-emerald-600' :
                              m.confidence === 'medium' ? 'text-amber-600' : 'text-red-500'
                            )}>
                              {m.confidence}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-neutral-400 mt-3">
                  To change pricing defaults, update the active config version in the database or create a new config version through the proposed update workflow.
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'team' && canSeeTeam && (
          <div className="max-w-3xl space-y-6">
            <div>
              <h2 className="text-sm font-semibold text-neutral-700 mb-3">Team members</h2>
              <div className="space-y-2">
                {profiles.map((p) => (
                  <div key={p.id} className="card p-3 flex items-center gap-4">
                    <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-brand-700 font-medium text-sm">{p.name.charAt(0)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-neutral-900">{p.name}</div>
                      <div className="text-xs text-neutral-500 truncate">{p.title} · {p.department}</div>
                      {p.authority_notes && (
                        <div className="text-xs text-neutral-400 mt-0.5 truncate">{p.authority_notes}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={cn('badge-level text-xs px-2 py-0.5 rounded border', authorityColor(p.authority_level))}>
                        L{p.authority_level}
                      </span>
                      <span className={cn(
                        'text-xs px-1.5 py-0.5 rounded',
                        p.status === 'active' ? 'text-emerald-600' : 'text-neutral-400'
                      )}>
                        {p.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-neutral-700 mb-3">Authority levels</h2>
              <div className="space-y-2">
                {[
                  { level: 4, label: 'Executive / company leadership', behavior: 'Deferential analysis, confirmation-gated override with full audit trail.' },
                  { level: 3, label: 'Manager / domain owner', behavior: 'Deep analysis + strong proposed update. No direct overwrites.' },
                  { level: 2, label: 'Standard sales/product user', behavior: 'Creates proposed updates for review. Cannot overwrite source truth.' },
                  { level: 1, label: 'Low / new or unknown employee', behavior: 'Conflicting data blocked immediately. Supervisor escalation required.' },
                ].map((a) => (
                  <div key={a.level} className="card p-3 flex gap-3">
                    <span className={cn('badge-level text-xs px-2 py-0.5 rounded border self-start mt-0.5', authorityColor(a.level))}>
                      L{a.level}
                    </span>
                    <div>
                      <div className="text-sm font-medium text-neutral-800">{a.label}</div>
                      <div className="text-xs text-neutral-500 mt-0.5">{a.behavior}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'integrations' && (
          <IntegrationsTab profileId={profile?.id ?? null} />
        )}

        {activeTab === 'admin' && (level >= 3 || _prv) && (
          <AdminConfigTab profileId={profile?.id ?? null} />
        )}
      </div>
    </div>
  )
}

// ─── Integrations tab ─────────────────────────────────────────────────────────────────────────────────

type PredefinedProvider = {
  provider: string
  name: string
  description: string
  placeholder: string
  color: string
  initials: string
  docsUrl?: string
  docsLabel?: string
  canTest?: boolean
}

const PREDEFINED_PROVIDERS: PredefinedProvider[] = [
  {
    provider: 'anthropic',
    name: 'Anthropic',
    description: 'Claude API — for AI-powered features',
    placeholder: 'sk-ant-api03-…',
    color: '#CC785C',
    initials: 'AN',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    docsLabel: 'Get API key',
  },
  {
    provider: 'openai',
    name: 'OpenAI',
    description: 'GPT models and embeddings',
    placeholder: 'sk-proj-…',
    color: '#10A37F',
    initials: 'OA',
    docsUrl: 'https://platform.openai.com/api-keys',
    docsLabel: 'Get API key',
  },
  {
    provider: 'gemini',
    name: 'Google Gemini',
    description: 'Gemini models via AI Studio',
    placeholder: 'AIzaSy…',
    color: '#4285F4',
    initials: 'GG',
    docsUrl: 'https://aistudio.google.com/app/apikey',
    docsLabel: 'Get API key',
  },
  {
    provider: 'hubspot',
    name: 'HubSpot CRM',
    description: 'Push deals and contacts from quotes',
    placeholder: 'pat-na1-…',
    color: '#FF7A59',
    initials: 'HS',
    docsUrl: 'https://developers.hubspot.com/docs/api/private-apps',
    docsLabel: 'HubSpot docs',
    canTest: true,
  },
]

const PREDEFINED_KEYS = new Set<string>(PREDEFINED_PROVIDERS.map((p) => p.provider))

function IntegrationsTab({ profileId }: { profileId: string | null }) {
  const [rows, setRows] = useState<IntegrationSettingsRow[]>([])
  const [loading, setLoading] = useState(true)

  async function refresh() {
    const data = await getAllIntegrationSettings()
    setRows(data)
    setLoading(false)
  }

  useEffect(() => { refresh() }, [])

  const customRows = rows.filter((r) => !PREDEFINED_KEYS.has(r.provider) && !!r.api_key)

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h2 className="text-sm font-semibold text-neutral-700 mb-1">Integrations</h2>
        <p className="text-xs text-neutral-500">
          Keys are stored in the database and only read server-side when an action runs — never returned to the browser after saving.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-neutral-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          {/* Predefined provider cards */}
          <div className="space-y-3">
            {PREDEFINED_PROVIDERS.map((p) => {
              const row = rows.find((r) => r.provider === p.provider)
              return (
                <ProviderKeyCard
                  key={p.provider}
                  config={p}
                  configured={!!(row?.api_key && row.is_active)}
                  profileId={profileId}
                  onSaved={refresh}
                />
              )
            })}
          </div>

          {/* Custom keys */}
          <div>
            <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3">
              Custom API Keys
            </h3>
            <div className="space-y-2">
              {customRows.map((row) => (
                <CustomKeyRow
                  key={row.provider}
                  row={row}
                  onDeleted={refresh}
                />
              ))}
            </div>
            <AddCustomKey profileId={profileId} onSaved={refresh} />
          </div>
        </>
      )}
    </div>
  )
}

// ─── Generic provider card ──────────────────────────────────────────────────────────────────────────────

function ProviderKeyCard({
  config,
  configured,
  profileId,
  onSaved,
}: {
  config: PredefinedProvider
  configured: boolean
  profileId: string | null
  onSaved: () => void
}) {
  const [tokenInput, setTokenInput] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  async function handleSave() {
    const val = tokenInput.trim()
    if (!val) return
    setSaving(true)
    setStatus(null)
    const { error } = await upsertIntegrationSetting(config.provider, val, profileId)
    if (error) {
      setStatus({ type: 'error', message: `Save failed: ${error}` })
    } else {
      setTokenInput('')
      setStatus({ type: 'success', message: `${config.name} key saved.` })
      onSaved()
    }
    setSaving(false)
  }

  async function handleTest() {
    setTesting(true)
    setStatus(null)
    try {
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/hubspot-action`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabaseAnonKey}` },
          body: JSON.stringify({ action: 'test_connection' }),
        }
      )
      const json = await res.json()
      setStatus(json.success
        ? { type: 'success', message: json.message }
        : { type: 'error', message: json.error ?? 'Connection test failed.' }
      )
    } catch {
      setStatus({ type: 'error', message: 'Network error during test.' })
    }
    setTesting(false)
  }

  async function handleClear() {
    setClearing(true)
    setStatus(null)
    await clearIntegrationSetting(config.provider)
    setStatus({ type: 'success', message: `${config.name} key removed.` })
    onSaved()
    setClearing(false)
  }

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: config.color }}
          >
            <span className="text-white font-bold text-xs">{config.initials}</span>
          </div>
          <div>
            <div className="text-sm font-semibold text-neutral-900">{config.name}</div>
            <div className="text-xs text-neutral-500">{config.description}</div>
          </div>
        </div>
        {configured ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
            <CheckCircle className="w-3.5 h-3.5" /> Configured
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 bg-neutral-100 px-2.5 py-1 rounded-full border border-neutral-200">
            <XCircle className="w-3.5 h-3.5" /> Not configured
          </span>
        )}
      </div>

      <div>
        <label className="label-base">API Key</label>
        <div className="relative">
          <input
            type={showToken ? 'text' : 'password'}
            className="input-base pr-10"
            placeholder={configured ? 'Enter new key to replace existing' : config.placeholder}
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => setShowToken((s) => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
          >
            {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {config.docsUrl && (
          <a
            href={config.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-brand-600 hover:underline inline-flex items-center gap-0.5 mt-1"
          >
            {config.docsLabel} <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      {status && (
        <div className={cn(
          'text-xs px-3 py-2 rounded-lg border flex items-center gap-2',
          status.type === 'success'
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : 'bg-error-50 text-error-700 border-red-200'
        )}>
          {status.type === 'success'
            ? <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
            : <XCircle className="w-3.5 h-3.5 flex-shrink-0" />}
          {status.message}
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button className="btn-primary py-1.5 text-xs" onClick={handleSave} disabled={saving || !tokenInput.trim()}>
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {saving ? 'Saving…' : 'Save key'}
        </button>
        {configured && (
          <>
            {'canTest' in config && config.canTest && (
              <button className="btn-secondary py-1.5 text-xs" onClick={handleTest} disabled={testing}>
                {testing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {testing ? 'Testing…' : 'Test connection'}
              </button>
            )}
            <button
              className="btn-ghost py-1.5 text-xs text-red-500 hover:bg-red-50"
              onClick={handleClear}
              disabled={clearing}
            >
              {clearing ? 'Removing…' : 'Remove key'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Custom key row ────────────────────────────────────────────────────────────────────────────────────

function CustomKeyRow({ row, onDeleted }: { row: IntegrationSettingsRow; onDeleted: () => void }) {
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    await deleteIntegrationSetting(row.provider)
    onDeleted()
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-neutral-50 rounded-lg border border-neutral-200">
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 rounded-md bg-neutral-200 flex items-center justify-center flex-shrink-0">
          <Key className="w-3.5 h-3.5 text-neutral-500" />
        </div>
        <div>
          <div className="text-sm font-medium text-neutral-900">{row.provider}</div>
          <div className="text-xs text-neutral-400">
            {row.is_active ? 'Configured' : 'Inactive'} · saved {new Date(row.updated_at).toLocaleDateString()}
          </div>
        </div>
      </div>
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="btn-ghost py-1 px-2 text-red-500 hover:bg-red-50 text-xs"
      >
        {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
      </button>
    </div>
  )
}

// ─── Add custom key ──────────────────────────────────────────────────────────────────────────────────────

function AddCustomKey({ profileId, onSaved }: { profileId: string | null; onSaved: () => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAdd() {
    const providerKey = name.trim().toLowerCase().replace(/\s+/g, '_')
    const val = key.trim()
    if (!providerKey || !val) return
    if (PREDEFINED_KEYS.has(providerKey)) {
      setError(`"${providerKey}" is a reserved provider name.`)
      return
    }
    setSaving(true)
    setError(null)
    const { error: err } = await upsertIntegrationSetting(providerKey, val, profileId)
    if (err) {
      setError(err)
    } else {
      setName('')
      setKey('')
      setOpen(false)
      onSaved()
    }
    setSaving(false)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-3 flex items-center gap-2 text-xs text-neutral-500 hover:text-brand-600 hover:bg-brand-50 rounded-lg px-3 py-2.5 border border-dashed border-neutral-300 hover:border-brand-300 w-full transition-colors"
      >
        <Plus className="w-3.5 h-3.5" /> Add custom key
      </button>
    )
  }

  return (
    <div className="mt-3 card p-4 space-y-3">
      <div className="text-sm font-medium text-neutral-900">Add custom key</div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label-base">Name / identifier</label>
          <input
            className="input-base"
            placeholder="e.g. my_custom_api"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div>
          <label className="label-base">API key</label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              className="input-base pr-9"
              placeholder="sk-…"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowKey((s) => !s)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
            >
              {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
      <div className="flex gap-2">
        <button className="btn-primary py-1.5 text-xs" onClick={handleAdd} disabled={saving || !name.trim() || !key.trim()}>
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button className="btn-ghost py-1.5 text-xs" onClick={() => { setOpen(false); setName(''); setKey(''); setError(null) }}>
          Cancel
        </button>
      </div>
    </div>
  )
}
