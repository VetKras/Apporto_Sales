import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { USER_BY_EMAIL } from '@/lib/users'
import { loadFeatureAccessState, effectiveAccess, EMPTY_FEATURE_ACCESS_STATE, type FeatureAccessState } from '@/lib/featureAccess'
import type { Database } from '@/types/database'

type Profile = Database['public']['Tables']['profiles']['Row']

const DEMO_EMAIL_KEY = 'apporto_demo_email'

interface AuthContextValue {
  user: { id: string; email: string } | null
  profile: Profile | null
  loading: boolean
  _prv: boolean
  hasFeature: (featureKey: string) => boolean
  featureAccessState: FeatureAccessState
  refreshFeatureAccess: () => Promise<void>
  signIn: (email: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [featureAccessState, setFeatureAccessState] = useState<FeatureAccessState>(EMPTY_FEATURE_ACCESS_STATE)

  async function refreshFeatureAccess(supervisorProfileId: string | null = profile?.supervisor_profile_id ?? null) {
    setFeatureAccessState(await loadFeatureAccessState(supervisorProfileId))
  }

  async function loadProfileByEmail(email: string) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', email)
      .maybeSingle()
    return data
  }

  useEffect(() => {
    const savedEmail = localStorage.getItem(DEMO_EMAIL_KEY)
    if (savedEmail) {
      loadProfileByEmail(savedEmail).then(data => {
        const known = USER_BY_EMAIL.get(savedEmail)
        const profile = data ?? {
          id: `local-${savedEmail}`,
          auth_user_id: null,
          name: known?.name ?? savedEmail.split('@')[0],
          email: savedEmail,
          title: known?.title ?? null,
          department: known?.department ?? null,
          authority_level: known?.authority_level ?? 1,
          authority_notes: null,
          supervisor_profile_id: null,
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any
        setUser({ id: profile.id, email: savedEmail })
        setProfile(profile)
        refreshFeatureAccess(profile.supervisor_profile_id)
      }).finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  async function signIn(email: string) {
    let data = await loadProfileByEmail(email)
    if (!data) {
      const known = USER_BY_EMAIL.get(email)
      data = {
        id: `local-${email}`,
        auth_user_id: null,
        name: known?.name ?? email.split('@')[0],
        email,
        title: known?.title ?? null,
        department: known?.department ?? null,
        authority_level: known?.authority_level ?? 1,
        authority_notes: null,
        supervisor_profile_id: null,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any
    }
    localStorage.setItem(DEMO_EMAIL_KEY, email)
    setUser({ id: data!.id, email })
    setProfile(data)
    await refreshFeatureAccess(data!.supervisor_profile_id)
    return { error: null }
  }

  async function signOut() {
    localStorage.removeItem(DEMO_EMAIL_KEY)
    setUser(null)
    setProfile(null)
    setFeatureAccessState(EMPTY_FEATURE_ACCESS_STATE)
  }

  function hasFeature(featureKey: string): boolean {
    if (!profile) return true
    return effectiveAccess(
      featureKey,
      { authorityLevel: profile.authority_level, isPrv: profile.a43ac9 ?? false, supervisorProfileId: profile.supervisor_profile_id },
      featureAccessState
    )
  }

  return (
    <AuthContext.Provider value={{
      user, profile, loading, _prv: profile?.a43ac9 ?? false,
      hasFeature, featureAccessState, refreshFeatureAccess,
      signIn, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
