import type { GalleryPhoto } from "./gallery.ts";

export type OrderItemsResult =
  | { ok: true; items: { image_key: string; file_name: string }[] }
  | { ok: false; error: "no_photos" | "not_in_gallery" | "already_bought" | "too_many_photos" };

const MAX_PHOTOS = 10000;

/**
 * What the client may order: only photos in the shoot's gallery, never one
 * already bought (or waiting for payment), each once. With `allPhotos`, every
 * photo not bought yet — whatever was picked. File names come from the
 * gallery, never from the client.
 */
export function resolveOrderItems(
  gallery: GalleryPhoto[],
  requestedKeys: unknown,
  takenKeys: string[],
  allPhotos: boolean,
): OrderItemsResult {
  const taken = new Set(takenKeys);
  const byKey = new Map(gallery.map((p) => [p.key, p]));

  let keys: string[];
  if (allPhotos) {
    keys = gallery.map((p) => p.key).filter((k) => !taken.has(k));
  } else {
    if (!Array.isArray(requestedKeys)) return { ok: false, error: "no_photos" };
    if (requestedKeys.length > MAX_PHOTOS) return { ok: false, error: "too_many_photos" };
    keys = [...new Set(requestedKeys.filter((k): k is string => typeof k === "string"))];
    if (keys.some((k) => !byKey.has(k))) return { ok: false, error: "not_in_gallery" };
    if (keys.some((k) => taken.has(k))) return { ok: false, error: "already_bought" };
  }
  if (keys.length === 0) return { ok: false, error: "no_photos" };

  // Gallery order, so free photos are the first ones the client sees.
  const wanted = new Set(keys);
  const items = gallery
    .filter((p) => wanted.has(p.key))
    .map((p) => ({ image_key: p.key, file_name: p.fileName }));
  return { ok: true, items };
}

/** "Photos (3)" in the studio's language: the payment request's label on the receipt and in Finance. */
export function photoOrderLabel(count: number, language: "he" | "en"): string {
  return language === "he" ? `תמונות (${count})` : `Photos (${count})`;
}

/**
 * The person an order is placed for: the caller's own record, or else the shoot's client.
 * Only called after get_client_photo_shop (run as the caller) has allowed this shoot.
 */
export async function orderPersonId(
  // deno-lint-ignore no-explicit-any
  caller: { rpc: (fn: string) => PromiseLike<{ data: any }> },
  // deno-lint-ignore no-explicit-any
  service: { from: (t: string) => any },
  engagementId: string,
): Promise<string | null> {
  const { data: mine } = await caller.rpc("get_my_person_id");
  if (typeof mine === "string" && mine) return mine;
  const { data: shoot } = await service.from("engagements").select("person_id").eq("id", engagementId).maybeSingle();
  return typeof shoot?.person_id === "string" ? shoot.person_id : null;
}
