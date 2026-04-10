'use client'
// src/components/layout/TopBar.tsx
import { useState } from 'react'
import { BellIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { BellIcon as BellIconSolid } from '@heroicons/react/24/solid'
import { format } from 'date-fns'
import clsx from 'clsx'

interface TopBarProps {
  title?: string
  subtitle?: string
}

export function TopBar({ title, subtitle }: TopBarProps) {
  const session = { user: { name: 'Ahmed Al-Rashidi', email: 'admin@saltrecruitment.ae' }, agency: { name: 'Salt Recruitment', plan: 'Growth Plan' } }
  const [showNotifications, setShowNotifications] = useState(false)
  const unreadCount = 3 // TODO: from real-time store

  const greeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
  }

  return (
    <header className="h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between flex-shrink-0">
      {/* Left: Greeting or Page Title */}
      <div>
        {title ? (
          <div>
            <h1 className="text-lg font-bold text-brand-navy">{title}</h1>
            {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
          </div>
        ) : (
          <div>
            <p className="text-base font-semibold text-brand-navy">
              {greeting()}, {session?.user?.name?.split(' ')[0] || 'there'} 👋
            </p>
            <p className="text-xs text-gray-400">
              {format(new Date(), 'EEEE, d MMMM yyyy')}
            </p>
          </div>
        )}
      </div>

      {/* Right: Search + Notifications + Agency Badge */}
      <div className="flex items-center gap-3">
        {/* Quick Search */}
        <button className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
          <MagnifyingGlassIcon className="w-4 h-4" />
          <span className="hidden sm:block">Search...</span>
          <kbd className="hidden sm:block text-xs bg-white border border-gray-200 rounded px-1.5 py-0.5">⌘K</kbd>
        </button>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {unreadCount > 0 ? (
              <BellIconSolid className="w-5 h-5 text-brand-navy" />
            ) : (
              <BellIcon className="w-5 h-5" />
            )}
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-brand-gold text-brand-navy text-xs font-bold rounded-full flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>

          {/* Dropdown */}
          {showNotifications && (
            <NotificationsDropdown onClose={() => setShowNotifications(false)} />
          )}
        </div>

        {/* Agency Name + Tier */}
        <div className="flex items-center gap-2 pl-3 border-l border-gray-200">
          <div className="text-right">
            <p className="text-xs font-semibold text-brand-navy">Salt Recruitment</p>
            <p className="text-xs text-brand-gold font-medium capitalize">Growth Plan</p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-brand-navy/10 flex items-center justify-center">
            <span className="text-brand-navy font-bold text-xs">SR</span>
          </div>
        </div>
      </div>
    </header>
  )
}

function NotificationsDropdown({ onClose }: { onClose: () => void }) {
  const notifications = [
    {
      id: '1',
      type: 'shortlist_ready',
      title: 'Shortlist Ready',
      message: 'AI shortlisted 12 candidates for Senior Accountant — Al Fardan',
      time: '2 min ago',
      isRead: false,
    },
    {
      id: '2',
      type: 'new_application',
      title: 'New Applications',
      message: '34 new applicants for Marketing Manager — DAMAC',
      time: '15 min ago',
      isRead: false,
    },
    {
      id: '3',
      type: 'interview_confirmed',
      title: 'Interview Confirmed',
      message: 'Ahmed Al-Rashidi confirmed interview for tomorrow 10am',
      time: '1 hr ago',
      isRead: false,
    },
  ]

  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-200 z-20 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <span className="font-semibold text-sm text-brand-navy">Notifications</span>
          <button className="text-xs text-brand-blue hover:underline">Mark all read</button>
        </div>
        <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={clsx(
                'px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors',
                !n.isRead && 'bg-brand-blue/5'
              )}
            >
              <div className="flex items-start gap-2.5">
                <div className={clsx(
                  'w-2 h-2 rounded-full mt-1.5 flex-shrink-0',
                  !n.isRead ? 'bg-brand-gold' : 'bg-gray-300'
                )} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{n.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{n.message}</p>
                  <p className="text-xs text-gray-400 mt-1">{n.time}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50">
          <button className="text-xs text-brand-blue font-medium hover:underline w-full text-center">
            View all notifications
          </button>
        </div>
      </div>
    </>
  )
}
