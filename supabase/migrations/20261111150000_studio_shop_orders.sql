-- =============================================================================
-- 20261111150000: Studio shop (beta), families' side. Parents buy the studio's
-- items in the portal and collect them at the studio.
--
--   * shop_orders / shop_order_lines: what was bought, for whom, at what price
--     (names, sizes and prices are copied, so a later change to an item never
--     changes an order).
--   * place_shop_order(): the parent's cart. Stock is held when the order is
--     placed and given back if the order is cancelled or refunded before it is
--     collected. Payment is a job_payment_requests row (the usual /pay/:token
--     checkout) on the child's class enrolment, because payment requests and the
--     payment callbacks need an engagement; class cards do the same.
--   * The order follows its payment request (trigger): paid, cancelled, refunded.
--   * The studio marks a paid order "Ready to collect", then "Collected".
--   * An item that has been ordered is hidden instead of deleted.
--
-- ADDITIVE MIGRATION: new tables, one column, new functions; delete_shop_product
-- is replaced with the same signature.
-- DEPENDENCIES: 20261111110000 (shop_products), 20261110160400 (pattern).
-- =============================================================================

CREATE OR REPLACE FUNCTION private.studio_shop_enabled(p_tenant_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 'billing:studio_shop' = ANY(get_tenant_features(p_tenant_id));
$$;
REVOKE EXECUTE ON FUNCTION private.studio_shop_enabled(UUID) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
CREATE TABLE shop_orders (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- Who the items are for (the child, or the parent themselves).
  person_id           UUID        NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  -- Who placed the order.
  ordered_by          UUID        REFERENCES people(id) ON DELETE SET NULL,
  -- The class enrolment the payment request hangs off.
  engagement_id       UUID        NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  status              TEXT        NOT NULL DEFAULT 'awaiting_payment'
                      CHECK (status IN ('awaiting_payment', 'paid', 'ready', 'collected', 'cancelled')),
  total_minor         INT         NOT NULL CHECK (total_minor > 0),
  currency            TEXT        NOT NULL DEFAULT 'ILS',
  paid_at             TIMESTAMPTZ,
  ready_at            TIMESTAMPTZ,
  collected_at        TIMESTAMPTZ,
  cancelled_at        TIMESTAMPTZ,
  refunded_at         TIMESTAMPTZ,
  -- True while the order holds stock (placed and not yet cancelled or refunded).
  holds_stock         BOOLEAN     NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE shop_orders IS
  'Studio shop (beta): a family''s order of the studio''s items, collected at the studio.';
CREATE INDEX idx_shop_orders_tenant ON shop_orders(tenant_id, created_at DESC);
CREATE INDEX idx_shop_orders_person ON shop_orders(person_id);
CREATE INDEX idx_shop_orders_ordered_by ON shop_orders(ordered_by);
CREATE INDEX idx_shop_orders_engagement ON shop_orders(engagement_id);

CREATE TABLE shop_order_lines (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          UUID        NOT NULL REFERENCES shop_orders(id) ON DELETE CASCADE,
  tenant_id         UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id        UUID        REFERENCES shop_products(id) ON DELETE SET NULL,
  variant_id        UUID        REFERENCES shop_product_variants(id) ON DELETE SET NULL,
  product_name      TEXT        NOT NULL,
  variant_label     TEXT        NOT NULL,
  unit_price_minor  INT         NOT NULL CHECK (unit_price_minor > 0),
  quantity          INT         NOT NULL CHECK (quantity BETWEEN 1 AND 20),
  position          INT         NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE shop_order_lines IS
  'One item and size in a shop order. Name, size and price are copied at the time of the order.';
CREATE INDEX idx_shop_order_lines_order ON shop_order_lines(order_id, position);
CREATE INDEX idx_shop_order_lines_tenant ON shop_order_lines(tenant_id);
CREATE INDEX idx_shop_order_lines_product ON shop_order_lines(product_id);
CREATE INDEX idx_shop_order_lines_variant ON shop_order_lines(variant_id);

ALTER TABLE shop_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_order_lines ENABLE ROW LEVEL SECURITY;
-- Reads go through the functions below; only super admins read the tables directly.
CREATE POLICY shop_orders_super_admin ON shop_orders FOR ALL USING (is_super_admin());
CREATE POLICY shop_order_lines_super_admin ON shop_order_lines FOR ALL USING (is_super_admin());
GRANT ALL ON TABLE shop_orders, shop_order_lines TO service_role;

ALTER TABLE job_payment_requests ADD COLUMN shop_order_id UUID REFERENCES shop_orders(id) ON DELETE SET NULL;
COMMENT ON COLUMN job_payment_requests.shop_order_id IS
  'Set when this request pays for a studio shop order. Paying it marks the order paid.';
CREATE UNIQUE INDEX uq_job_payment_requests_open_shop_order ON job_payment_requests(shop_order_id)
  WHERE shop_order_id IS NOT NULL AND status IN ('pending', 'sent');
CREATE INDEX idx_job_payment_requests_shop_order ON job_payment_requests(shop_order_id)
  WHERE shop_order_id IS NOT NULL;

-- Give an order's held stock back (counted sizes only). Safe to call twice.
CREATE OR REPLACE FUNCTION private.shop_order_release_stock(p_order_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE shop_orders SET holds_stock = false WHERE id = p_order_id AND holds_stock;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  UPDATE shop_product_variants v
     SET stock = v.stock + l.qty
    FROM (SELECT variant_id, SUM(quantity)::INT AS qty FROM shop_order_lines
           WHERE order_id = p_order_id AND variant_id IS NOT NULL GROUP BY variant_id) l
   WHERE v.id = l.variant_id AND v.stock IS NOT NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION private.shop_order_release_stock(UUID) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Keep the order in step with its payment request.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION shop_orders_follow_request()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order shop_orders%ROWTYPE;
BEGIN
  IF NEW.shop_order_id IS NULL OR NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;
  SELECT * INTO v_order FROM shop_orders WHERE id = NEW.shop_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'paid' AND v_order.status = 'awaiting_payment' THEN
    UPDATE shop_orders SET status = 'paid', paid_at = COALESCE(NEW.paid_at, now()) WHERE id = v_order.id;
    INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, after_state)
    VALUES (v_order.tenant_id, NULL, 'shop_order.paid', 'shop_order', v_order.id,
            jsonb_build_object('job_payment_request_id', NEW.id, 'payment_id', NEW.payment_id));

  ELSIF NEW.status = 'cancelled' AND v_order.status = 'awaiting_payment' THEN
    UPDATE shop_orders SET status = 'cancelled', cancelled_at = now() WHERE id = v_order.id;
    PERFORM private.shop_order_release_stock(v_order.id);

  ELSIF NEW.status = 'refunded_manual' AND v_order.status <> 'cancelled' THEN
    IF v_order.status = 'collected' THEN
      -- Already collected: record the refund only; the items have left the studio.
      UPDATE shop_orders SET refunded_at = now() WHERE id = v_order.id;
    ELSE
      UPDATE shop_orders SET status = 'cancelled', cancelled_at = now(), refunded_at = now() WHERE id = v_order.id;
      PERFORM private.shop_order_release_stock(v_order.id);
    END IF;
    INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, after_state)
    VALUES (v_order.tenant_id, NULL, 'shop_order.refunded', 'shop_order', v_order.id,
            jsonb_build_object('job_payment_request_id', NEW.id));

  ELSIF NEW.status IN ('pending', 'sent') AND v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'job_payment_requests: a cancelled shop order cannot be reopened; the family places a new order';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION shop_orders_follow_request() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trigger_shop_orders_follow_request
  AFTER UPDATE OF status ON job_payment_requests
  FOR EACH ROW EXECUTE FUNCTION shop_orders_follow_request();

-- ---------------------------------------------------------------------------
-- Families: the items on sale (shown items only, with their sizes and stock).
-- Empty when the studio does not have the shop.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_shop_catalogue()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', p.id, 'name', p.name, 'description', p.description,
           'price_minor', p.price_minor, 'currency', p.currency, 'image_path', p.image_path,
           'variants', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', v.id, 'label', v.label, 'stock', v.stock)
                                                  ORDER BY v.position), '[]'::jsonb)
                          FROM shop_product_variants v WHERE v.product_id = p.id))
           ORDER BY p.position, p.created_at), '[]'::jsonb)
    FROM shop_products p
   WHERE p.tenant_id = get_my_tenant_id()
     AND p.active
     AND private.studio_shop_enabled(p.tenant_id);
$$;
REVOKE ALL ON FUNCTION get_shop_catalogue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_shop_catalogue() TO authenticated;

-- ---------------------------------------------------------------------------
-- Families: place an order.
--   p_lines:     [{"variant_id": "...", "quantity": 1}, ...]
--   p_person_id: who the items are for (me or someone in my family); default me.
-- Prices come from the items, never from the request. Returns the order and
-- the /pay/:token link token.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION place_shop_order(p_lines JSONB, p_person_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant_id  UUID := get_my_tenant_id();
  v_me         UUID := get_my_person_id();
  v_person     people%ROWTYPE;
  v_engagement UUID;
  v_order_id   UUID;
  v_total      BIGINT := 0;
  v_currency   TEXT;
  v_line       JSONB;
  v_qty        INT;
  v_variant    shop_product_variants%ROWTYPE;
  v_product    shop_products%ROWTYPE;
  v_n          INT := 0;
  v_label      TEXT;
  v_token      TEXT;
BEGIN
  IF v_tenant_id IS NULL OR v_me IS NULL THEN
    RAISE EXCEPTION 'place_shop_order: access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT private.studio_shop_enabled(v_tenant_id) THEN
    RAISE EXCEPTION 'place_shop_order: switched_off';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'place_shop_order: empty_cart';
  END IF;
  IF jsonb_array_length(p_lines) > 50 THEN
    RAISE EXCEPTION 'place_shop_order: too_many_items';
  END IF;

  SELECT * INTO v_person FROM people WHERE id = COALESCE(p_person_id, v_me) AND tenant_id = v_tenant_id;
  IF NOT FOUND OR NOT (
       v_person.id = v_me
       OR (v_person.account_id IS NOT NULL AND v_person.account_id IN (SELECT get_my_account_ids()))) THEN
    RAISE EXCEPTION 'place_shop_order: access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Payment requests need an engagement: the person's active enrolment, else the family's.
  SELECT e.id INTO v_engagement
    FROM engagements e JOIN people p ON p.id = e.person_id
   WHERE e.tenant_id = v_tenant_id AND e.status = 'active'
     AND (e.person_id = v_person.id OR (v_person.account_id IS NOT NULL AND p.account_id = v_person.account_id))
   ORDER BY (e.person_id = v_person.id) DESC, e.created_at DESC
   LIMIT 1;
  IF v_engagement IS NULL THEN
    RAISE EXCEPTION 'place_shop_order: needs_enrolment';
  END IF;

  INSERT INTO shop_orders (tenant_id, person_id, ordered_by, engagement_id, total_minor, currency)
  VALUES (v_tenant_id, v_person.id, v_me, v_engagement, 1, 'ILS')
  RETURNING id INTO v_order_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_n := v_n + 1;
    BEGIN
      v_qty := COALESCE((v_line->>'quantity')::INT, 1);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'place_shop_order: bad_quantity';
    END;
    IF v_qty < 1 OR v_qty > 20 THEN
      RAISE EXCEPTION 'place_shop_order: bad_quantity';
    END IF;
    BEGIN
      SELECT * INTO v_variant FROM shop_product_variants
       WHERE id = (v_line->>'variant_id')::UUID AND tenant_id = v_tenant_id FOR UPDATE;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'place_shop_order: item_not_found';
    END;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'place_shop_order: item_not_found';
    END IF;
    SELECT * INTO v_product FROM shop_products WHERE id = v_variant.product_id;
    IF NOT v_product.active THEN
      RAISE EXCEPTION 'place_shop_order: item_not_found';
    END IF;
    IF v_variant.stock IS NOT NULL THEN
      IF v_variant.stock < v_qty THEN
        RAISE EXCEPTION 'place_shop_order: sold_out %', v_variant.id;
      END IF;
      UPDATE shop_product_variants SET stock = stock - v_qty WHERE id = v_variant.id;
    END IF;
    IF v_currency IS NULL THEN
      v_currency := v_product.currency;
    ELSIF v_currency <> v_product.currency THEN
      RAISE EXCEPTION 'place_shop_order: mixed_currency';
    END IF;
    INSERT INTO shop_order_lines (order_id, tenant_id, product_id, variant_id, product_name, variant_label,
                                  unit_price_minor, quantity, position)
    VALUES (v_order_id, v_tenant_id, v_product.id, v_variant.id, v_product.name, v_variant.label,
            v_product.price_minor, v_qty, v_n);
    v_total := v_total + v_product.price_minor::BIGINT * v_qty;
  END LOOP;
  IF v_total > 2147483647 THEN
    RAISE EXCEPTION 'place_shop_order: total_too_large';
  END IF;

  UPDATE shop_orders SET total_minor = v_total::INT, currency = v_currency WHERE id = v_order_id;

  -- "Black leotard (Age 4-6) ×2, Tights (One size)" — what the pay page and receipts show.
  SELECT left(string_agg(product_name
                || CASE WHEN variant_label <> 'One size' THEN ' (' || variant_label || ')' ELSE '' END
                || CASE WHEN quantity > 1 THEN ' ×' || quantity ELSE '' END, ', ' ORDER BY position), 120)
    INTO v_label FROM shop_order_lines WHERE order_id = v_order_id;

  INSERT INTO job_payment_requests (tenant_id, engagement_id, label, amount_minor, currency, max_installments, shop_order_id)
  VALUES (v_tenant_id, v_engagement, v_label, v_total::INT, v_currency, 1, v_order_id)
  RETURNING public_token INTO v_token;

  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, after_state)
  VALUES (v_tenant_id, auth.uid(), 'shop_order.placed', 'shop_order', v_order_id,
          jsonb_build_object('person_id', v_person.id, 'total_minor', v_total, 'lines', jsonb_array_length(p_lines)));

  RETURN jsonb_build_object('order_id', v_order_id, 'status', 'awaiting_payment',
                            'total_minor', v_total, 'currency', v_currency, 'pay_token', v_token);
END;
$$;
REVOKE ALL ON FUNCTION place_shop_order(JSONB, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION place_shop_order(JSONB, UUID) TO authenticated;

-- Lines of an order as JSON, in order.
CREATE OR REPLACE FUNCTION private.shop_order_lines_json(p_order_id UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'product_name', l.product_name, 'variant_label', l.variant_label,
           'unit_price_minor', l.unit_price_minor, 'quantity', l.quantity,
           'image_path', p.image_path) ORDER BY l.position), '[]'::jsonb)
    FROM shop_order_lines l LEFT JOIN shop_products p ON p.id = l.product_id
   WHERE l.order_id = p_order_id;
$$;
REVOKE EXECUTE ON FUNCTION private.shop_order_lines_json(UUID) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Families: my family's orders (newest first), with the pay link while unpaid.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_my_shop_orders()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', o.id, 'person_id', o.person_id, 'person_name', p.name, 'status', o.status,
           'total_minor', o.total_minor, 'currency', o.currency, 'created_at', o.created_at,
           'paid_at', o.paid_at, 'ready_at', o.ready_at, 'collected_at', o.collected_at,
           'refunded', o.refunded_at IS NOT NULL,
           'pay_token', (SELECT r.public_token FROM job_payment_requests r
                          WHERE r.shop_order_id = o.id AND r.status IN ('pending', 'sent') LIMIT 1),
           'lines', private.shop_order_lines_json(o.id))
           ORDER BY o.created_at DESC), '[]'::jsonb)
    FROM shop_orders o JOIN people p ON p.id = o.person_id
   WHERE o.tenant_id = get_my_tenant_id()
     AND private.studio_shop_enabled(o.tenant_id)
     AND o.status <> 'cancelled'
     AND (o.person_id = get_my_person_id()
          OR o.ordered_by = get_my_person_id()
          OR (p.account_id IS NOT NULL AND p.account_id IN (SELECT get_my_account_ids())));
$$;
REVOKE ALL ON FUNCTION get_my_shop_orders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_my_shop_orders() TO authenticated;

-- ---------------------------------------------------------------------------
-- Studio: every order except old cancelled ones (newest first).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_studio_shop_orders()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant_id UUID := get_my_tenant_id();
BEGIN
  IF v_tenant_id IS NULL OR NOT photo_shop_is_admin(v_tenant_id) THEN
    RAISE EXCEPTION 'get_studio_shop_orders: access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'id', o.id, 'person_id', o.person_id, 'person_name', p.name,
             'ordered_by_name', ob.name, 'status', o.status,
             'total_minor', o.total_minor, 'currency', o.currency, 'created_at', o.created_at,
             'paid_at', o.paid_at, 'ready_at', o.ready_at, 'collected_at', o.collected_at,
             'cancelled_at', o.cancelled_at, 'refunded', o.refunded_at IS NOT NULL,
             'lines', private.shop_order_lines_json(o.id))
             ORDER BY o.created_at DESC), '[]'::jsonb)
      FROM shop_orders o
      JOIN people p ON p.id = o.person_id
      LEFT JOIN people ob ON ob.id = o.ordered_by
     WHERE o.tenant_id = v_tenant_id
       AND (o.status <> 'cancelled' OR o.cancelled_at > now() - interval '30 days')
  );
END;
$$;
REVOKE ALL ON FUNCTION get_studio_shop_orders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_studio_shop_orders() TO authenticated;

-- ---------------------------------------------------------------------------
-- Studio: move a paid order on: 'ready' (ready to collect) or 'collected'.
-- Returns the order's new status.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_shop_order_status(p_order_id UUID, p_status TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order shop_orders%ROWTYPE;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('ready', 'collected') THEN
    RAISE EXCEPTION 'set_shop_order_status: bad_status';
  END IF;
  SELECT * INTO v_order FROM shop_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR NOT photo_shop_is_admin(v_order.tenant_id) THEN
    RAISE EXCEPTION 'set_shop_order_status: not_found' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_status = 'ready' AND v_order.status = 'paid' THEN
    UPDATE shop_orders SET status = 'ready', ready_at = now() WHERE id = p_order_id;
  ELSIF p_status = 'collected' AND v_order.status IN ('paid', 'ready') THEN
    UPDATE shop_orders SET status = 'collected', collected_at = now() WHERE id = p_order_id;
  ELSIF p_status = v_order.status THEN
    RETURN v_order.status;
  ELSE
    RAISE EXCEPTION 'set_shop_order_status: order_is_%', v_order.status;
  END IF;
  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, after_state)
  VALUES (v_order.tenant_id, auth.uid(), 'shop_order.' || p_status, 'shop_order', p_order_id,
          jsonb_build_object('from', v_order.status));
  RETURN p_status;
END;
$$;
REVOKE ALL ON FUNCTION set_shop_order_status(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_shop_order_status(UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- Family or studio: cancel an order that is not paid yet. Its payment request is
-- cancelled, and the trigger gives the stock back.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cancel_shop_order(p_order_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order  shop_orders%ROWTYPE;
  v_person people%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM shop_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cancel_shop_order: not_found' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_person FROM people WHERE id = v_order.person_id;
  IF NOT (photo_shop_is_admin(v_order.tenant_id)
          OR (v_order.tenant_id = get_my_tenant_id() AND (
                v_order.person_id = get_my_person_id()
                OR v_order.ordered_by = get_my_person_id()
                OR (v_person.account_id IS NOT NULL AND v_person.account_id IN (SELECT get_my_account_ids()))))) THEN
    RAISE EXCEPTION 'cancel_shop_order: not_found' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_order.status = 'cancelled' THEN
    RETURN;
  END IF;
  IF v_order.status <> 'awaiting_payment' THEN
    RAISE EXCEPTION 'cancel_shop_order: already_paid';
  END IF;

  UPDATE job_payment_requests SET status = 'cancelled'
   WHERE shop_order_id = p_order_id AND status IN ('pending', 'sent');
  -- No open request left (should not happen): cancel the order directly.
  UPDATE shop_orders SET status = 'cancelled', cancelled_at = now()
   WHERE id = p_order_id AND status = 'awaiting_payment';
  PERFORM private.shop_order_release_stock(p_order_id);

  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, after_state)
  VALUES (v_order.tenant_id, auth.uid(), 'shop_order.cancelled', 'shop_order', p_order_id, '{}'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION cancel_shop_order(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cancel_shop_order(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Deleting an item that families have ordered hides it instead, so their
-- orders keep its picture. Returns the picture's path only when the item was
-- really deleted (the caller removes it from storage).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION delete_shop_product(p_product_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row shop_products%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM shop_products WHERE id = p_product_id;
  IF NOT FOUND OR NOT photo_shop_is_admin(v_row.tenant_id) THEN
    RAISE EXCEPTION 'delete_shop_product: not_found' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF EXISTS (SELECT 1 FROM shop_order_lines WHERE product_id = p_product_id) THEN
    UPDATE shop_products SET active = false WHERE id = p_product_id;
    INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, after_state)
    VALUES (v_row.tenant_id, auth.uid(), 'shop_product.hidden', 'shop_product', p_product_id,
            jsonb_build_object('name', v_row.name, 'reason', 'ordered'));
    RETURN NULL;
  END IF;
  DELETE FROM shop_products WHERE id = p_product_id;
  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, after_state)
  VALUES (v_row.tenant_id, auth.uid(), 'shop_product.deleted', 'shop_product', p_product_id,
          jsonb_build_object('name', v_row.name));
  RETURN v_row.image_path;
END;
$$;
REVOKE ALL ON FUNCTION delete_shop_product(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION delete_shop_product(UUID) TO authenticated;
