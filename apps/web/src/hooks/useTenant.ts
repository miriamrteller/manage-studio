/// <reference types="vite/client" />
import { useMemo } from 'react'

interface Tenant {
  subdomain: string
  id: string
  name: string
  dir: 'rtl' | 'ltr'
  locale: string
}

export function useTenant(): Tenant | null {
  return useMemo(() => {
    // Development: use VITE_DEV_TENANT_SUBDOMAIN from .env.local
    const devSubdomain = import.meta.env.VITE_DEV_TENANT_SUBDOMAIN as string | undefined
    if (devSubdomain) {
      return {
        subdomain: devSubdomain,
        id: `tenant-${devSubdomain}`,
        name: 'Ballet School',
        dir: 'rtl',
        locale: 'he-IL',
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
          subdomain,
          id: `tenant-${subdomain}`,
          name: subdomain.replace(/-/g, ' '),
          dir: 'rtl',
          locale: 'he-IL',
        }
      }
    }

    return null
  }, [])
}
