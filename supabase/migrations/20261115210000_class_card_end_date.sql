-- =============================================================================
-- Class cards that end on a set date (e.g. "valid until 14 May"), not N months
-- after they are paid.
--
-- class_card_types.ends_on: when set, every card of this type is valid until
-- that day, whenever it was bought (instead of valid_months). Applied when a
-- card becomes active (sold at the studio, or paid online), by a trigger, so
-- issue_class_card and the purchase trigger need no change. A later extension
-- (the one-time "more time") still works as before. A card that starts after
-- the end date is valid on its start day only; the studio stops selling the
-- type then (Settings -> Class cards -> on sale).
-- ADDITIVE.
-- =============================================================================

ALTER TABLE class_card_types ADD COLUMN ends_on DATE;
COMMENT ON COLUMN class_card_types.ends_on IS
  'Set = every card of this type is valid until this day, whenever bought (overrides valid_months). NULL = valid_months applies.';

CREATE OR REPLACE FUNCTION private.class_card_apply_end_date()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_ends DATE;
BEGIN
  IF NEW.status <> 'active' OR (TG_OP = 'UPDATE' AND OLD.status = 'active') THEN
    RETURN NEW;
  END IF;
  SELECT ends_on INTO v_ends FROM class_card_types WHERE id = NEW.card_type_id;
  IF v_ends IS NOT NULL THEN
    NEW.valid_until := GREATEST(v_ends, COALESCE(NEW.starts_on, v_ends));
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION private.class_card_apply_end_date() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trigger_class_card_apply_end_date
  BEFORE INSERT OR UPDATE OF status ON class_cards
  FOR EACH ROW EXECUTE FUNCTION private.class_card_apply_end_date();
