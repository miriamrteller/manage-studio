import type { ComponentProps } from 'react';
import { GrowPaymentShell } from './GrowPaymentShell';

/** Invoice4U hosted-page checkout — same poll UX as Grow/iCount. */
export function Invoice4uPaymentShell(props: ComponentProps<typeof GrowPaymentShell>) {
  return <GrowPaymentShell {...props} provider="invoice4u" />;
}
