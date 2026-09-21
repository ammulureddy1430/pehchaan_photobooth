import React, { useState } from 'react'
import { AdminSidebar } from './AdminSidebar'
import { AdminHeader } from './AdminHeader'
import type { AdminUser, SchoolProfile, AdminRoute } from '../types'

interface AdminLayoutProps {
  currentRoute: AdminRoute
  title: string
  subtitle?: string
  user: AdminUser | null
  profile: SchoolProfile | null
  onNavigate: (route: AdminRoute) => void
  onLogout: () => void
  children: React.ReactNode
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  currentRoute,
  title,
  subtitle,
  user,
  profile,
  onNavigate,
  onLogout,
  children,
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="admin-portal">
      <div className="admin-layout">
        <AdminSidebar
          currentPath={currentRoute}
          isOpen={sidebarOpen}
          onNavigate={onNavigate}
          onClose={() => setSidebarOpen(false)}
        />

        <div className="admin-main-container">
          <AdminHeader
            title={title}
            subtitle={subtitle}
            user={user}
            profile={profile}
            onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
            onLogout={onLogout}
          />

          <main className="admin-content">{children}</main>
        </div>
      </div>
    </div>
  )
}
