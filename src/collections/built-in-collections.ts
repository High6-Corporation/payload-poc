// src/collections/built-in-collections.ts
//
// Registry of built-in collection types that appear in the per-site
// enabled-collections toggle.  Phase 3 (Menus, Headers & Footers, SMTP
// Settings) will add entries to this array — the toggle component reads it
// automatically and needs no changes.
//
// Each entry maps to a future top-level collection (e.g. "menus") that will
// be scoped to a site.  The `slug` MUST match the eventual collection slug
// so the toggle component can store a consistent key in disabledCollections.
// ---------------------------------------------------------------------------

export interface BuiltInCollection {
  /** Collection slug — must match the eventual Payload collection slug */
  slug: string
  /** Human-readable label shown in the toggle UI */
  label: string
  /** Optional description shown below the label in the toggle UI */
  description?: string
}

/**
 * Built-in collections available for per-site enable/disable.
 *
 * EMPTY BY DESIGN — Phase 3 will add entries like:
 *   { slug: 'menus', label: 'Menus' },
 *   { slug: 'headers-footers', label: 'Headers & Footers' },
 *   { slug: 'smtp-settings', label: 'SMTP Settings' },
 */
export const BUILT_IN_COLLECTIONS: BuiltInCollection[] = []
