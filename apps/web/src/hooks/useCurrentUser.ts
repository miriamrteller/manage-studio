import { useMemo } from 'react'

interface User {
  id: string
  email: string
  tenant_id: string
}

export function useCurrentUser(): User | null {
  return useMemo(() => {
    // Phase 1A: Return null. Phase 1B will populate from Supabase auth.session()
    return null
  }, [])
}
