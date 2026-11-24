-- Emails to a client go out in one language: the one they use OpalSwift in.
-- Owner ask (24 Nov 2026): save the language the client's browser was in when they
-- booked, and send every email to that client in that language only.
--
-- people.language: set when the client books, enrols, orders in the shop (the web app
-- sends its current language). leads.language: the language a visitor sent a studio's
-- form in, used until they become a client. A signed-in client's own choice
-- (user_profiles.language) still comes first; NULL everywhere means the studio's default.

ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS language TEXT CHECK (language IN ('he', 'en'));

COMMENT ON COLUMN public.people.language IS
  'Language the client last used OpalSwift in (set at booking, enrolment, shop order). Emails to them use it. NULL = their login''s language, else the studio default.';

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS language TEXT CHECK (language IN ('he', 'en'));

COMMENT ON COLUMN public.leads.language IS
  'Language the visitor sent the studio''s form in. Emails to them use it until they become a client.';
