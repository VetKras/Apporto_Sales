import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { USERS } from '@/lib/users'

export function AuthPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) { setError('Please select a user'); return }
    if (!password) { setError('Password is required'); return }
    setLoading(true)
    setError(null)
    const result = await signIn(email)
    if (result.error) setError(result.error)
    setLoading(false)
  }

  const selectedUser = USERS.find((u) => u.email === email)

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-brand-600 rounded-xl flex items-center justify-center">
              <span className="text-white font-semibold text-lg">A</span>
            </div>
            <span className="text-2xl font-semibold text-neutral-900">Apporto Sales</span>
          </div>
          <p className="text-neutral-500 text-sm">Sales intelligence for the Apporto AI Suite</p>
        </div>

        <div className="card p-8">
          <h1 className="text-xl font-semibold text-neutral-900 mb-1">Sign in</h1>
          <p className="text-neutral-500 text-sm mb-6">Select your account to continue</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label-base">Who are you?</label>
              <select
                className="input-base"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null) }}
                required
              >
                <option value="">Select a user…</option>
                {USERS.map(u => (
                  <option key={u.email} value={u.email}>
                    {u.name} — {u.title}
                  </option>
                ))}
              </select>
            </div>

            {selectedUser && (
              <div className="text-xs text-neutral-500 bg-neutral-100 rounded-lg px-3 py-2">
                {selectedUser.email}
              </div>
            )}

            <div>
              <label className="label-base">Password</label>
              <input
                type="password"
                className="input-base"
                placeholder="••••••••"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null) }}
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="text-sm text-error-700 bg-error-50 rounded-lg px-3 py-2 border border-red-200">
                {error}
              </div>
            )}

            <button type="submit" className="btn-primary w-full justify-center" disabled={loading}>
              {loading ? 'Please wait…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
