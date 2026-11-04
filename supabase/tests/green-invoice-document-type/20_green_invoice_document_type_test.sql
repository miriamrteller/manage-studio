-- Green Invoice document type: prefilled from business status when a studio is created on
-- Green Invoice, then only the owner changes it. Fixture: client-portal seed; Photo is …01.
DO $$
DECLARE
  photo UUID := 'a0000000-0000-4000-8000-000000000001';
  v SMALLINT;
BEGIN
  -- 1. A studio created on Green Invoice: exempt dealer → receipt (400), company → 320.
  INSERT INTO tenants (id, name, subdomain, contact_email, invoicing_provider, legal_profile)
  VALUES ('a0000000-0000-4000-8000-0000000000f1', 'Exempt', 'gi-exempt', 'e@x.test', 'green_invoice',
          '{"business_status": "osek_patur"}'),
         ('a0000000-0000-4000-8000-0000000000f2', 'Company', 'gi-company', 'c@x.test', 'green_invoice',
          '{"business_status": "company"}');
  SELECT green_invoice_document_type INTO v FROM tenants WHERE id = 'a0000000-0000-4000-8000-0000000000f1';
  IF v <> 400 THEN RAISE EXCEPTION 'FAIL exempt dealer prefilled %', v; END IF;
  SELECT green_invoice_document_type INTO v FROM tenants WHERE id = 'a0000000-0000-4000-8000-0000000000f2';
  IF v <> 320 THEN RAISE EXCEPTION 'FAIL company prefilled %', v; END IF;
  RAISE NOTICE 'ok  new studios are prefilled from business status';

  -- 2. A later change of business status never switches it.
  UPDATE tenants SET legal_profile = '{"business_status": "company"}' WHERE id = 'a0000000-0000-4000-8000-0000000000f1';
  SELECT green_invoice_document_type INTO v FROM tenants WHERE id = 'a0000000-0000-4000-8000-0000000000f1';
  IF v <> 400 THEN RAISE EXCEPTION 'FAIL business status switched it to %', v; END IF;
  RAISE NOTICE 'ok  business status changes do not switch it';

  -- 3. The owner's own choice is stored as given, also together with a move to Green Invoice.
  UPDATE tenants SET invoicing_provider = 'none', legal_profile = '{"business_status": "osek_patur"}' WHERE id = photo;
  UPDATE tenants SET invoicing_provider = 'green_invoice', green_invoice_document_type = 320 WHERE id = photo;
  SELECT green_invoice_document_type INTO v FROM tenants WHERE id = photo;
  IF v <> 320 THEN RAISE EXCEPTION 'FAIL owner choice overwritten: %', v; END IF;
  RAISE NOTICE 'ok  the owner''s choice is kept';

  -- 4. Only 400 and 320.
  BEGIN
    UPDATE tenants SET green_invoice_document_type = 305 WHERE id = photo;
    RAISE EXCEPTION 'FAIL 305 accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'ok  only 400 and 320';
END $$;
