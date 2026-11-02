-- Document queue: a 'not_issued' status (payments audit P2 #12).
--
-- Grow, iCount and Invoice4U only issue a tax document together with their own card charge;
-- they have no standalone document API. A cash / bank-transfer payment (or a refund) in a
-- studio whose documents come from one of them can never get a document from OpalSwift.
-- Until now that queue row was tried, went 'dead' and alerted the admins every time.
-- Now enqueueDocument records it straight away as 'not_issued' (with the reason in
-- last_error): no retries, no alert, and the finance page lists it so the owner can issue
-- that receipt themselves.
--
-- Additive: widens the status check; existing rows are unchanged.

-- Drop the existing status check whatever it is called (inline CHECKs get a generated name).
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'public.document_queue'::regclass
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.document_queue DROP CONSTRAINT %I', c.conname);
  END LOOP;
END;
$$;

ALTER TABLE public.document_queue
  ADD CONSTRAINT document_queue_status_check
  CHECK (status IN ('pending', 'processing', 'succeeded', 'dead', 'not_issued'));
