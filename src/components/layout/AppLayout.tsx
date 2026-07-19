import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, FileText, Package, Swords, MessageSquare,
  Settings, LogOut, ChevronRight, Bell
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { cn, authorityColor } from '@/lib/utils'

const NAV_ITEMS = [
  { to: '/deals',      label: 'Deals & Quotes',    icon: LayoutDashboard },
  { to: '/products',   label: 'Products',           icon: Package },
  { to: '/competitive',label: 'Competitive',        icon: Swords },
  { to: '/portia',     label: 'Portia',             icon: MessageSquare },
  { to: '/settings',   label: 'Settings',           icon: Settings },
]

export function AppLayout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)

  async function handleSignOut() {
    await signOut()
    navigate('/auth')
  }

  return (
    <div className="flex h-screen bg-neutral-50 overflow-hidden">
      <aside className={cn(
        'flex flex-col bg-neutral-900 text-white transition-all duration-200 flex-shrink-0',
        collapsed ? 'w-14' : 'w-52'
      )}>
        <div className="flex items-center gap-3 px-3 py-4 border-b border-neutral-800">
          <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-white font-semibold text-sm">A</span>
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white truncate">Apporto Sales</div>
              <div className="text-xs text-neutral-400 truncate">AI Suite</div>
            </div>
          )}
        </div>

        <nav className="flex-1 py-3 space-y-0.5 px-2">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm transition-colors',
                  isActive
                    ? 'bg-brand-600 text-white'
                    : 'text-neutral-300 hover:bg-neutral-800 hover:text-white'
                )
              }
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-neutral-800 p-3">
          {profile && (
            <div className={cn('flex items-center gap-2 mb-2', collapsed && 'justify-center')}>
              <div className="w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-medium">
                  {profile.name.charAt(0)}
                </span>
              </div>
              {!collapsed && (
                <div className="min-w-0">
                  <div className="text-xs font-medium text-white truncate">{profile.name}</div>
                  <div className={cn('text-xs mt-0.5 badge-level', authorityColor(profile.authority_level))}>
                    L{profile.authority_level}
                  </div>
                </div>
              )}
            </div>
          )}
          <button
            onClick={handleSignOut}
            className={cn(
              'flex items-center gap-2 text-xs text-neutral-400 hover:text-white transition-colors w-full',
              collapsed ? 'justify-center' : 'px-1'
            )}
          >
            <LogOut className="w-3.5 h-3.5" />
            {!collapsed && 'Sign out'}
          </button>
        </div>

        <button
          onClick={() => setCollapsed((c) => !c)}
          className="absolute bottom-24 -right-3 w-6 h-6 bg-neutral-700 rounded-full flex items-center justify-center
                     border border-neutral-600 hover:bg-neutral-600 transition-colors z-10"
          style={{ position: 'absolute', left: collapsed ? '2.5rem' : '10rem' }}
        >
          <ChevronRight className={cn('w-3 h-3 text-neutral-300 transition-transform', !collapsed && 'rotate-180')} />
        </button>
      </aside>

      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}
