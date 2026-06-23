-- Supabase installs pgcrypto in the extensions schema. Credential RPCs use SECURITY DEFINER
-- with search_path = public only, so pgp_sym_encrypt/pgp_sym_decrypt are not visible (42883).

ALTER FUNCTION get_app_encryption_key() SET search_path = private, public, extensions;

ALTER FUNCTION get_tenant_payment_credentials(UUID) SET search_path = public, extensions;
ALTER FUNCTION save_tenant_payment_credentials(TEXT, TEXT, TEXT) SET search_path = public, extensions;

ALTER FUNCTION get_tenant_invoicing_credentials(UUID) SET search_path = public, extensions;
ALTER FUNCTION save_tenant_invoicing_credentials(TEXT, TEXT, TEXT) SET search_path = public, extensions;

ALTER FUNCTION save_tenant_grow_credentials(TEXT, TEXT, TEXT) SET search_path = public, extensions;
