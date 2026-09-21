import React, { useEffect, useState, useCallback } from 'react'
import { AdminLogin } from './pages/AdminLogin'
import { AdminDashboard } from './pages/AdminDashboard'
import { AdminEvents } from './pages/AdminEvents'
import { AdminProfile } from './pages/AdminProfile'
import { AdminEventDashboard } from './pages/AdminEventDashboard'
import { AdminEventConfig } from './pages/AdminEventConfig'
import { AdminLayout } from './components/AdminLayout'
import { getStoredAdminToken, getStoredAdminUser, setStoredAdminUser } from './services/adminAuth'
import { adminGetMe, adminLogout, adminGetProfile } from './services/adminApi'
import type { AdminUser, SchoolProfile, AdminRoute } from './types'
import './styles/admin.css'

export const AdminApp: React.FC = () => {
  const [currentRoute, setCurrentRoute] = useState<AdminRoute>(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname
      if (path === '/admin/inquiries') {
        window.history.replaceState({}, '', '/admin/events')
        return '/admin/events'
      }
      if (
        path === '/admin/login' ||
        path === '/admin/dashboard' ||
        path === '/admin/events' ||
        path === '/admin/profile' ||
        path.startsWith('/admin/events/')
      ) {
        return path as AdminRoute
      }
    }
    return '/admin/dashboard'
  })

  const [user, setUser] = useState<AdminUser | null>(() => getStoredAdminUser())
  const [token, setToken] = useState<string | null>(() => getStoredAdminToken())
  const [profile, setProfile] = useState<SchoolProfile | null>(null)
  const [authChecking, setAuthChecking] = useState(true)

  // Navigation function
  const navigate = useCallback((route: AdminRoute) => {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', route)
    }
    setCurrentRoute(route)
  }, [])

  // Listen to browser forward/back buttons
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname
      if (path === '/admin/inquiries') {
        window.history.replaceState({}, '', '/admin/events')
        setCurrentRoute('/admin/events')
        return
      }
      if (
        path === '/admin/login' ||
        path === '/admin/dashboard' ||
        path === '/admin/events' ||
        path === '/admin/profile' ||
        path.startsWith('/admin/events/')
      ) {
        setCurrentRoute(path as AdminRoute)
      } else if (path.startsWith('/admin')) {
        setCurrentRoute('/admin/dashboard')
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  // Check and validate current authentication session
  const checkAuth = useCallback(async () => {
    const storedToken = getStoredAdminToken()
    if (!storedToken) {
      setUser(null)
      setToken(null)
      setAuthChecking(false)
      return
    }

    try {
      const [meRes, profRes] = await Promise.all([
        adminGetMe(),
        adminGetProfile().catch(() => null),
      ])
      setUser(meRes.admin)
      setStoredAdminUser(meRes.admin)
      setToken(storedToken)
      if (profRes?.profile) {
        setProfile(profRes.profile)
      }
    } catch {
      setUser(null)
      setToken(null)
    } finally {
      setAuthChecking(false)
    }
  }, [])

  useEffect(() => {
    void checkAuth()
  }, [checkAuth])

  // Handle Protected Routes Redirection
  useEffect(() => {
    if (authChecking) return

    const isAuthenticated = Boolean(token && user)
    if (!isAuthenticated && currentRoute !== '/admin/login') {
      navigate('/admin/login')
    } else if (isAuthenticated && currentRoute === '/admin/login') {
      navigate('/admin/dashboard')
    }
  }, [authChecking, token, user, currentRoute, navigate])

  const handleLoginSuccess = (loggedInUser: AdminUser, newToken: string) => {
    setUser(loggedInUser)
    setToken(newToken)
    // Fetch profile for header
    void adminGetProfile()
      .then((res) => setProfile(res.profile))
      .catch(() => null)
    navigate('/admin/dashboard')
  }

  const handleLogout = async () => {
    try {
      await adminLogout()
    } finally {
      setUser(null)
      setToken(null)
      navigate('/admin/login')
    }
  }

  // Loading indicator during initial session validation
  if (authChecking) {
    return (
      <div className="admin-portal">
        <div className="admin-login-wrapper">
          <div className="admin-loading-container">
            <div className="admin-spinner" />
            <p style={{ color: 'var(--adm-text-secondary)' }}>Authenticating admin session...</p>
          </div>
        </div>
      </div>
    )
  }

  // Unauthenticated -> render Login page
  if (!token || !user || currentRoute === '/admin/login') {
    return <AdminLogin onLoginSuccess={handleLoginSuccess} />
  }

  // Check event-specific sub-routes
  const eventDashboardMatch = currentRoute.match(/^\/admin\/events\/([^/]+)\/dashboard$/)
  const eventConfigMatch = currentRoute.match(/^\/admin\/events\/([^/]+)\/(?:manage|config)$/)

  // Determine header page title & subtitle based on current route
  let pageTitle = 'Dashboard'
  let pageSubtitle: string | undefined = 'Overview of events, captures, and photobooth status'

  if (eventDashboardMatch) {
    pageTitle = 'Event Dashboard'
    pageSubtitle = `Live telemetry and operational metrics for event ${eventDashboardMatch[1]}`
  } else if (eventConfigMatch) {
    pageTitle = 'Event Configuration'
    pageSubtitle = `Institutional branding and settings for event ${eventConfigMatch[1]}`
  } else if (currentRoute === '/admin/events') {
    pageTitle = 'Events'
    pageSubtitle = 'Manage institutional events, sessions, and activations'
  } else if (currentRoute === '/admin/profile') {
    pageTitle = 'School Profile'
    pageSubtitle = 'Institutional identity, contact records, and photobooth branding'
  }

  return (
    <AdminLayout
      currentRoute={currentRoute}
      title={pageTitle}
      subtitle={pageSubtitle}
      user={user}
      profile={profile}
      onNavigate={navigate}
      onLogout={handleLogout}
    >
      {currentRoute === '/admin/dashboard' && (
        <AdminDashboard
          onNavigate={navigate}
          onOpenEventDashboard={(evId) => navigate(`/admin/events/${evId}/dashboard`)}
        />
      )}
      {currentRoute === '/admin/events' && (
        <AdminEvents onNavigate={navigate} />
      )}
      {currentRoute === '/admin/profile' && (
        <AdminProfile onProfileUpdated={(updated) => setProfile(updated)} />
      )}
      {eventDashboardMatch && (
        <AdminEventDashboard
          eventId={eventDashboardMatch[1]}
          onBack={() => navigate('/admin/events')}
          onManageConfig={(evId) => navigate(`/admin/events/${evId}/config`)}
          onViewActivation={(evId) => navigate(`/admin/events/${evId}/config`)}
        />
      )}
      {eventConfigMatch && (
        <AdminEventConfig
          eventId={eventConfigMatch[1]}
          onBack={() => navigate('/admin/events')}
        />
      )}
    </AdminLayout>
  )
}
export default AdminApp
