import React from 'react'

// ---------------------------------------------------------------------------
// Plugin Inventory admin view — SERVER wrapper (no 'use client').
//
// Payload 3.85.1 renders a NEW custom view (one that isn't overriding a
// built-in like `account`) with NO template at all — Root/index.js places it
// in a bare fragment, so the page would have no sidebar/header chrome.
// DefaultTemplate is a server component (it needs `i18n`, `payload`, `req`,
// and the access-filtered `visibleEntities`), so it cannot be rendered from a
// client component. This server wrapper therefore renders DefaultTemplate
// around the interactive client half (./client.tsx).
//
// The super-admin gate itself lives in GET /api/plugin-inventory — this
// wrapper just supplies the admin chrome for whichever state the client
// renders (including its "Access denied" state for non-super-admins).
// ---------------------------------------------------------------------------

import { DefaultTemplate } from '@payloadcms/next/templates'
import { SetStepNav } from '@payloadcms/ui'
import type { AdminViewServerProps, TypedUser } from 'payload'
import { PluginInventoryClient } from './client'

export const PluginInventoryView: React.FC<AdminViewServerProps> = (props) => {
  const { i18n, payload, permissions, initPageResult, viewActions, viewType, documentSubViewType } = props

  // ServerProps carries a visibleEntities fallback; the authoritative
  // access-filtered set always lives in initPageResult.
  const visibleEntities = props.visibleEntities ?? initPageResult.visibleEntities

  return (
    <DefaultTemplate
      i18n={i18n}
      payload={payload}
      permissions={permissions ?? initPageResult.permissions}
      user={props.user ?? (initPageResult.req.user as TypedUser | undefined)}
      visibleEntities={visibleEntities}
      viewActions={viewActions}
      viewType={viewType}
      documentSubViewType={documentSubViewType}
    >
      {/* Breadcrumb: home icon + "Plugin Inventory" as the current page
          (custom views get an empty step-nav by default — just the home icon,
          which reads as broken navigation). */}
      <SetStepNav nav={[{ label: 'Plugin Inventory' }]} />
      <PluginInventoryClient />
    </DefaultTemplate>
  )
}
