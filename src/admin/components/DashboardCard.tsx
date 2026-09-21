import React from 'react'

export interface DashboardCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ReactNode
  iconVariant?: 'gold' | 'emerald' | 'blue' | 'purple'
  badge?: {
    text: string
    variant?: 'live' | 'paused' | 'ended' | 'active'
  }
}

export const DashboardCard: React.FC<DashboardCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  iconVariant = 'gold',
  badge,
}) => {
  return (
    <div className="admin-stat-card">
      <div className="admin-stat-header">
        <span className="admin-stat-title">{title}</span>
        <div className={`admin-stat-icon-wrapper ${iconVariant}`}>{icon}</div>
      </div>
      <div className="admin-stat-value">{value}</div>
      {(subtitle || badge) && (
        <div className="admin-stat-footer">
          {badge && (
            <span className={`admin-badge admin-badge-${badge.variant || 'active'}`}>
              {badge.text}
            </span>
          )}
          {subtitle && <span>{subtitle}</span>}
        </div>
      )}
    </div>
  )
}
