-- =============================================================================
-- Class pipeline for leads (docs/plans/LEADS.md, step 3)
--
-- Stages for dance/class studios: new → contacted → trial_booked → trial_done
-- → won / lost. Photographers keep new / contacted / qualified / proposal / lost
-- (and their lead → quote → job conversion, untouched). The app shows each
-- kind of studio its own list; the DB accepts the union.
--
-- Auto-link on enrolment: when someone enrols in a CLASS, open leads of the
-- same studio whose email or phone matches the student's family become "won"
-- and point at the enrolment (converted_engagement_id) and family account
-- (converted_account_id) — exactly one match only. Several matches are marked
-- as suggestions (suggested_engagement_id) for the studio to choose by hand.
-- Photographer jobs are appointments, so convert_lead_to_job is unaffected.
-- The trigger can never fail an enrolment: any error becomes a WARNING.
--
-- ADDITIVE: wider CHECK, two nullable FKs, one helper, one trigger.
-- =============================================================================

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_stage_check;
ALTER TABLE leads ADD CONSTRAINT leads_stage_check CHECK (stage IN (
  'new', 'contacted', 'qualified', 'proposal', 'trial_booked', 'trial_done', 'won', 'lost'
));

ALTER TABLE leads
  ADD COLUMN converted_engagement_id UUID REFERENCES engagements(id) ON DELETE SET NULL,
  ADD COLUMN suggested_engagement_id UUID REFERENCES engagements(id) ON DELETE SET NULL;

COMMENT ON COLUMN leads.converted_engagement_id IS
  'The enrolment this lead became (auto-linked on enrolment, or linked by hand).';
COMMENT ON COLUMN leads.suggested_engagement_id IS
  'A possible matching enrolment when more than one lead matched; the studio confirms by hand.';

CREATE INDEX idx_leads_suggested_engagement ON leads(suggested_engagement_id) WHERE suggested_engagement_id IS NOT NULL;

-- Engagements linked to a lead must belong to the lead's studio.
CREATE OR REPLACE FUNCTION leads_check_engagements()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public AS $$
BEGIN
  IF NEW.converted_engagement_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM engagements e WHERE e.id = NEW.converted_engagement_id AND e.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'leads.converted_engagement_id must belong to the same studio' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.suggested_engagement_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM engagements e WHERE e.id = NEW.suggested_engagement_id AND e.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'leads.suggested_engagement_id must belong to the same studio' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER leads_check_engagements
  BEFORE INSERT OR UPDATE OF converted_engagement_id, suggested_engagement_id ON leads
  FOR EACH ROW EXECUTE FUNCTION leads_check_engagements();

-- Phone match key: digits only, last 9 (Israeli numbers with 0, 972 or +972
-- all reduce to the same key). Shorter numbers never match.
CREATE OR REPLACE FUNCTION lead_phone_key(p_phone TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE
SET search_path = public AS $$
  SELECT CASE
    WHEN length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) >= 9
    THEN right(regexp_replace(p_phone, '\D', '', 'g'), 9)
  END;
$$;

-- -----------------------------------------------------------------------------
-- Auto-link on enrolment (AFTER INSERT ON engagements).
-- SECURITY DEFINER: enrolments are created by guests and parents, who cannot
-- read leads. Tier: service (supabase/security/definer-execute.json).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION link_lead_on_enrolment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_account UUID;
  v_people  UUID[];
  v_emails  TEXT[];
  v_phones  TEXT[];
  v_matches UUID[];
BEGIN
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM offerings o WHERE o.id = NEW.offering_id AND o.offering_type = 'class'
    ) THEN
      RETURN NEW;
    END IF;

    SELECT coalesce(p.account_id,
                    (SELECT am.account_id FROM account_members am
                     WHERE am.person_id = p.id AND am.tenant_id = NEW.tenant_id LIMIT 1))
      INTO v_account
    FROM people p WHERE p.id = NEW.person_id AND p.tenant_id = NEW.tenant_id;

    -- The student, the family's main contact and every family member.
    SELECT array_agg(DISTINCT x) INTO v_people FROM (
      SELECT NEW.person_id AS x
      UNION SELECT a.person_id FROM accounts a WHERE a.id = v_account AND a.tenant_id = NEW.tenant_id
      UNION SELECT am.person_id FROM account_members am WHERE am.account_id = v_account AND am.tenant_id = NEW.tenant_id
      UNION SELECT p.id FROM people p WHERE p.account_id = v_account AND p.tenant_id = NEW.tenant_id
    ) s WHERE x IS NOT NULL;

    SELECT array_agg(DISTINCT lower(trim(p.email))) INTO v_emails
    FROM people p
    WHERE p.id = ANY (v_people) AND p.tenant_id = NEW.tenant_id AND nullif(trim(p.email), '') IS NOT NULL;

    SELECT array_agg(DISTINCT k) INTO v_phones FROM (
      SELECT lead_phone_key(cp.whatsapp_number) AS k FROM contact_preferences cp
      WHERE cp.person_id = ANY (v_people) AND cp.tenant_id = NEW.tenant_id
      UNION
      SELECT lead_phone_key(cp.voice_number) FROM contact_preferences cp
      WHERE cp.person_id = ANY (v_people) AND cp.tenant_id = NEW.tenant_id
    ) s WHERE k IS NOT NULL;

    IF v_emails IS NULL AND v_phones IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT array_agg(l.id) INTO v_matches
    FROM leads l
    WHERE l.tenant_id = NEW.tenant_id
      AND l.converted_account_id IS NULL
      AND l.stage NOT IN ('won', 'lost')
      AND (
        (v_emails IS NOT NULL AND lower(trim(l.email)) = ANY (v_emails))
        OR (v_phones IS NOT NULL AND lead_phone_key(l.phone) = ANY (v_phones))
      );

    IF coalesce(array_length(v_matches, 1), 0) = 1 AND v_account IS NOT NULL THEN
      UPDATE leads
         SET stage = 'won',
             converted_account_id = v_account,
             converted_at = now(),
             converted_engagement_id = NEW.id,
             suggested_engagement_id = NULL
       WHERE id = v_matches[1];
    ELSIF coalesce(array_length(v_matches, 1), 0) >= 1 THEN
      UPDATE leads
         SET suggested_engagement_id = NEW.id
       WHERE id = ANY (v_matches) AND suggested_engagement_id IS NULL;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'link_lead_on_enrolment: skipped (%): %', SQLSTATE, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION link_lead_on_enrolment() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER link_lead_on_enrolment
  AFTER INSERT ON engagements
  FOR EACH ROW EXECUTE FUNCTION link_lead_on_enrolment();
