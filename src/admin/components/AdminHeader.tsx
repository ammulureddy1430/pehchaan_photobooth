import React from 'react'
import type { AdminUser, SchoolProfile } from '../types'
import { IconCamera, IconLogout } from './AdminIcons'

interface AdminHeaderProps {
  title: string
  subtitle?: string
  user: AdminUser | null
  profile: SchoolProfile | null
  onToggleSidebar: () => void
  onLogout: () => void
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({
  title,
  user,
  profile,
  onToggleSidebar,
  onLogout,
}) => {
  const displayName = profile?.schoolName || user?.name || 'Administrator'
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'A'

  return (
    <header className="admin-header">
      <div className="admin-header-left">
        <button
          type="button"
          className="admin-menu-toggle"
          onClick={onToggleSidebar}
          aria-label="Toggle navigation menu"
        >
          <span style={{ fontSize: '1.15rem' }}>☰</span>
        </button>
        <div className="admin-header-title-group">
          <h1>{title}</h1>
        </div>
      </div>

      <div className="admin-header-right">
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="admin-btn admin-btn-primary"
          style={{ padding: '0.45rem 0.9rem', fontSize: '0.82rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontWeight: 600 }}
          title="Open Live Photobooth Kiosk in new tab"
        >
          <IconCamera size={15} />
          <span>Open Kiosk</span>
        </a>

        <div className="admin-user-badge">
          <div className="admin-avatar-pill">{initials}</div>
          <span className="admin-user-name" style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {displayName}
          </span>
        </div>

        <button
          type="button"
          className="admin-btn admin-btn-outline"
          style={{ padding: '0.45rem 0.8rem', fontSize: '0.82rem' }}
          onClick={onLogout}
          title="Sign out of admin session"
        >
          <IconLogout size={15} />
          <span>Logout</span>
        </button>
      </div>
    </header>
  )
}
