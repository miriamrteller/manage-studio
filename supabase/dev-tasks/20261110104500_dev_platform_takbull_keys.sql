-- DEV ONLY (run by the dev-task workflow on the dev project, never on prod).
--
-- Platform billing step B1 (docs/plans/TAKBULL-INTEGRATION.md): on dev, OpalSwift's own Takbull
-- account is the Takbull sandbox account. The owner's sandbox keys are already saved on dev,
-- encrypted, under one studio (not lensstudio). This copies that encrypted key and secret, as
-- they are, into platform_billing_settings (same database, same encryption key, so nothing is
-- decrypted or printed). Charging stays off.
-- Copies only when exactly one studio other than lensstudio has keys (lensstudio may hold a
-- copy of the same keys). Expected: a count of 1, then UPDATE 1.
SELECT count(*) AS other_studios_with_keys FROM tenants
WHERE subdomain <> 'lensstudio' AND takbull_api_key_enc IS NOT NULL AND takbull_api_secret_enc IS NOT NULL;

WITH src AS (
  SELECT takbull_api_key_enc, takbull_api_secret_enc FROM tenants
  WHERE subdomain <> 'lensstudio' AND takbull_api_key_enc IS NOT NULL AND takbull_api_secret_enc IS NOT NULL
)
UPDATE platform_billing_settings s SET
  takbull_api_key_enc            = src.takbull_api_key_enc,
  takbull_api_secret_enc         = src.takbull_api_secret_enc,
  takbull_credentials_updated_at = now(),
  updated_at                     = now()
FROM src
WHERE s.id AND (SELECT count(*) FROM src) = 1;
