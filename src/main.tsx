import { StrictMode, useEffect, useState, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AdminApp } from './admin/AdminApp'
import { InquiryPage } from './booking/InquiryPage'
import { AppNavHeader } from './components/AppNavHeader'
import './index.css'

export function RootApp() {
  const [currentPath, setCurrentPath] = useState(() => {
    return typeof window !== 'undefined' ? window.location.pathname : '/'
  })

  const navigate = useCallback((path: string) => {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', path)
    }
    setCurrentPath(path)
  }, [])

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const isAdmin = currentPath.startsWith('/admin')
  const isBooking =
    currentPath.startsWith('/inquire') ||
    currentPath.startsWith('/book') ||
    currentPath.startsWith('/inquiry') ||
    currentPath.startsWith('/quote') ||
    currentPath.startsWith('/booking')

  return (
    <>
      {!isAdmin && <AppNavHeader currentPath={currentPath} onNavigate={navigate} />}
      {isAdmin ? (
        <AdminApp />
      ) : isBooking ? (
        <InquiryPage />
      ) : (
        <App />
      )}
    </>
  )
}

const root = document.getElementById('root')

if (!root) {
  throw new Error('Root element not found')
}

createRoot(root).render(
  <StrictMode>
    <RootApp />
  </StrictMode>,
)

