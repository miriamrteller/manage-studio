-- Owner rule: forms (waivers, health declarations, contracts) are off by default
-- and only on when a studio switches them on for a class. Existing classes keep
-- their current setting. Even when on, a form never blocks payment: it is signed
-- after paying (prepare-enrolment-checkout, send-waiver-reminder).
ALTER TABLE public.offerings ALTER COLUMN waiver_required SET DEFAULT false;
