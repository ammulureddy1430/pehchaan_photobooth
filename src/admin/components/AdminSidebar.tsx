import React from 'react'
import type { AdminRoute } from '../types'
import { IconDashboard, IconEvents, IconProfile } from './AdminIcons'

interface AdminSidebarProps {
  currentPath: string
  isOpen: boolean
  onNavigate: (route: AdminRoute) => void
  onClose: () => void
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  currentPath,
  isOpen,
  onNavigate,
  onClose,
}) => {
  const navItems: Array<{ path: AdminRoute; label: string; icon: React.ReactNode }> = [
    { path: '/admin/dashboard', label: 'Dashboard', icon: <IconDashboard size={18} /> },
    { path: '/admin/events', label: 'Events', icon: <IconEvents size={18} /> },
    { path: '/admin/profile', label: 'School Profile', icon: <IconProfile size={18} /> },
  ]

  const handleNavClick = (path: AdminRoute) => {
    onNavigate(path)
    onClose()
  }

  return (
    <>
      {isOpen && <div className="admin-sidebar-backdrop" onClick={onClose} />}
      <aside className={`admin-sidebar ${isOpen ? 'open' : ''}`}>
        <div className="admin-sidebar-header">
          <div className="admin-sidebar-logo-mark">P</div>
          <div>
            <div className="admin-sidebar-brand-name">Pehchaan</div>
            <div className="admin-sidebar-brand-sub">School Admin</div>
          </div>
        </div>

        <nav className="admin-sidebar-nav">
          {navItems.map((item) => {
            const isActive = currentPath === item.path
            return (
              <button
                key={item.path}
                type="button"
                className={`admin-nav-item ${isActive ? 'active' : ''}`}
                onClick={() => handleNavClick(item.path)}
              >
                <span className="admin-nav-icon">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>
      </aside>
    </>
  )
}
