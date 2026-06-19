'use client'

import React from 'react'

/**
 * Injects CSS to fix Payload admin UI layout issues stemming from
 * groupNavItems() hardcoding "Collections" and "Globals" first.
 *
 * Fixes:
 * 1. Sidebar & Dashboard: Tenant Management group above Collections
 * 2. Browse by Folder: placed after nav groups, before logout
 * 3. Logout: styled as a recognizable button with text label
 *
 * Registered as admin.components.beforeNavLinks in payload.config.ts.
 */
const SidebarOrderFix: React.FC = () => {
  return (
    <style>{`
      /* ── Sidebar nav: flex column so order works ── */
      .nav__wrap {
        display: flex;
        flex-direction: column;
      }

      /* Group order: Tenant Management → Collections → Globals */
      #nav-group-Tenant\\ Management {
        order: -2;
      }

      #nav-group-Collections {
        order: -1;
      }

      /* Browse by Folder: after groups, before logout */
      .browse-by-folder-button {
        order: 1;
      }

      /* Controls (settings + logout): at the very bottom */
      .nav__controls {
        order: 2;
      }

      /* ── Logout: make it a recognizable button ── */
      .nav__log-out {
        display: flex !important;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 0.75rem;
        border-radius: var(--style-radius-m);
        background: var(--theme-elevation-100);
        color: var(--theme-elevation-800);
        text-decoration: none;
        font-size: 0.875rem;
        line-height: 1;
        transition: background 0.15s ease;
        margin-top: 0.5rem;
      }

      .nav__log-out::after {
        content: attr(aria-label);
      }

      .nav__log-out:hover,
      .nav__log-out:focus-visible {
        background: var(--theme-elevation-200);
        color: var(--theme-elevation-950);
      }

      /* Keep the icon sized appropriately */
      .nav__log-out svg {
        flex-shrink: 0;
        width: 1.25rem;
        height: 1.25rem;
      }

      /* ── Dashboard: Tenant Management card group first ── */
      .collections__wrap {
        display: flex;
        flex-direction: column;
      }

      .collections__group:has(#card-tenants) {
        order: -2;
      }

      .collections__group:has(#card-pages) {
        order: -1;
      }
    `}</style>
  )
}

export default SidebarOrderFix
