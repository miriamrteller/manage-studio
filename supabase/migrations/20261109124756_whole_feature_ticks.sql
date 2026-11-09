-- =============================================================================
-- 20261109124756: Platform -> Features shows one tick per whole feature (owner,
-- 9 Nov 2026). The business ticks (classes, families, monthly plans, projects,
-- online booking) ARE the studio's "Your business" answers, set with
-- set_business_profile(). So the per-key overrides on the keys those ticks
-- cover no longer have a switch anywhere, and would make a tick disagree with
-- what the studio sees. They are cleared here, so each of those keys follows
-- the studio's answer again.
--
-- Not touched: Google Calendar, photo shop and Takbull testing (their own ticks,
-- still per-key overrides); studio opt-outs (the studio's own choice); and every
-- other key (core or not built). Nothing is deleted from feature_definitions.
--
-- DATA ONLY. Idempotent.
-- =============================================================================

INSERT INTO audit_log (tenant_id, actor_id, action, entity_type, entity_id, before_state, after_state)
SELECT tfo.tenant_id, NULL, 'DELETE', 'feature_override', tfo.tenant_id,
       jsonb_build_object('feature_key', tfo.feature_key, 'is_enabled', tfo.is_enabled, 'note', tfo.note),
       jsonb_build_object('feature_key', tfo.feature_key, 'reason', 'whole_feature_ticks')
FROM   tenant_feature_overrides tfo
WHERE  tfo.feature_key IN (
  'offerings:structure.configure', 'offerings:booking.public', 'scheduling:calendar.view',
  'people:families.manage',
  'billing:recurring.enabled', 'billing:dunning.enabled',
  'billing:quotes.generate', 'billing:delivery.gated', 'media:gallery.gated',
  'scheduling:booking.client', 'scheduling:booking.admin', 'scheduling:penalties.capture'
);

DELETE FROM tenant_feature_overrides
WHERE  feature_key IN (
  'offerings:structure.configure', 'offerings:booking.public', 'scheduling:calendar.view',
  'people:families.manage',
  'billing:recurring.enabled', 'billing:dunning.enabled',
  'billing:quotes.generate', 'billing:delivery.gated', 'media:gallery.gated',
  'scheduling:booking.client', 'scheduling:booking.admin', 'scheduling:penalties.capture'
);
