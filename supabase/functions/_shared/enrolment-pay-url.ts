import { signWaiverToken } from "./waiver-token.ts";

const DEFAULT_LINK_TTL_SECONDS = 7 * 24 * 3600;

export async function buildEnrolmentPayUrl(input: {
  appBaseUrl: string;
  engagementId: string;
  tenantId: string;
  recipientEmail: string;
  linkTtlSeconds?: number;
}): Promise<{ paymentUrl: string; linkExpiresAt: Date }> {
  const ttl = input.linkTtlSeconds ?? DEFAULT_LINK_TTL_SECONDS;
  const expireAt = Math.floor(Date.now() / 1000) + ttl;
  const linkExpiresAt = new Date(expireAt * 1000);

  const wt = await signWaiverToken({
    eid: input.engagementId,
    tid: input.tenantId,
    em: input.recipientEmail,
    exp: expireAt,
  });

  const base = input.appBaseUrl.replace(/\/$/, "");
  const paymentUrl =
    `${base}/enrol/pay/${encodeURIComponent(input.engagementId)}?t=${encodeURIComponent(wt)}`;

  return { paymentUrl, linkExpiresAt };
}
