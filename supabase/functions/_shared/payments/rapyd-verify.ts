/**
 * rapyd-verify.ts — standalone Rapyd webhook signature verifier.
 *
 * Extracted from RapydAdapter to satisfy the Adapter Mandate:
 * rapyd-webhook/index.ts must remain provider-agnostic and must not import
 * concrete adapter classes. This utility performs the HMAC verification
 * without any adapter dependency.
 *
 * Rapyd signature scheme (docs.rapyd.net → Authentication):
 *   toSign    = access_key + http_method + url_path + salt + timestamp + body
 *   signature = Base64( HMAC-SHA256( secret_key, toSign ) )
 *
 * http_method is always lowercase; for webhooks it is 'post'.
 */

/**
 * Verify a Rapyd webhook HMAC-SHA256 signature.
 *
 * @param accessKey  Rapyd access_key for this tenant (non-sensitive, from header)
 * @param secretKey  Resolved secret key from vault (sensitive, resolved by caller)
 * @param urlPath    The canonical URL path, e.g. '/functions/v1/rapyd-webhook'
 * @param salt       Value of the `salt` request header sent by Rapyd
 * @param timestamp  Value of the `timestamp` request header sent by Rapyd
 * @param body       Raw request body string (before JSON.parse)
 * @param expected   Value of the `signature` request header sent by Rapyd
 * @returns          true if computed signature matches expected, false otherwise
 */
export async function verifyRapydWebhookSignature(
  accessKey: string,
  secretKey: string,
  urlPath:   string,
  salt:      string,
  timestamp: string,
  body:      string,
  expected:  string,
): Promise<boolean> {
  try {
    const toSign  = accessKey + 'post' + urlPath + salt + timestamp + body;
    const keyData = new TextEncoder().encode(secretKey);
    const msgData = new TextEncoder().encode(toSign);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );

    const sigBuf   = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
    const computed = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));

    return computed === expected;
  } catch {
    return false;
  }
}
