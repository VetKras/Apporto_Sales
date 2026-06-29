import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'

export function AuthPage() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    let result
    if (mode === 'signin') {
      result = await signIn(email, password)
    } else {
      if (!name.trim()) { setError('Name is required'); setLoading(false); return }
      result = await signUp(email, password, name)
    }
    if (result.error) setError(result.error)
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50">
      <div className="w-full max-w-md">
        {/* Logo area */}
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
          <h1 className="text-xl font-semibold text-neutral-900 mb-1">
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </h1>
          <p className="text-neutral-500 text-sm mb-6">
            {mode === 'signin' ? 'Access your sales workspace' : 'Register to get started'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="label-base">Full name</label>
                <input
                  type="text"
                  className="input-base"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />
              </div>
            )}
            <div>
              <label className="label-base">Email</label>
              <input
                type="email"
                className="input-base"
                placeholder="you@apporto.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <div>
              <label className="label-base">Password</label>
              <input
                type="password"
                className="input-base"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                required
                minLength={6}
              />
            </div>

            {error && (
              <div className="text-sm text-error-700 bg-error-50 rounded-lg px-3 py-2 border border-red-200">
                {error}
              </div>
            )}

            <button type="submit" className="btn-primary w-full justify-center" disabled={loading}>
              {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-neutral-500">
            {mode === 'signin' ? (
              <>
                Don't have an account?{' '}
                <button onClick={() => { setMode('signup'); setError(null) }} className="text-brand-600 font-medium hover:underline">
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button onClick={() => { setMode('signin'); setError(null) }} className="text-brand-600 font-medium hover:underline">
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
