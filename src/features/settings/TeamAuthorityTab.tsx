import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { cn, authorityColor } from '@/lib/utils'
import {
  loadFeatureAccessState, setFeatureLevelAccess, setTeamRestriction, clearTeamRestriction,
  getTeamRestrictionsForManager, type FeatureAccessState,
} from '@/lib/featureAccess'
import { ChevronDown, ChevronRight, Plus, Archive, Loader2, CheckCircle, AlertCircle, Lock } from 'lucide-react'
import type { Database } from '@/types/database'

type Profile = Database['public']['Tables']['profiles']['Row']

const LEVELS = [
  { level: 4, label: 'Executive / company leadership', behavior: 'Deferential analysis, confirmation-gated override with full audit trail.' },
  { level: 3, label: 'Manager / domain owner', behavior: 'Deep analysis + strong proposed update. No direct overwrites.' },
  { level: 2, label: 'Standard sales/product user', behavior: 'Creates proposed updates for review. Cannot overwrite source truth.' },
  { level: 1, label: 'Low / new or unknown employee', behavior: 'Conflicting data blocked immediately. Supervisor escalation required.' },
] as const

const EMPTY_STATE: FeatureAccessState = { flags: [], ceiling: new Map(), teamRestrictions: new Set() }

export function TeamAuthorityTab() {
  const { profile: viewerProfile, _prv, refreshFeatureAccess } = useAuth()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [expandedLevel, setExpandedLevel] = useState<number | null>(null)
  const [featureState, setFeatureState] = useState<FeatureAccessState>(EMPTY_STATE)
  const [myTeamRestrictions, setMyTeamRestrictions] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [addingToLevel, setAddingToLevel] = useState<number | null>(null)

  const viewerLevel = viewerProfile?.authority_level ?? 0
  const isL4 = viewerLevel >= 4 || _prv
  const isL3 = viewerLevel === 3 && !isL4

  function showToast(type: 'success' | 'error', msg: string) {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3000)
  }

  async function loadAll() {
    setLoading(true)
    const [{ data: profs }, state] = await Promise.all([
      supabase.from('profiles').select('*').order('authority_level', { ascending: false }).order('name'),
      loadFeatureAccessState(null), // null supervisorProfileId => full ceiling, no team-restriction filter
    ])
    setProfiles((profs ?? []) as Profile[])
    setFeatureState(state)
    if (viewerProfile && isL3) {
      const rows = await getTeamRestrictionsForManager(viewerProfile.id)
      setMyTeamRestrictions(new Set(rows.map((r) => r.feature_key)))
    }
    setLoading(false)
  }

  useEffect(() => { loadAll() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Can the viewer add/edit a person AT this target level?
  function canManageLevel(targetLevel: number): boolean {
    if (isL4) return true
    if (isL3) return targetLevel <= 3
    return false
  }

  async function handleAddPerson(level: number, name: string, email: string, title: string, department: string, reportsTo: string | null) {
    if (!name.trim()) return
    const supervisorProfileId = isL3 ? (viewerProfile?.id ?? null) : reportsTo
    const { error } = await supabase.from('profiles').insert({
      name: name.trim(),
      email: email.trim() || null,
      title: title.trim() || null,
      department: department.trim() || null,
      authority_level: level,
      supervisor_profile_id: supervisorProfileId,
      status: 'active',
    })
    if (error) { showToast('error', `Failed to add: ${error.message}`); return }
    showToast('success', `${name.trim()} added at L${level}.`)
    setAddingToLevel(null)
    await loadAll()
  }

  async function handleChangeLevel(p: Profile, newLevel: number) {
    if (isL3 && (p.supervisor_profile_id !== viewerProfile?.id || newLevel > 3)) return
    const { error } = await supabase.from('profiles').update({ authority_level: newLevel }).eq('id', p.id)
    if (error) { showToast('error', `Failed to change level: ${error.message}`); return }
    showToast('success', `${p.name} moved to L${newLevel}.`)
    await loadAll()
    if (p.id === viewerProfile?.id) await refreshFeatureAccess()
  }

  async function handleArchive(p: Profile) {
    if (!isL4) return
    const { error } = await supabase.from('profiles').update({ status: 'inactive' }).eq('id', p.id)
    if (error) { showToast('error', `Failed to archive: ${error.message}`); return }
    showToast('success', `${p.name} archived.`)
    await loadAll()
  }

  async function handleToggleCeiling(featureKey: string, level: number, currentlyEnabled: boolean) {
    if (!isL4) return
    const { error } = await setFeatureLevelAccess(featureKey, level, !currentlyEnabled, viewerProfile?.id ?? null)
    if (error) { showToast('error', `Failed to update: ${error}`); return }
    await loadAll()
    await refreshFeatureAccess()
  }

  async function handleToggleTeamRestriction(featureKey: string, currentlyRestricted: boolean) {
    if (!isL3 || !viewerProfile) return
    const { error } = currentlyRestricted
      ? await clearTeamRestriction(viewerProfile.id, featureKey)
      : await setTeamRestriction(viewerProfile.id, featureKey, viewerProfile.id)
    if (error) { showToast('error', `Failed to update: ${error}`); return }
    await loadAll()
    await refreshFeatureAccess()
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-neutral-400 text-sm py-8">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading team & authority…
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-3">
      {toast && (
        <div className={cn(
          'fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium border',
          toast.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'
        )}>
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          {toast.msg}
        </div>
      )}

      <p className="text-xs text-neutral-500">
        Click a level to manage its roster{isL4 ? ' and the company-wide feature ceiling' : isL3 ? ' and restrict features for your own reports (Level 2 and below)' : ''}.
      </p>

      {LEVELS.map(({ level, label, behavior }) => {
        const levelProfiles = profiles.filter((p) => p.authority_level === level)
        const isExpanded = expandedLevel === level
        const canManage = canManageLevel(level)

        return (
          <div key={level} className="card overflow-hidden">
            <button
              onClick={() => setExpandedLevel(isExpanded ? null : level)}
              className="w-full flex items-center gap-3 p-4 text-left hover:bg-neutral-50 transition-colors"
            >
              <span className={cn('badge-level text-xs px-2 py-0.5 rounded border flex-shrink-0', authorityColor(level))}>L{level}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-neutral-800">{label}</div>
                <div className="text-xs text-neutral-500 mt-0.5">{behavior}</div>
              </div>
              <span className="text-xs text-neutral-400 flex-shrink-0">{levelProfiles.length}</span>
              {isExpanded ? <ChevronDown className="w-4 h-4 text-neutral-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-neutral-400 flex-shrink-0" />}
            </button>

            {isExpanded && (
              <div className="border-t border-neutral-100 p-4 space-y-4">
                {/* Roster */}
                <div className="space-y-2">
                  {levelProfiles.length === 0 && <p className="text-xs text-neutral-400">No one at this level yet.</p>}
                  {levelProfiles.map((p) => {
                    const rowEditable = isL4 || (isL3 && p.supervisor_profile_id === viewerProfile?.id)
                    return (
                      <div key={p.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-neutral-50 border border-neutral-100">
                        <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-brand-700 font-medium text-xs">{p.name.charAt(0)}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-neutral-900 truncate">{p.name}</div>
                          <div className="text-xs text-neutral-500 truncate">{p.title}{p.department ? ` · ${p.department}` : ''}</div>
                        </div>
                        {rowEditable ? (
                          <select
                            className="select-base py-1 text-xs w-20 flex-shrink-0"
                            value={p.authority_level}
                            onChange={(e) => handleChangeLevel(p, Number(e.target.value))}
                          >
                            {(isL4 ? [4, 3, 2, 1] : [3, 2, 1]).map((lv) => <option key={lv} value={lv}>L{lv}</option>)}
                          </select>
                        ) : (
                          <span className={cn('badge-level text-xs px-2 py-0.5 rounded border flex-shrink-0', authorityColor(p.authority_level))}>L{p.authority_level}</span>
                        )}
                        <span className={cn('text-xs px-1.5 py-0.5 rounded flex-shrink-0', p.status === 'active' ? 'text-emerald-600' : 'text-neutral-400')}>{p.status}</span>
                        {isL4 && p.status === 'active' && (
                          <button onClick={() => handleArchive(p)} className="text-neutral-400 hover:text-red-500 flex-shrink-0" title="Archive user">
                            <Archive className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>

                {canManage && (
                  addingToLevel === level ? (
                    <AddPersonForm
                      level={level}
                      allowReportsTo={isL4}
                      profiles={profiles}
                      onCancel={() => setAddingToLevel(null)}
                      onSubmit={(name, email, title, department, reportsTo) => handleAddPerson(level, name, email, title, department, reportsTo)}
                    />
                  ) : (
                    <button
                      onClick={() => setAddingToLevel(level)}
                      className="flex items-center gap-2 text-xs text-neutral-500 hover:text-brand-600 hover:bg-brand-50 rounded-lg px-3 py-2 border border-dashed border-neutral-300 hover:border-brand-300 w-full transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add person to L{level}
                    </button>
                  )
                )}

                {/* Feature access — only meaningful for levels 1-3; L4 always has everything */}
                {level < 4 && (isL4 || isL3) && (
                  <div className="border-t border-neutral-100 pt-4">
                    <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">
                      {isL4 ? 'Company-wide feature ceiling' : 'Restrict for my team'}
                    </h4>
                    {isL3 && (
                      <p className="text-xs text-neutral-400 mb-2">
                        Applies to all of your direct reports, regardless of which level card you toggle it from — a report at L1 or L2 is affected the same way.
                      </p>
                    )}
                    <div className="space-y-1.5">
                      {featureState.flags.map((flag) => {
                        const ceilingEnabled = featureState.ceiling.get(`${flag.key}:${level}`) ?? true
                        const restricted = myTeamRestrictions.has(flag.key)
                        return (
                          <div key={flag.key} className="flex items-center justify-between text-sm px-3 py-1.5 rounded bg-neutral-50">
                            <span className="text-neutral-700">{flag.label}</span>
                            {isL4 ? (
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  className="w-3.5 h-3.5 accent-brand-600"
                                  checked={ceilingEnabled}
                                  onChange={() => handleToggleCeiling(flag.key, level, ceilingEnabled)}
                                />
                                <span className="text-xs text-neutral-500">{ceilingEnabled ? 'Enabled' : 'Disabled'}</span>
                              </label>
                            ) : !ceilingEnabled ? (
                              <span className="flex items-center gap-1 text-xs text-neutral-400">
                                <Lock className="w-3 h-3" /> Off (set by L4)
                              </span>
                            ) : (
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  className="w-3.5 h-3.5 accent-red-500"
                                  checked={restricted}
                                  onChange={() => handleToggleTeamRestriction(flag.key, restricted)}
                                />
                                <span className="text-xs text-neutral-500">{restricted ? 'Restricted for my team' : 'Available'}</span>
                              </label>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function AddPersonForm({
  level, allowReportsTo, profiles, onCancel, onSubmit,
}: {
  level: number
  allowReportsTo: boolean
  profiles: Profile[]
  onCancel: () => void
  onSubmit: (name: string, email: string, title: string, department: string, reportsTo: string | null) => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [title, setTitle] = useState('')
  const [department, setDepartment] = useState('')
  const [reportsTo, setReportsTo] = useState('')

  return (
    <div className="card p-4 space-y-3 bg-brand-50/30 border-brand-200">
      <div className="text-sm font-medium text-neutral-900">Add person to L{level}</div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label-base">Name</label>
          <input className="input-base" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="label-base">Email</label>
          <input className="input-base" value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
        </div>
        <div>
          <label className="label-base">Title</label>
          <input className="input-base" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="label-base">Department</label>
          <input className="input-base" value={department} onChange={(e) => setDepartment(e.target.value)} />
        </div>
        {allowReportsTo && (
          <div className="col-span-2">
            <label className="label-base">Reports to (optional)</label>
            <select className="select-base" value={reportsTo} onChange={(e) => setReportsTo(e.target.value)}>
              <option value="">— None —</option>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.name} (L{p.authority_level})</option>)}
            </select>
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <button
          className="btn-primary py-1.5 text-xs"
          disabled={!name.trim()}
          onClick={() => onSubmit(name, email, title, department, reportsTo || null)}
        >
          Add
        </button>
        <button className="btn-ghost py-1.5 text-xs" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
