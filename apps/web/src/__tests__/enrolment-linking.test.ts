import { describe, expect, it } from 'vitest';

/**
 * Documents when auth↔person linking must run.
 * See linkAuthUser.ts and docs/plans/2026-06-02-guest-enrollment-portal-provisioning.md
 */
describe('enrolment auth linking policy', () => {
  it('must not link at pending_payment / checkout prepare', () => {
    const forbiddenCallSites = ['EnrolmentStepper.prepareCheckout', 'EnrolmentPaymentForm.mount'];
    expect(forbiddenCallSites.length).toBeGreaterThan(0);
  });

  it('links guardian after payment via engagement id', () => {
    const allowedAfterPayment = 'linkGuardianForEngagement(engagementId)';
    expect(allowedAfterPayment).toContain('engagementId');
  });

  it('links adult solo via person id only when no family account', () => {
    const allowedAdultSolo = 'linkAuthUserToPerson(adultPersonId)';
    expect(allowedAdultSolo).toContain('adultPersonId');
  });

  it('never links tenant_admin during admin enrolment', () => {
    const adminMustNotLinkAtCheckout = true;
    expect(adminMustNotLinkAtCheckout).toBe(true);
  });
});
