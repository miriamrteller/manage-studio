import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  GENERAL_PROFILE,
  PROFILE_GATES,
  defaultFeatureKeys,
  profileFromTenant,
  type StudioProfile,
} from '@shared/index'

const functions = join(__dirname, '../../../../supabase/functions')
const migrations = join(__dirname, '../../../../supabase/migrations')

/** Every `UPDATE feature_definitions SET profile_gate = 'x' WHERE key IN (...)` in the chain. */
function seededGates(): Record<string, string> {
  const gates: Record<string, string> = {}
  for (const file of readdirSync(migrations).sort()) {
    const sql = readFileSync(join(migrations, file), 'utf8')
    const re = /UPDATE feature_definitions SET profile_gate = '(\w+)'\s+WHERE key (?:IN \(([^)]*)\)|= '([^']+)')/g
    for (const m of sql.matchAll(re)) {
      const keys = m[2] ? [...m[2].matchAll(/'([^']+)'/g)].map((k) => k[1]) : [m[3]]
      for (const key of keys) gates[key] = m[1]
    }
  }
  return gates
}

const on = (over: Partial<StudioProfile>): StudioProfile => ({ ...GENERAL_PROFILE, ...over })

describe('studio profile', () => {
  it('the TypeScript gates are exactly the gates seeded in the database', () => {
    expect(PROFILE_GATES).toEqual(seededGates())
  })

  it('a general studio gets both payment flows and none of the switches', () => {
    const keys = defaultFeatureKeys(GENERAL_PROFILE)
    expect(keys).toEqual(expect.arrayContaining(['billing:recurring.enabled', 'billing:quotes.generate']))
    expect(keys).not.toContain('people:families.manage')
    expect(keys).not.toContain('offerings:structure.configure')
    expect(keys).not.toContain('scheduling:booking.client')
  })

  it('monthly and project flows are exclusive; both has both', () => {
    const monthly = defaultFeatureKeys(on({ paymentFlow: 'recurring' }))
    const project = defaultFeatureKeys(on({ paymentFlow: 'project' }))
    expect(monthly).toContain('billing:dunning.enabled')
    expect(monthly).not.toContain('billing:delivery.gated')
    expect(project).toContain('billing:delivery.gated')
    expect(project).not.toContain('billing:recurring.enabled')
  })

  it('each switch turns on only its own features', () => {
    expect(defaultFeatureKeys(on({ paymentFlow: 'recurring', familyAccounts: true }))).toContain('people:families.manage')
    expect(defaultFeatureKeys(on({ teachesClasses: true }))).toEqual(
      expect.arrayContaining(['offerings:structure.configure', 'scheduling:calendar.view', 'offerings:booking.public']),
    )
    expect(defaultFeatureKeys(on({ clientBooking: true }))).toEqual(
      expect.arrayContaining(['scheduling:booking.client', 'scheduling:integration.google_calendar']),
    )
  })

  it('maps a tenants row, treating an unknown flow as both', () => {
    expect(profileFromTenant({ payment_flow: 'project', teaches_classes: true, family_accounts: false, client_booking: true }))
      .toEqual({ paymentFlow: 'project', teachesClasses: true, familyAccounts: false, clientBooking: true })
    expect(profileFromTenant({ payment_flow: 'x', teaches_classes: false, family_accounts: false, client_booking: false }).paymentFlow).toBe('both')
  })

  it('money never reads features: charging, dunning, reminders and payment recording ignore them', () => {
    const moneyFunctions = [
      'run-monthly-billing', 'run-enrolment-payment-dunning', 'run-job-payment-reminders', 'record-payment',
      'record-job-payment', 'handle-payment-event', 'handle-payment-document', 'send-job-payment-link',
      'job-payment-request-public', 'confirm-mock-payment', 'get-payment-status',
    ]
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((f) => {
        const full = join(dir, f)
        return statSync(full).isDirectory() ? files(full) : full.endsWith('.ts') && !full.includes('.test.') ? [full] : []
      })
    const offenders: string[] = []
    for (const name of moneyFunctions) {
      const dir = join(functions, name)
      expect(existsSync(dir), `${name} should exist (update this list if it was renamed)`).toBe(true)
      for (const file of files(dir)) {
        if (/feature-gate|requireFeature|hasFeature|get_tenant_features|enabled_features|tenant_feature_overrides/.test(readFileSync(file, 'utf8'))) {
          offenders.push(file.replace(functions, ''))
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
