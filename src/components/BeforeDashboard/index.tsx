import React from 'react'

import './index.scss'

const baseClass = 'before-dashboard'

const BeforeDashboard: React.FC = () => {
  return (
    <div className={baseClass}>
      <div className={`${baseClass}__card`}>
        <h2>Payload Multi-Tenant POC</h2>
        <p>
          This admin panel manages content across multiple tenants. The{' '}
          <strong>Tenant Management</strong> section at the top of the sidebar is where you
          configure tenant identities — every other collection is scoped to a tenant.
        </p>
      </div>
    </div>
  )
}

export default BeforeDashboard
