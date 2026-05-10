/// <reference types="vite/client" />
import { useMemo } from 'react'
import type { Tenant } from '@shared/schemas'

/**
 * Resolve tenant from environment (dev) or subdomain (prod)
 * 
 * Phase 1A: Returns defaults. Phase 1B will fetch from Supabase auth context.
 * Tenant config (locale, dir, colors, fonts) comes from tenant row in DB.
 * CSS variables and i18n directory are controlled by this hook's return values.
 */
export function useTenant(): Tenant | null {
  return useMemo(() => {
    // Development: use VITE_DEV_TENANT_SUBDOMAIN from .env.local
    const devSubdomain = import.meta.env.VITE_DEV_TENANT_SUBDOMAIN as string | undefined
    if (devSubdomain) {
      return {
        id: `tenant-${devSubdomain}` as unknown as string, // Phase 1B: UUID from Supabase
        subdomain: devSubdomain,
        name: 'Ballet School',
        locale: 'he-IL',    // Phase 1B: from tenant.locale in DB
        dir: 'rtl',         // Phase 1B: from tenant.dir in DB
        currency: 'ILS',
        vat_rate: 0.17,
      }
    }

    // Production: parse subdomain from hostname
    // e.g., "ballet-school.myapp.com" → "ballet-school"
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname
      const parts = hostname.split('.')

      if (parts.length > 1) {
        const subdomain = parts[0]
        return {
          id: `tenant-${subdomain}` as unknown as string, // Phase 1B: UUID from Supabase
          subdomain,
          name: subdomain.replace(/-/g, ' '),
          locale: 'he-IL',    // Phase 1B: from tenant.locale in DB
          dir: 'rtl',         // Phase 1B: from tenant.dir in DB
          currency: 'ILS',
          vat_rate: 0.17,
        }
      }
    }

    return null
  }, [])
}
