-- Fix guest_enrolment_create_engagement: billing_account_id must reference billing_accounts,
-- not family accounts. Resolve payer (guardian account_holder or self) and get/create billing account.
-- Return existing engagement id on duplicate (idempotent checkout retries).

CREATE OR REPLACE FUNCTION public.guest_enrolment_create_engagement(
  p_subdomain TEXT,
  p_student_person_id UUID,
  p_offering_id UUID,
  p_season_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_student_account_id UUID;
  v_payer_person_id UUID;
  v_billing_account_id UUID;
  v_engagement_id UUID;
BEGIN
  SELECT id INTO v_tenant_id FROM tenants WHERE subdomain = trim(p_subdomain) LIMIT 1;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM people
    WHERE id = p_student_person_id AND tenant_id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'Person not found';
  END IF;

  SELECT account_id INTO v_student_account_id
  FROM people
  WHERE id = p_student_person_id;

  IF v_student_account_id IS NOT NULL THEN
    SELECT am.person_id INTO v_payer_person_id
    FROM account_members am
    WHERE am.account_id = v_student_account_id
      AND am.role = 'account_holder'
    LIMIT 1;
  END IF;

  IF v_payer_person_id IS NULL THEN
    v_payer_person_id := p_student_person_id;
  END IF;

  SELECT id INTO v_engagement_id
  FROM engagements
  WHERE tenant_id = v_tenant_id
    AND person_id = p_student_person_id
    AND offering_id = p_offering_id
    AND season_id = p_season_id
  LIMIT 1;

  IF v_engagement_id IS NOT NULL THEN
    RETURN jsonb_build_object('engagementId', v_engagement_id);
  END IF;

  SELECT id INTO v_billing_account_id
  FROM billing_accounts
  WHERE tenant_id = v_tenant_id
    AND person_id = v_payer_person_id
    AND status = 'active'
  LIMIT 1;

  IF v_billing_account_id IS NULL THEN
    INSERT INTO billing_accounts (tenant_id, person_id, status)
    VALUES (v_tenant_id, v_payer_person_id, 'active')
    RETURNING id INTO v_billing_account_id;
  END IF;

  INSERT INTO engagements (
    tenant_id, person_id, offering_id, season_id, billing_account_id, status
  )
  VALUES (
    v_tenant_id,
    p_student_person_id,
    p_offering_id,
    p_season_id,
    v_billing_account_id,
    'pending_payment'
  )
  RETURNING id INTO v_engagement_id;

  RETURN jsonb_build_object('engagementId', v_engagement_id);
END;
$$;
