import React from 'react'

import './index.scss'

const baseClass = 'before-dashboard'

const BeforeDashboard: React.FC = () => {
  return (
    <div className={baseClass}>
      <div className={`${baseClass}__card`}>
        <h2>High6 CMS — Multi-Tenant Platform</h2>
        <p>
          Manage content across client sites from one dashboard. Every collection is scoped to a
          tenant — configure identities in{' '}
          <strong>
            <a href="/admin/collections/tenants?limit=10">Tenant Management</a>
          </strong>{' '}
          before adding content.
        </p>
      </div>
    </div>
  )
}

export default BeforeDashboard
