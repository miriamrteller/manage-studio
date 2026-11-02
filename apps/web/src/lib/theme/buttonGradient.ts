/**
 * Primary call-to-action gradient, derived from a studio's own colours.
 *
 * Runs from the button fill to a slightly deeper, shifted shade: the fill
 * mixed 25% toward an anchor (OpalSwift: its purple; a studio: its own
 * accent). The end shade is pushed until the button text (`onFill`) keeps
 * WCAG AA on it, so the label is readable across the whole gradient, and the
 * hover/pressed ends move away from the text colour so contrast only grows.
 * "Solid" chrome uses no gradient (flat fill).
 */
import { AA, BLACK, WHITE, mix, pushUntilContrast } from './color';

/** Share of the anchor mixed into the end of the gradient ("low strength"). */
export const GRADIENT_SHIFT = 0.25;

export interface ButtonGradient {
  '--color-primary-fill-end': string;
  '--color-primary-fill-end-hover': string;
  '--gradient-primary': string;
  '--gradient-primary-hover': string;
}

export function deriveButtonGradient(
  fill: string,
  onFill: string,
  anchor: string,
  flat = false,
): ButtonGradient {
  const awayFromText = onFill === WHITE ? BLACK : WHITE;
  const end = pushUntilContrast(mix(fill, anchor, 1 - GRADIENT_SHIFT), [onFill], awayFromText, AA);
  const endHover = mix(end, awayFromText, 0.91);
  const fillHover = mix(fill, awayFromText, 0.91);
  return {
    '--color-primary-fill-end': end,
    '--color-primary-fill-end-hover': endHover,
    '--gradient-primary': flat ? 'none' : `linear-gradient(135deg, ${fill}, ${end})`,
    '--gradient-primary-hover': flat ? 'none' : `linear-gradient(135deg, ${fillHover}, ${endHover})`,
  };
}
