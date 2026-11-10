// OpalSwift's own icon set for the marketing site ("Opal gem" style).
// Drawn on a 24×24 grid. Edit here, then run `npm run build:icons`.
//
// Each icon is a list of layers, drawn in order:
//   f:  solid shape in the icon colour (opal gradient by default)
//   s:  line in the icon colour
//   d:  line in the detail colour (white by default)
//   df: solid shape in the detail colour
// Pages can change the colours with the CSS variables --icon-fill and --icon-detail.
// No people in any icon (owner rule).

const GEM = (cx, cy, s = 1) =>
  `<path d="M${cx} ${cy - 2.6 * s}l${2.4 * s} ${2.4 * s}-${2.4 * s} ${2.9 * s}-${2.4 * s}-${2.9 * s}z"/>`;

const FILE = '<path d="M6.5 2h8L20 7.5v12a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>';
const BUBBLE = '<path d="M5.5 3h13A2.5 2.5 0 0 1 21 5.5v9a2.5 2.5 0 0 1-2.5 2.5H8.5L3 21.5v-16A2.5 2.5 0 0 1 5.5 3z"/>';
const WRENCH = '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z"/>';
const ZAP = '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>';

export const ICONS = {
  activity: ['s:<path d="M2 12h4l3-8 6 16 3-8h4"/>'],
  alert: [
    'f:<path d="M10.3 3.4a2 2 0 0 1 3.4 0l8.4 14.6A2 2 0 0 1 20.4 21H3.6a2 2 0 0 1-1.7-3z"/>',
    'd:<path d="M12 9v4.5"/>',
    'df:<circle cx="12" cy="17" r="1.1"/>',
  ],
  bell: [
    'f:<path d="M4 17.5c1.6-1.6 2.5-3.3 2.5-7.5a5.5 5.5 0 0 1 11 0c0 4.2.9 5.9 2.5 7.5z"/>',
    's:<path d="M10 20.5a2.2 2.2 0 0 0 4 0M12 2.5V4"/>',
  ],
  book: [
    'f:<path d="M2 4.5A1.5 1.5 0 0 1 3.5 3H8a4 4 0 0 1 3.2 1.6V21a3.5 3.5 0 0 0-3-1.7H3.5A1.5 1.5 0 0 1 2 17.8z"/><path d="M22 4.5A1.5 1.5 0 0 0 20.5 3H16a4 4 0 0 0-3.2 1.6V21a3.5 3.5 0 0 1 3-1.7h4.7a1.5 1.5 0 0 0 1.5-1.5z"/>',
    'd:<path d="M5 8h3.5M5 11.5h3.5M15.5 8H19M15.5 11.5H19"/>',
  ],
  box: [
    'f:<path d="M11 2.3a2 2 0 0 1 2 0l7 4A2 2 0 0 1 21 8v8a2 2 0 0 1-1 1.7l-7 4a2 2 0 0 1-2 0l-7-4A2 2 0 0 1 3 16V8a2 2 0 0 1 1-1.7z"/>',
    'd:<path d="M3.6 7.2 12 12l8.4-4.8M12 12v9.5"/>',
  ],
  briefcase: [
    's:<path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7"/>',
    'f:<rect x="2" y="7" width="20" height="13.5" rx="3"/>',
    'd:<path d="M2.5 12.5h19M12 11v3"/>',
  ],
  brush: [
    'f:<path d="M10 12.5 18.6 3.9a2.1 2.1 0 0 1 3 3L13 15.5z"/><path d="M8 14a3.5 3.5 0 0 1 3.5 3.5C11.5 20 9.5 22 6 22H2.5c1.2-1 1.5-2 1.5-4A4 4 0 0 1 8 14z"/>',
  ],
  building: [
    'f:<rect x="4" y="2" width="16" height="20" rx="2.5"/>',
    'd:<path d="M8.5 6.5h1M14.5 6.5h1M8.5 10.5h1M14.5 10.5h1M8.5 14.5h1M14.5 14.5h1M10 21.5V18.5h4v3"/>',
  ],
  cake: [
    's:<path d="M8 7.5V10M12 7.5V10M16 7.5V10"/>',
    'f:<circle cx="8" cy="4.6" r="1.4"/><circle cx="12" cy="4.6" r="1.4"/><circle cx="16" cy="4.6" r="1.4"/><rect x="3" y="10.5" width="18" height="11" rx="2.5"/>',
    'd:<path d="M3.5 15.5c1.5 0 2-1.5 4.2-1.5s2.6 1.5 4.3 1.5 2.1-1.5 4.3-1.5 2.7 1.5 4.2 1.5"/>',
  ],
  calendar: [
    's:<path d="M8 2.5v4M16 2.5v4"/>',
    'f:<rect x="3" y="4.5" width="18" height="17" rx="3.5"/>',
    `d:<path d="M3.5 9.5h17"/>${GEM(12, 15)}`,
  ],
  camera: [
    'f:<path d="M7.5 7.5 9.3 4.6A1.5 1.5 0 0 1 10.6 4h2.8a1.5 1.5 0 0 1 1.3.6l1.8 2.9H19a3 3 0 0 1 3 3V17a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3v-6.5a3 3 0 0 1 3-3z"/>',
    'd:<circle cx="12" cy="13.5" r="3.6"/>',
    'df:<circle cx="18.3" cy="10.6" r=".9"/>',
  ],
  car: [
    'f:<path d="M4.5 10.5 6.3 6a2 2 0 0 1 1.9-1.3h7.6a2 2 0 0 1 1.9 1.3l1.8 4.5A2.5 2.5 0 0 1 21.5 13v4H2.5v-4a2.5 2.5 0 0 1 2-2.5z"/><circle cx="7" cy="18" r="2.4"/><circle cx="17" cy="18" r="2.4"/>',
    'd:<path d="M6.8 10.5h10.4"/>',
    'df:<circle cx="6.3" cy="13.8" r="1"/><circle cx="17.7" cy="13.8" r="1"/>',
  ],
  card: [
    'f:<rect x="2" y="5" width="20" height="14" rx="3"/>',
    `d:<path d="M2.5 9.5h19M6 14.5h4"/>${GEM(17, 14.5, 0.8)}`,
  ],
  chart: [
    'f:<rect x="3.5" y="13" width="4.5" height="7" rx="1.5"/><rect x="9.75" y="8.5" width="4.5" height="11.5" rx="1.5"/><rect x="16" y="4" width="4.5" height="16" rx="1.5"/>',
    's:<path d="M2.5 22h19"/>',
  ],
  check: [
    'f:<circle cx="12" cy="12" r="10"/>',
    'd:<path d="m7.8 12.3 2.9 2.9 5.5-5.6"/>',
  ],
  clipboard: [
    'f:<rect x="4" y="3.5" width="16" height="18.5" rx="3"/><rect x="8" y="1.8" width="8" height="4" rx="1.5"/>',
    'd:<path d="M9 6.3h6M8 11h8M8 15h8M8 19h5"/>',
  ],
  clock: [
    'f:<circle cx="12" cy="12" r="10"/>',
    'd:<path d="M12 6.5V12l3.5 2"/>',
  ],
  contacts: [
    's:<path d="M2.5 7H5M2.5 12H5M2.5 17H5"/>',
    'f:<rect x="5" y="2" width="15" height="20" rx="3"/>',
    'd:<path d="M9 7.5h7M9 11.5h7M9 15.5h4.5"/>',
  ],
  dumbbell: [
    'f:<rect x="1.5" y="9" width="3" height="6" rx="1.2"/><rect x="4" y="5.5" width="4.5" height="13" rx="1.6"/><rect x="15.5" y="5.5" width="4.5" height="13" rx="1.6"/><rect x="19.5" y="9" width="3" height="6" rx="1.2"/><rect x="8" y="10.6" width="8" height="2.8" rx=".6"/>',
  ],
  feather: [
    's:<path d="M3 21.5 6.5 18"/>',
    'f:<path d="M20.2 3.8c-3.7-1.9-9.3-.4-12.4 3.9C5.6 10.8 5 14.6 5 19h4.6c4.6 0 8.5-1.6 10.4-5.3C21.7 10.4 21.8 6.6 20.2 3.8z"/>',
    'd:<path d="M16 8.2 6.8 17.4M10.2 14h6"/>',
  ],
  file: [`f:${FILE}`, 'd:<path d="M14.5 2.5v5h5M8 12.5h8M8 16.5h8M8 8.5h3"/>'],
  filecheck: [`f:${FILE}`, 'd:<path d="M14.5 2.5v5h5M8.5 15l2.3 2.3 4.7-4.8"/>'],
  flask: [
    's:<path d="M7.5 2.5h9"/>',
    'f:<path d="M9 2.5h6v6.3l5.4 9.6A2.4 2.4 0 0 1 18.3 22H5.7a2.4 2.4 0 0 1-2.1-3.6L9 8.8z"/>',
    'd:<path d="M6.5 15h11"/>',
    'df:<circle cx="10.5" cy="18.3" r=".9"/><circle cx="14" cy="17.8" r=".7"/>',
  ],
  flower: [
    's:<path d="M12 12v10M12 18.5c-1.5-2.2-4-2.8-6-2M12 16.5c1.5-2.2 4-2.8 6-2"/>',
    'f:<circle cx="12" cy="4.6" r="2.7"/><circle cx="15.4" cy="8" r="2.7"/><circle cx="12" cy="11.4" r="2.7"/><circle cx="8.6" cy="8" r="2.7"/>',
    'df:<circle cx="12" cy="8" r="1.6"/>',
  ],
  globe: [
    'f:<circle cx="12" cy="12" r="10"/>',
    'd:<path d="M2.5 12h19M12 2.3c2.6 2.7 3.8 6 3.8 9.7s-1.2 7-3.8 9.7M12 2.3C9.4 5 8.2 8.3 8.2 12s1.2 7 3.8 9.7"/>',
  ],
  grad: [
    'f:<path d="M12 3.5 23 9l-11 5.5L1 9z"/><path d="M5.5 12v4.5c3.5 3.2 9.5 3.2 13 0V12L12 15.3z"/>',
    's:<path d="M21.5 10v5.5"/>',
    'd:<path d="M5.5 12.2 12 15.4l6.5-3.2"/>',
  ],
  hammer: [
    's:<path d="M12.8 11.2 4.2 19.8"/>',
    'f:<path d="M19.9 11.2 16.8 14.3 9.7 7.2 12.8 4.1z"/>',
    'sw:<path d="M19.9 11.2 16.8 14.3 9.7 7.2 12.8 4.1z"/>',
  ],
  heart: [
    'f:<path d="M12 20.5C6.5 17 2.5 13.4 2.5 8.8A4.8 4.8 0 0 1 7.3 4c1.9 0 3.5 1 4.7 2.6C13.2 5 14.8 4 16.7 4a4.8 4.8 0 0 1 4.8 4.8c0 4.6-4 8.2-9.5 11.7z"/>',
  ],
  home: [
    'f:<path d="M3 10.3 12 3l9 7.3v9.2a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 19.5z"/>',
    'd:<path d="M9.5 21.5v-5a2.5 2.5 0 0 1 5 0v5"/>',
  ],
  idcard: [
    'f:<rect x="2" y="4.5" width="20" height="15" rx="3"/>',
    'd:<path d="M6 10h5M6 14h3.5M14 10h4M14 14h4"/>',
  ],
  landmark: [
    'f:<path d="M11.2 2.8a1.5 1.5 0 0 1 1.6 0L20.5 8H3.5z"/><rect x="3" y="8" width="18" height="2" rx=".8"/><rect x="2.5" y="19.5" width="19" height="2.5" rx="1"/>',
    's:<path d="M6 12v5.5M10 12v5.5M14 12v5.5M18 12v5.5"/>',
  ],
  laptop: [
    'f:<rect x="3.5" y="4" width="17" height="12" rx="2.5"/>',
    's:<path d="M1.5 20h21"/>',
    `d:${GEM(12, 10, 0.9)}`,
  ],
  leaf: [
    's:<path d="M7 17 3 21"/>',
    'f:<path d="M20.5 3c-8 0-15 3-15 11a6.5 6.5 0 0 0 6.5 6.5C19 20.5 21 11 20.5 3z"/>',
    'd:<path d="M17 7c-4 3-7 6.5-8.5 10.5"/>',
  ],
  link: [
    's:<path d="M10 13.5a4.5 4.5 0 0 0 6.4.4l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.6 1.6M14 10.5a4.5 4.5 0 0 0-6.4-.4l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.6-1.6"/>',
  ],
  lock: [
    's:<path d="M7.5 10.5v-3a4.5 4.5 0 0 1 9 0v3"/>',
    'f:<rect x="3.5" y="10.5" width="17" height="11.5" rx="3"/>',
    'df:<circle cx="12" cy="15.2" r="1.5"/>',
    'd:<path d="M12 16v2.3"/>',
  ],
  mail: [
    'f:<rect x="2" y="4.5" width="20" height="15" rx="3"/>',
    'd:<path d="m3.5 8 8.5 5.5L20.5 8"/>',
  ],
  message: [`f:${BUBBLE}`, 'd:<path d="M7.5 8.5h9M7.5 12h6"/>'],
  monitor: [
    's:<path d="M8 21h8M12 17v4"/>',
    'f:<rect x="2" y="3" width="20" height="14" rx="2.5"/>',
    `d:${GEM(12, 9.5, 0.9)}`,
  ],
  msg: [`f:${BUBBLE}`, 'd:<path d="M12 6.8v4"/>', 'df:<circle cx="12" cy="13.6" r="1.1"/>'],
  music: [
    's:<path d="M9 17V6.2M20 15V4"/>',
    'f:<path d="M8 5.2 21 2.8v4.4L8 9.6z"/><circle cx="6.2" cy="17.2" r="3"/><circle cx="17.2" cy="15.2" r="3"/>',
  ],
  note: [
    's:<path d="M12 20.5h9"/>',
    'f:<path d="M16.3 3.2a2.2 2.2 0 0 1 3.1 3.1L7.5 18.2 3 19.5l1.3-4.5z"/>',
    'd:<path d="M14.5 5l3.1 3.1"/>',
  ],
  palette: [
    'f:<path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.65-.75 1.65-1.69 0-.44-.18-.84-.44-1.13-.29-.29-.44-.65-.44-1.13a1.64 1.64 0 0 1 1.67-1.67h2c3.05 0 5.55-2.5 5.55-5.55C21.97 6.01 17.46 2 12 2z"/>',
    'df:<circle cx="13.5" cy="6.5" r="1.3"/><circle cx="17.5" cy="10.5" r="1.3"/><circle cx="8.5" cy="7.5" r="1.3"/><circle cx="6.5" cy="12.5" r="1.3"/>',
  ],
  party: [
    'f:<path d="M7.2 9.8l7 7L2.6 21.4a.8.8 0 0 1-1-1z"/>',
    'd:<path d="M5.4 14.6l4 4"/>',
    's:<path d="M14 9.5 15.5 8M15 3l-.5 2M21 9l-2 .5M19 3l-1.5 1.5"/>',
  ],
  pencil: [
    'f:<path d="M16.8 3.2a2.5 2.5 0 0 1 3.5 3.5L7.8 19.2 2.5 21.5l2.3-5.3z"/>',
    'd:<path d="M14.8 5.2l4 4"/>',
  ],
  phone: [
    'f:<rect x="5.5" y="2" width="13" height="20" rx="3"/>',
    'd:<path d="M10.5 5h3"/>',
    'df:<circle cx="12" cy="18.3" r="1"/>',
  ],
  piano: [
    'f:<rect x="2" y="4" width="20" height="16" rx="3"/>',
    'df:<rect x="3.3" y="8.3" width="17.4" height="10.4" rx="1.6"/>',
    'f:<rect x="6.3" y="7.8" width="2.4" height="6.2" rx=".6"/><rect x="10.8" y="7.8" width="2.4" height="6.2" rx=".6"/><rect x="15.3" y="7.8" width="2.4" height="6.2" rx=".6"/>',
    'd:<path d="M7.5 14v4M12 14v4M16.5 14v4"/>',
  ],
  pin: [
    'f:<path d="M12 22s-7.5-6.4-7.5-12.5a7.5 7.5 0 0 1 15 0C19.5 15.6 12 22 12 22z"/>',
    'd:<circle cx="12" cy="9.5" r="2.6"/>',
  ],
  receipt: [
    'f:<path d="M4 2.5v19l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1v-19l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/>',
    'd:<path d="M8 8h8M8 12h8M8 16h5"/>',
  ],
  repeat: [
    's:<path d="M17 2.5 20.5 6 17 9.5M3.5 11v-.5A4.5 4.5 0 0 1 8 6h12.5M7 21.5 3.5 18 7 14.5M20.5 13v.5A4.5 4.5 0 0 1 16 18H3.5"/>',
  ],
  ring: [
    's:<circle cx="12" cy="15.5" r="5.5"/>',
    'f:<path d="M8.5 3h7l2 3-5.5 3.8L6.5 6z"/>',
    'd:<path d="M8 6h8"/>',
  ],
  ruler: [
    'f:<path d="M3 21 21 3v16.5a1.5 1.5 0 0 1-1.5 1.5z"/>',
    'd:<path d="M8 20.5v-2M11.5 20.5v-3M15 20.5v-2M20.5 15h-2M20.5 11.5h-3"/>',
  ],
  scissors: [
    's:<path d="M20 4 8.4 15.6M14.5 14.5 20 20M8.4 8.4 12 12"/>',
    'f:<circle cx="6" cy="6" r="3.3"/><circle cx="6" cy="18" r="3.3"/>',
    'df:<circle cx="6" cy="6" r="1.3"/><circle cx="6" cy="18" r="1.3"/>',
  ],
  scroll: [
    'f:<rect x="5" y="4" width="14" height="16"/><rect x="3" y="2.5" width="18" height="4.5" rx="2.25"/><rect x="3" y="17" width="18" height="4.5" rx="2.25"/>',
    'd:<path d="M8.5 10.5h7M8.5 13.5h5"/>',
  ],
  sofa: [
    's:<path d="M5 19.5V21M19 19.5V21"/>',
    'f:<path d="M4.5 6.5A2.5 2.5 0 0 1 7 4h10a2.5 2.5 0 0 1 2.5 2.5V10h-15z"/><path d="M2 11.5a2 2 0 0 1 4 0V13h12v-1.5a2 2 0 0 1 4 0V17a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"/>',
    'd:<path d="M6.5 13.5h11"/>',
  ],
  sparkles: [
    'f:<path d="M10 2.5l2.1 5.6 5.6 2.1-5.6 2.1L10 17.9l-2.1-5.6-5.6-2.1 5.6-2.1z"/><path d="M18.5 14l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z"/>',
  ],
  sun: [
    'f:<circle cx="12" cy="12" r="4.5"/>',
    's:<path d="M12 2v2.2M12 19.8V22M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2 12h2.2M19.8 12H22M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6"/>',
  ],
  swap: ['s:<path d="M8 3 4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4"/>'],
  target: [
    'f:<circle cx="12" cy="12" r="10"/>',
    'd:<circle cx="12" cy="12" r="5.8"/>',
    'df:<circle cx="12" cy="12" r="2"/>',
  ],
  tent: [
    'f:<path d="M10.7 4.2a1.5 1.5 0 0 1 2.6 0l8.4 15.3a1 1 0 0 1-.9 1.5H3.2a1 1 0 0 1-.9-1.5z"/>',
    'd:<path d="M8.8 20.5 12 14.8l3.2 5.7"/>',
  ],
  ticket: [
    'f:<path d="M2 9.5a2.5 2.5 0 0 1 0 5V17a2.5 2.5 0 0 0 2.5 2.5h15A2.5 2.5 0 0 0 22 17v-2.5a2.5 2.5 0 0 1 0-5V7a2.5 2.5 0 0 0-2.5-2.5h-15A2.5 2.5 0 0 0 2 7z"/>',
    'd:<path d="M14.5 6v2M14.5 11v2M14.5 16v2"/>',
  ],
  trend: ['s:<path d="M2 17l6.5-6.5 5 5L22 7M16 7h6v6"/>'],
  utensils: [
    's:<path d="M4 2.5V8a2.5 2.5 0 0 0 2.5 2.5h1A2.5 2.5 0 0 0 10 8V2.5M7 2.5v19M20 13v8.5"/>',
    'f:<path d="M20 2.5c-3 0-4.5 3-4.5 6.5v4.5H20z"/>',
  ],
  vase: [
    's:<path d="M8 2.5h8"/>',
    'f:<path d="M9 2.5h6v3c3 2 4 4.8 4 7.5a7 7 0 0 1-14 0c0-2.7 1-5.5 4-7.5z"/>',
    'd:<path d="M5.8 12.5h12.4"/>',
  ],
  wallet: [
    's:<path d="M5 5.5 16.5 2.6a1.5 1.5 0 0 1 1.9 1.4v1.5"/>',
    'f:<rect x="2.5" y="5.5" width="19" height="15" rx="3"/>',
    'd:<path d="M21 10.5h-3.5a2.5 2.5 0 0 0 0 5H21"/>',
    'df:<circle cx="17.5" cy="13" r="1"/>',
  ],
  waves: [
    's:<path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5s2.4 2 5 2 2.5-2 5-2c1.3 0 1.9.5 2.5 1M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2s2.4 2 5 2 2.5-2 5-2c1.3 0 1.9.5 2.5 1M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2s2.4 2 5 2 2.5-2 5-2c1.3 0 1.9.5 2.5 1"/>',
  ],
  wrench: [`f:${WRENCH}`, `sw:${WRENCH}`],
  zap: [`f:${ZAP}`, `sw:${ZAP}`],
};
