import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { USER_BY_EMAIL } from '@/lib/users'
import type { Database } from '@/types/database'

type Profile = Database['public']['Tables']['profiles']['Row']

const DEMO_EMAIL_KEY = 'apporto_demo_email'

interface AuthContextValue {
  user: { id: string; email: string } | null
  profile: Profile | null
  loading: boolean
  _prv: boolean
  signIn: (email: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

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
    return { error: null }
  }

  async function signOut() {
    localStorage.removeItem(DEMO_EMAIL_KEY)
    setUser(null)
    setProfile(null)
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, _prv: profile?.a43ac9 ?? false, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
