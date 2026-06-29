import type { ComponentProps } from 'react';
import { GrowPaymentShell } from './GrowPaymentShell';

/** iCount hosted CC page checkout — same poll-until-finalised UX as Grow. */
export function IcountPaymentShell(props: ComponentProps<typeof GrowPaymentShell>) {
  return <GrowPaymentShell {...props} provider="icount" />;
}
