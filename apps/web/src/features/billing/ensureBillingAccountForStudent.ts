import { TenantDB } from '@/lib/db';
import type { Tenant } from '@shared/schemas';

/** Resolve payer + billing account for a student engagement (matches guest_enrolment_create_engagement). */
export async function ensureBillingAccountForStudent(
  tenant: Tenant,
  studentPersonId: string,
): Promise<string> {
  const { data: student, error: studentError } = await TenantDB.selectFor('people', tenant)
    .select('account_id')
    .eq('id', studentPersonId)
    .single();

  if (studentError || !student) {
    throw new Error('Student not found for billing account');
  }

  let payerPersonId = studentPersonId;

  if (student.account_id) {
    const { data: holder } = await TenantDB.selectFor('account_members', tenant)
      .select('person_id')
      .eq('account_id', student.account_id)
      .eq('role', 'account_holder')
      .limit(1)
      .maybeSingle();

    if (holder?.person_id) {
      payerPersonId = holder.person_id as string;
    }
  }

  const { data: payer, error: payerError } = await TenantDB.selectFor('people', tenant)
    .select('account_id')
    .eq('id', payerPersonId)
    .single();

  if (payerError || !payer) {
    throw new Error('Payer not found for billing account');
  }

  const payerAccountId = (payer.account_id as string | null) ?? null;

  if (payerAccountId) {
    const { data: householdBilling } = await TenantDB.selectFor('billing_accounts', tenant)
      .select('id')
      .eq('account_id', payerAccountId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();

    if (householdBilling?.id) {
      return householdBilling.id as string;
    }
  }

  const { data: personBilling } = await TenantDB.selectFor('billing_accounts', tenant)
    .select('id')
    .eq('person_id', payerPersonId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (personBilling?.id) {
    return personBilling.id as string;
  }

  const { data: created, error: createError } = await TenantDB.insert('billing_accounts', tenant, {
    account_id: payerAccountId,
    person_id: payerPersonId,
    status: 'active',
  })
    .select('id')
    .single();

  if (createError || !created?.id) {
    throw new Error(createError?.message ?? 'Failed to create billing account');
  }

  return created.id as string;
}
