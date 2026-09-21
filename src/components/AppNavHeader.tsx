import React from 'react'
import './AppNavHeader.css'

interface AppNavHeaderProps {
  currentPath: string
  onNavigate: (path: string) => void
}

export const AppNavHeader: React.FC<AppNavHeaderProps> = ({ currentPath, onNavigate }) => {
  const isKiosk = currentPath === '/'
  const isAdmin = currentPath.startsWith('/admin')

  return (
    <nav className="universal-app-nav" aria-label="Main Application Switcher">
      <span className="universal-nav-brand">✦ Pehchaan</span>
      <span className="universal-nav-divider" />
      <button
        type="button"
        className={`universal-nav-tab ${isKiosk ? 'active' : ''}`}
        onClick={() => onNavigate('/')}
        title="Open Live Photobooth Capture Kiosk"
      >
        <span>📸 Photobooth Kiosk</span>
      </button>
      <button
        type="button"
        className={`universal-nav-tab ${isAdmin ? 'active' : ''}`}
        onClick={() => onNavigate('/admin/dashboard')}
        title="Open Admin Management Portal"
      >
        <span>⚙️ Admin Portal</span>
      </button>
    </nav>
  )
}
export default AppNavHeader
