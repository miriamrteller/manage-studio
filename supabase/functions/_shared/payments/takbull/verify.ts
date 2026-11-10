import type { TakbullApi } from "./client.ts";

export interface TakbullConnectionCheck {
  valid: boolean;
  message?: string;
  /** The studio's default document type in Takbull, when the keys work (shown in Settings). */
  defaultDocumentType?: number;
}

/** Pure over the API: the keys work when Takbull answers the read-only settings call. */
export async function verifyTakbullConnection(api: TakbullApi): Promise<TakbullConnectionCheck> {
  try {
    const settings = await api.getDocumentSettings({ lang: "he" });
    const docType = settings.DefaultDocumentType ?? settings.defaultDocumentType;
    return {
      valid: true,
      ...(typeof docType === "number" ? { defaultDocumentType: docType } : {}),
    };
  } catch (err) {
    return { valid: false, message: err instanceof Error ? err.message : "Takbull check failed" };
  }
}
