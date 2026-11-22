-- =============================================================================
-- 22 Nov 2026 (owner): the studio picks which ways clients may pay it directly in the
-- photo shop, each with its own details (Settings > Payment > Photo shop). Card stays
-- its own switch (card_payments).
--
-- tenant_photo_shop_settings:
--   accepts_bit    + bit_phone            the phone clients send Bit to (typed by the studio;
--                                         the form starts from the business phone).
--   accepts_bank   + bank_details         account name, bank, branch, account number (free text).
--   accepts_cash   + cash_instructions    optional, e.g. "Pay at the studio".
--   accepts_cheque + cheque_instructions  optional, e.g. who the cheque is made out to.
-- After the gallery the client opens the order's payment page and picks one of the ways
-- that are on. Bit and bank transfer then ask for a payment screenshot; cash and cheque
-- just confirm. None on: the standard "Pay the studio directly (cash, bank transfer or
-- other)" wording stays.
--
-- Wording only: orders work exactly as "Pay the studio directly" orders do, and nothing
-- here can stop a client ordering. Plain text; the page and email escape it.
--
-- ADDITIVE. DEPENDENCIES: 20261119172820_import_fills_missing_emails_shop_card_switch.sql
-- =============================================================================

ALTER TABLE tenant_photo_shop_settings
  ADD COLUMN IF NOT EXISTS accepts_bit         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bit_phone           TEXT,
  ADD COLUMN IF NOT EXISTS accepts_bank        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bank_details        TEXT,
  ADD COLUMN IF NOT EXISTS accepts_cash        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cash_instructions   TEXT,
  ADD COLUMN IF NOT EXISTS accepts_cheque      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cheque_instructions TEXT;

ALTER TABLE tenant_photo_shop_settings
  DROP CONSTRAINT IF EXISTS tenant_photo_shop_settings_bit_phone_check,
  ADD CONSTRAINT tenant_photo_shop_settings_bit_phone_check
    CHECK (bit_phone IS NULL OR (char_length(bit_phone) <= 30 AND bit_phone ~ '^[0-9+() -]*$')),
  DROP CONSTRAINT IF EXISTS tenant_photo_shop_settings_pay_text_check,
  ADD CONSTRAINT tenant_photo_shop_settings_pay_text_check
    CHECK (COALESCE(char_length(bank_details), 0) <= 500
       AND COALESCE(char_length(cash_instructions), 0) <= 500
       AND COALESCE(char_length(cheque_instructions), 0) <= 500);

COMMENT ON COLUMN tenant_photo_shop_settings.accepts_bit IS
  'Photo shop: clients may pay the studio by Bit to bit_phone (shown only with a phone). Asks for a payment screenshot.';
COMMENT ON COLUMN tenant_photo_shop_settings.bit_phone IS
  'Photo shop: the phone number clients send Bit payments to. Typed by the studio. Digits, spaces, + - ( ) only.';
COMMENT ON COLUMN tenant_photo_shop_settings.accepts_bank IS
  'Photo shop: clients may pay by bank transfer to bank_details (shown only with details). Asks for a payment screenshot.';
COMMENT ON COLUMN tenant_photo_shop_settings.bank_details IS
  'Photo shop: bank transfer details the studio writes for clients (plain text, up to 500 characters).';
COMMENT ON COLUMN tenant_photo_shop_settings.accepts_cash IS
  'Photo shop: clients may pay the studio in cash; cash_instructions (optional) say how.';
COMMENT ON COLUMN tenant_photo_shop_settings.accepts_cheque IS
  'Photo shop: clients may pay the studio by cheque; cheque_instructions (optional) say how.';
