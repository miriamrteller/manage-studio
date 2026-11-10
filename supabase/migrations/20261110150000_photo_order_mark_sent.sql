-- Photo shop: "Mark as sent". The photographer edits the bought photos and may send them
-- another way (their own email, WeTransfer, etc.), then mark the paid order as sent
-- without pasting a link; OpalSwift sends no email. The client's "My shoots" shows "Sent".

-- A delivered order no longer needs a link (it may have been sent another way).
DO $$
DECLARE v_name TEXT;
BEGIN
  SELECT conname INTO v_name
    FROM pg_constraint
   WHERE conrelid = 'job_photo_orders'::regclass AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%delivered%delivery_url%';
  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE job_photo_orders DROP CONSTRAINT %I', v_name);
  END IF;
END $$;
ALTER TABLE job_photo_orders
  ADD CONSTRAINT job_photo_orders_delivered_at CHECK (status <> 'delivered' OR delivered_at IS NOT NULL);

CREATE OR REPLACE FUNCTION mark_job_photo_order_sent(p_order_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order job_photo_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM job_photo_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'mark_job_photo_order_sent: order not found';
  END IF;
  IF NOT photo_shop_is_admin(v_order.tenant_id) THEN
    RAISE EXCEPTION 'mark_job_photo_order_sent: access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_order.status <> 'paid' THEN
    RAISE EXCEPTION 'mark_job_photo_order_sent: order is %', v_order.status;
  END IF;

  UPDATE job_photo_orders
     SET status = 'delivered', delivered_at = now()
   WHERE id = p_order_id;

  INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, after_state)
  VALUES (v_order.tenant_id, auth.uid(), 'job_photo_order.marked_sent', 'engagement', v_order.engagement_id,
          jsonb_build_object('order_id', p_order_id));

  RETURN (SELECT to_jsonb(o) FROM job_photo_orders o WHERE o.id = p_order_id);
END;
$$;
REVOKE ALL ON FUNCTION mark_job_photo_order_sent(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION mark_job_photo_order_sent(UUID) TO authenticated;
