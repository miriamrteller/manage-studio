import { describe, expect, it } from 'vitest'
import { isExpectedError } from '@/lib/query-client'
import { NoActiveSeasonError } from '@/features/admin-dashboard/services/adminDashboardService'

describe('isExpectedError', () => {
  it('treats "no active season" as an expected state, not an error to report', () => {
    expect(isExpectedError(new NoActiveSeasonError())).toBe(true)
  })

  it('still reports unexpected errors', () => {
    expect(isExpectedError(new Error('permission denied for table tenants'))).toBe(false)
  })
})
