import type { StudioProfile, VerticalId } from '@shared/index'

/**
 * The profile each skin's existing studios carry after migration 20261103…_business_profile_existing_studios:
 * it reproduces the menu those studios had when the skin decided it.
 */
export function profileForSkin(vertical: VerticalId): StudioProfile {
  switch (vertical) {
    case 'photographer':
      return { paymentFlow: 'both', teachesClasses: false, familyAccounts: false, clientBooking: true }
    case 'beautician':
      return { paymentFlow: 'recurring', teachesClasses: false, familyAccounts: false, clientBooking: true }
    default:
      return { paymentFlow: 'recurring', teachesClasses: true, familyAccounts: true, clientBooking: true }
  }
}
