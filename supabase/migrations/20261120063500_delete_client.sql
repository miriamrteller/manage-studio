-- =============================================================================
-- delete_client(p_person_id, p_confirm)
--
-- Lets a studio admin delete a client added by mistake (for example by a
-- spreadsheet import). Safe behaviour:
--
-- * What goes: the client; if they hold an account, everyone in that account
--   (e.g. imported children); their shoots/bookings and the things that only
--   hang off those (shoot details, unpaid quotes and payment requests, holds,
--   waitlist places, attendance marks, contact preferences, import markers).
-- * What stops it: any money or signed record. Payments, paid or refunded
--   payment requests, photo or shop orders, class cards, credits, cash notes,
--   billing set-up, signed waivers, consents, legal acceptances or accepted
--   quotes. Then
--   nothing is deleted and the screen suggests "Set to Inactive" instead.
--   Financial and legal records are never destroyed by this function.
-- * Safety net: if any other record still points at the client, the whole
--   delete is rolled back and reported as 'linked'.
--
-- p_confirm = false only reports what would happen (for the confirm step).
-- Returns { can_delete, deleted, blockers[], people, shoots }.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.delete_client(p_person_id UUID, p_confirm BOOLEAN DEFAULT false)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id   UUID := client_import_admin_tenant();
  v_people      UUID[];
  v_accounts    UUID[];
  v_engagements UUID[];
  v_blockers    TEXT[] := '{}';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM people WHERE id = p_person_id AND tenant_id = v_tenant_id) THEN
    RAISE EXCEPTION 'Client not found';
  END IF;

  SELECT coalesce(array_agg(a.id), '{}') INTO v_accounts
  FROM accounts a WHERE a.person_id = p_person_id AND a.tenant_id = v_tenant_id;

  SELECT coalesce(array_agg(DISTINCT p.id), '{}') INTO v_people
  FROM people p
  WHERE p.tenant_id = v_tenant_id
    AND (p.id = p_person_id OR p.account_id = ANY(v_accounts));

  SELECT coalesce(array_agg(e.id), '{}') INTO v_engagements
  FROM engagements e WHERE e.person_id = ANY(v_people);

  -- Money
  IF EXISTS (SELECT 1 FROM payments
             WHERE person_id = ANY(v_people) OR account_id = ANY(v_accounts) OR engagement_id = ANY(v_engagements))
     OR EXISTS (SELECT 1 FROM job_payment_requests
                WHERE engagement_id = ANY(v_engagements) AND status IN ('paid', 'refunded_manual'))
     OR EXISTS (SELECT 1 FROM billing_accounts WHERE person_id = ANY(v_people) OR account_id = ANY(v_accounts))
     OR EXISTS (SELECT 1 FROM billing_schedules WHERE engagement_id = ANY(v_engagements))
     OR EXISTS (SELECT 1 FROM service_credits WHERE person_id = ANY(v_people))
     OR EXISTS (SELECT 1 FROM class_cash_notes WHERE person_id = ANY(v_people))
  THEN
    v_blockers := v_blockers || 'payments'::text;
  END IF;

  -- Orders
  IF EXISTS (SELECT 1 FROM job_photo_orders WHERE person_id = ANY(v_people) OR engagement_id = ANY(v_engagements))
     OR EXISTS (SELECT 1 FROM shop_orders
                WHERE person_id = ANY(v_people) OR ordered_by = ANY(v_people) OR engagement_id = ANY(v_engagements))
  THEN
    v_blockers := v_blockers || 'orders'::text;
  END IF;

  -- Class cards
  IF EXISTS (SELECT 1 FROM class_cards WHERE person_id = ANY(v_people) OR account_id = ANY(v_accounts))
     OR EXISTS (SELECT 1 FROM class_card_visits WHERE person_id = ANY(v_people))
  THEN
    v_blockers := v_blockers || 'class_cards'::text;
  END IF;

  -- Signed forms
  IF EXISTS (SELECT 1 FROM waiver_evidence WHERE person_id = ANY(v_people))
     OR EXISTS (SELECT 1 FROM consent_records WHERE person_id = ANY(v_people))
     OR EXISTS (SELECT 1 FROM legal_acceptances WHERE engagement_id = ANY(v_engagements))
     OR EXISTS (SELECT 1 FROM quotes
                WHERE (engagement_id = ANY(v_engagements) OR account_id = ANY(v_accounts)) AND status = 'accepted')
  THEN
    v_blockers := v_blockers || 'signed_forms'::text;
  END IF;

  IF NOT p_confirm OR cardinality(v_blockers) > 0 THEN
    RETURN jsonb_build_object(
      'can_delete', cardinality(v_blockers) = 0,
      'deleted', false,
      'blockers', to_jsonb(v_blockers),
      'people', cardinality(v_people),
      'shoots', cardinality(v_engagements)
    );
  END IF;

  BEGIN
    UPDATE notification_log SET recipient_person_id = NULL WHERE recipient_person_id = ANY(v_people);
    UPDATE leads SET converted_account_id = NULL WHERE converted_account_id = ANY(v_accounts);
    UPDATE engagements SET scheduling_hold_id = NULL WHERE id = ANY(v_engagements);
    UPDATE scheduling_holds SET engagement_id = NULL WHERE engagement_id = ANY(v_engagements);

    DELETE FROM job_payment_requests WHERE engagement_id = ANY(v_engagements);
    DELETE FROM quotes WHERE engagement_id = ANY(v_engagements) OR account_id = ANY(v_accounts);
    DELETE FROM enrolment_resume_drafts WHERE engagement_id = ANY(v_engagements);
    DELETE FROM engagements WHERE id = ANY(v_engagements);

    DELETE FROM waitlist WHERE person_id = ANY(v_people);
    DELETE FROM requirement_overrides WHERE person_id = ANY(v_people);
    DELETE FROM contact_preferences WHERE person_id = ANY(v_people);
    DELETE FROM attendance WHERE person_id = ANY(v_people);
    DELETE FROM account_members WHERE person_id = ANY(v_people) OR account_id = ANY(v_accounts);

    UPDATE people SET account_id = NULL WHERE id = ANY(v_people);
    DELETE FROM accounts WHERE id = ANY(v_accounts);
    DELETE FROM people WHERE id = ANY(v_people);
  EXCEPTION WHEN foreign_key_violation OR check_violation THEN
    RETURN jsonb_build_object(
      'can_delete', false,
      'deleted', false,
      'blockers', jsonb_build_array('linked'),
      'people', cardinality(v_people),
      'shoots', cardinality(v_engagements)
    );
  END;

  -- Ids and counts only: no names or contact details in the audit log.
  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, before_state)
  VALUES (
    v_tenant_id, auth.uid(), 'DELETE', 'people', p_person_id,
    jsonb_build_object('people', cardinality(v_people), 'shoots', cardinality(v_engagements))
  );

  RETURN jsonb_build_object(
    'can_delete', true,
    'deleted', true,
    'blockers', '[]'::jsonb,
    'people', cardinality(v_people),
    'shoots', cardinality(v_engagements)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_client(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_client(UUID, BOOLEAN) TO authenticated;
