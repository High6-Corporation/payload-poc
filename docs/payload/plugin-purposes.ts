/**
 * Static purpose annotations for the plugin inventory view (admin →
 * Plugin Inventory, super-admin only).
 *
 * Single source of truth for WHY each Payload-related package is in this
 * project. The `/api/plugin-inventory` route merges this file with live
 * data (installed version from node_modules, latest from the npm registry)
 * at render time. Update this file whenever a package is added, removed,
 * or re-wired — the view flags any package it finds in package.json that
 * has no annotation here.
 */

export type PluginWiring = 'plugins-array' | 'config' | 'route-group' | 'component' | 'unused'

export interface PluginPurpose {
  /** One line: what this package does in THIS project. */
  purpose: string
  /** Why it was added (decision context, not a repeat of the purpose). */
  addedBecause: string
  /**
   * How the package is wired into the app:
   * - `plugins-array` — registered in src/plugins/index.ts (or payload.config.ts plugins)
   * - `config`        — referenced directly in payload.config.ts (adapter, editor, etc.)
   * - `route-group`   — used by the (payload) admin route group (runtime integration)
   * - `component`     — used by app components only (not in config/plugins)
   * - `unused`        — installed but referenced nowhere in src/ (removal candidate)
   */
  wiring: PluginWiring
  /** plugin | core | infrastructure */
  category: 'plugin' | 'core' | 'infrastructure'
}

export const PLUGIN_PURPOSES: Record<string, PluginPurpose> = {
  payload: {
    purpose: 'Payload CMS core — config, local API, REST/GraphQL, and the admin runtime.',
    addedBecause: 'The CMS under evaluation for the multi-tenant POC; pinned to 3.85.1.',
    wiring: 'config',
    category: 'core',
  },
  '@payloadcms/db-mongodb': {
    purpose: 'MongoDB adapter (mongooseAdapter) connecting Payload to Atlas.',
    addedBecause: 'Production database is MongoDB Atlas.',
    wiring: 'config',
    category: 'infrastructure',
  },
  '@payloadcms/richtext-lexical': {
    purpose: 'Lexical rich-text editor — the project-wide default editor.',
    addedBecause: 'Website template default; kept as the editor for all rich-text fields.',
    wiring: 'config',
    category: 'core',
  },
  '@payloadcms/next': {
    purpose: 'Next.js integration — serves the admin app + API through the (payload) route group.',
    addedBecause: 'Payload 3 runs natively inside the Next.js App Router.',
    wiring: 'route-group',
    category: 'core',
  },
  '@payloadcms/ui': {
    purpose: 'Payload admin UI kit (theme tokens, useAuth/useConfig hooks) for custom components.',
    addedBecause: 'Custom admin components reuse the admin’s own primitives instead of external UI kits.',
    wiring: 'component',
    category: 'infrastructure',
  },
  '@payloadcms/storage-s3': {
    purpose: 'S3-compatible storage adapter for media, imports, and exports collections.',
    addedBecause: 'Media files live in Supabase Storage, not local disk (production-safe uploads).',
    wiring: 'plugins-array',
    category: 'infrastructure',
  },
  '@payloadcms/admin-bar': {
    purpose: 'Frontend AdminBar — floating preview/edit bar on public pages.',
    addedBecause: 'Template feature for draft preview on the public site.',
    wiring: 'component',
    category: 'infrastructure',
  },
  '@payloadcms/live-preview-react': {
    purpose: 'LivePreviewListener — real-time draft preview updates on [slug] pages.',
    addedBecause: 'Template feature; pairs with the AdminBar.',
    wiring: 'component',
    category: 'infrastructure',
  },
  '@payloadcms/email-nodemailer': {
    purpose:
      'nodemailer-based email adapter — NOT USED since v38: the custom SMTP2GO HTTP-API adapter replaced it (nodemailer is imported directly only for the env-fallback relay).',
    addedBecause: 'Left over from the website template; candidate for removal after a dep check.',
    wiring: 'unused',
    category: 'infrastructure',
  },
  '@payloadcms/plugin-form-builder': {
    purpose:
      'Forms + Form Submissions collections, Form layout block, and email-on-submission (with site injection via beforeEmail).',
    addedBecause: 'Client contact/application forms (Matchpoint, Equator, apir-tayo).',
    wiring: 'plugins-array',
    category: 'plugin',
  },
  '@payloadcms/plugin-import-export': {
    purpose:
      'CSV/JSON import/export for form-submissions and custom-collection-entries (imports/exports collections).',
    addedBecause: 'Client data portability — bulk imports with sanitization hooks.',
    wiring: 'plugins-array',
    category: 'plugin',
  },
  '@payloadcms/plugin-multi-tenant': {
    purpose: 'Tenant relationship field + tenant-scoped access control + admin tenant selector.',
    addedBecause: 'Core of the multi-tenant POC — every tenant-scoped collection depends on it.',
    wiring: 'plugins-array',
    category: 'plugin',
  },
  '@payloadcms/plugin-nested-docs': {
    purpose: 'Parent/child hierarchy for categories (breadcrumbs).',
    addedBecause: 'Nested taxonomy for posts.',
    wiring: 'plugins-array',
    category: 'plugin',
  },
  '@payloadcms/plugin-redirects': {
    purpose: 'Redirects collection + redirect handling for pages/posts.',
    addedBecause: 'Template feature, kept for URL migrations and SEO.',
    wiring: 'plugins-array',
    category: 'plugin',
  },
  '@payloadcms/plugin-seo': {
    purpose: 'SEO meta fields (title/description/OG image, focus keyword) on pages/posts.',
    addedBecause: 'Client SEO requirements (per-site focus keywords).',
    wiring: 'plugins-array',
    category: 'plugin',
  },
  '@payloadcms/plugin-search': {
    purpose: 'Search collection reindexing posts (custom fields + beforeSync).',
    addedBecause: 'Site search on the public frontend.',
    wiring: 'plugins-array',
    category: 'plugin',
  },
}
