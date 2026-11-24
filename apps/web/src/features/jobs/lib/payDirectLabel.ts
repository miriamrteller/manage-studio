import type { TFunction } from 'i18next';
import { joinWithOr, type PayDirectMethod } from '../services/clientPhotoShopService';

const P = 'pages.client_portal.photo_shop';

/** "by Bit" / "בביט" for one way. */
export function payByText(t: TFunction, method: PayDirectMethod): string {
  return t(`${P}.by_${method}`);
}

/** "Pay by Bit, by bank transfer or in cash" (he: "תשלום בביט, בהעברה בנקאית או במזומן"). */
export function payWaysLabel(t: TFunction, methods: PayDirectMethod[]): string {
  return t(`${P}.pay_ways`, { ways: joinWithOr(methods.map((m) => payByText(t, m)), t(`${P}.or`)) });
}
