import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { AppLayout } from '@/components/layout/AppLayout'
import { AuthPage } from '@/features/auth/AuthPage'
import { DealsPage } from '@/features/deals/DealsPage'
import { ProductsPage } from '@/features/products/ProductsPage'
import { CompetitivePage } from '@/features/competitive/CompetitivePage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { PortiaStandalone } from '@/features/portia/PortiaStandalone'

function ProtectedRoutes() {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-neutral-500">Loading…</p>
        </div>
      </div>
    )
  }
  if (!user) return <Navigate to="/auth" replace />
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/deals" replace />} />
        <Route path="deals" element={<DealsPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="competitive" element={<CompetitivePage />} />
        <Route path="portia" element={<PortiaStandalone />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/auth" element={<AuthRedirect />} />
          <Route path="/*" element={<ProtectedRoutes />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

function AuthRedirect() {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50">
      <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (user) return <Navigate to="/deals" replace />
  return <AuthPage />
}
