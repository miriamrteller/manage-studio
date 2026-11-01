/**
 * OpalSwift brand colours for screens with no studio (app.opalswift.com, "Studio not found"),
 * from the logo gradient (teal → blue → purple).
 *
 * `#5B6CFF` with white text is only 4.2:1, below WCAG AA (4.5:1), so text and buttons use
 * `ink` (#4A58E8, 5.4:1 against white either way round). The light tones are decorative.
 */
export const OPALSWIFT_BRAND = {
  primary: '#5B6CFF',
  accent: '#21D1C2',
  purple: '#9333D6',
  ink: '#4A58E8',
  gradient: 'linear-gradient(90deg, #21D1C2 0%, #5B6CFF 50%, #9333D6 100%)',
} as const;
