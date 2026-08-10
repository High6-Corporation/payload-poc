'use client'

import { useAuth } from '@payloadcms/ui'
import React from 'react'
import './index.scss'

const baseClass = 'after-dashboard'

const AfterDashboard: React.FC = () => {
  const { user } = useAuth()
  const isTenantAdmin = !(user as any)?.roles?.includes('super-admin')

  if (!isTenantAdmin) return null

  return (
    <div className={baseClass}>
      <div className={`${baseClass}__card`}>
        <h2 className={`${baseClass}__title`}>Coming Soon</h2>
        <p className={`${baseClass}__text`}>
          More dashboard improvements coming soon — analytics, recent activity,
          and at-a-glance content summaries.
        </p>
      </div>
    </div>
  )
}

export default AfterDashboard
