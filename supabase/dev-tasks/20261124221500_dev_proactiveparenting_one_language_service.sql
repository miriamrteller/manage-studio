-- DEV ONLY (run by the dev-task workflow on the dev project, never on prod).
--
-- ProactiveParenting dev studio: its one session was named in both languages at once
-- ("Parent coaching session / פגישת הדרכת הורים"), so every email showed both. Owner ask
-- (24 Nov 2026): each email in one language only. A studio names its service once, in its
-- own language; this studio's language is Hebrew.
--
-- Idempotent: safe to re-run.
UPDATE offerings
   SET name = 'פגישת הדרכת הורים',
       updated_at = now()
 WHERE id = '60000000-0000-0000-0000-000000000301'::uuid
   AND name = 'Parent coaching session / פגישת הדרכת הורים';
