'use client'
// src/components/layout/Sidebar.tsx
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  HomeIcon,
  BriefcaseIcon,
  UserGroupIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  LockClosedIcon,
} from '@heroicons/react/24/outline'
import {
  HomeIcon as HomeIconSolid,
  BriefcaseIcon as BriefcaseIconSolid,
  UserGroupIcon as UserGroupIconSolid,
  ChartBarIcon as ChartBarIconSolid,
} from '@heroicons/react/24/solid'
import clsx from 'clsx'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: HomeIcon, activeIcon: HomeIconSolid },
  { name: 'Jobs', href: '/jobs', icon: BriefcaseIcon, activeIcon: BriefcaseIconSolid },
  { name: 'CV Inbox', href: '/cv-inbox', icon: BriefcaseIcon, activeIcon: BriefcaseIconSolid },
  { name: 'Talent Pool', href: '/talent-pool', icon: UserGroupIcon, activeIcon: UserGroupIconSolid },
  { name: 'Analytics', href: '/analytics', icon: ChartBarIcon, activeIcon: ChartBarIconSolid },
]

const lockedFeatures = [
  { name: 'Reference Checks', icon: '📞' },
  { name: 'Video Interviews', icon: '🎥' },
  { name: 'Saudization Track', icon: '🇸🇦' },
]

export function Sidebar() {
  const pathname = usePathname()
  const session = { user: { name: 'Ahmed Al-Rashidi' }, agency: { name: 'Salt Recruitment' } }

  return (
    <aside className="w-60 bg-brand-navy flex flex-col flex-shrink-0 shadow-sidebar">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-white/10">
        <div className="w-8 h-8 bg-brand-gold rounded-lg flex items-center justify-center flex-shrink-0">
          <span className="text-brand-navy font-bold text-sm">IQ</span>
        </div>
        <div>
          <div className="text-white font-bold text-lg leading-none tracking-tight">HireIQ</div>
          <div className="text-brand-gold text-xs font-medium mt-0.5 opacity-80">
            {session?.user?.agencyId ? 'Agency Platform' : 'Loading...'}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navigation.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          const Icon = isActive ? item.activeIcon : item.icon
          return (
            <Link
              key={item.name}
              href={item.href}
              className={clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-brand-gold text-brand-navy shadow-sm'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              )}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {item.name}
            </Link>
          )
        })}

        {/* Divider */}
        <div className="pt-4 pb-2">
          <div className="text-white/30 text-xs font-semibold uppercase tracking-wider px-3 mb-2">
            Coming Soon
          </div>
          {lockedFeatures.map((feature) => (
            <div
              key={feature.name}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-white/30 text-sm cursor-not-allowed"
              title="Available in next release"
            >
              <span className="w-5 text-center opacity-40">{feature.icon}</span>
              <span>{feature.name}</span>
              <LockClosedIcon className="w-3 h-3 ml-auto flex-shrink-0" />
            </div>
          ))}
        </div>
      </nav>

      {/* User & Settings */}
      <div className="border-t border-white/10 px-3 py-3 space-y-0.5">
        <Link
          href="/settings"
          className={clsx(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
            pathname === '/settings'
              ? 'bg-brand-gold text-brand-navy'
              : 'text-white/70 hover:bg-white/10 hover:text-white'
          )}
        >
          <Cog6ToothIcon className="w-5 h-5" />
          Settings
        </Link>

        {/* User Avatar */}
        <div className="flex items-center gap-3 px-3 py-2.5">
          <div className="w-8 h-8 rounded-full bg-brand-gold/20 border border-brand-gold/30 flex items-center justify-center flex-shrink-0">
            <span className="text-brand-gold text-sm font-bold">
              {session?.user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white text-xs font-semibold truncate">
              {session?.user?.name || 'User'}
            </div>
            <div className="text-white/40 text-xs capitalize truncate">
              {session?.user?.role?.replace('_', ' ') || ''}
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/auth/signin' })}
            className="text-white/40 hover:text-white transition-colors"
            title="Sign out"
          >
            <ArrowRightOnRectangleIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}
