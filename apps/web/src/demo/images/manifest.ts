/// <reference types="vite/client" />
/**
 * Demo photos (Unsplash License — see CREDITS.md in this folder).
 * Swap a photo by replacing the .webp file with the same name; no code changes.
 * Rule for this folder: no people, no religious symbols, nothing suggestive.
 */
import cameraLens from './camera-lens.webp';
import ceramicMug from './ceramic-mug.webp';
import figs from './figs.webp';
import flowersPink from './flowers-pink.webp';
import hallOrange from './hall-orange.webp';
import jaffaLimestone from './jaffa-limestone.webp';
import jaffaPalm from './jaffa-palm.webp';
import lenses from './lenses.webp';
import parkPath from './park-path.webp';
import park from './park.webp';
import pears from './pears.webp';
import sunflowers from './sunflowers.webp';
import tableSettingGold from './table-setting-gold.webp';
import tlvAerial from './tlv-aerial.webp';
import whiteFlowers from './white-flowers.webp';

export const demoImages = {
  packageFamily: park,
  packageBarMitzvah: tableSettingGold,
  packageEvent: hallOrange,
  packageProduct: ceramicMug,
  packageCustom: cameraLens,
  studioBanner: tlvAerial,
} as const;

/** Sample delivered-gallery set shown to clients once the gallery is released. */
export const demoGallery: { src: string; alt: string }[] = [
  { src: jaffaPalm, alt: 'Date palm in front of a limestone building in Old Jaffa' },
  { src: flowersPink, alt: 'Long table set with glassware and flower arrangements' },
  { src: jaffaLimestone, alt: 'Limestone house with blue shutters and palm trees' },
  { src: sunflowers, alt: 'Three sunflowers in a glass jar on a wooden table' },
  { src: parkPath, alt: 'Gravel path between clipped cypress trees leading to a fountain' },
  { src: whiteFlowers, alt: 'Small vase of white flowers on a round wooden table' },
  { src: figs, alt: 'Two fig halves on a grey plate' },
  { src: pears, alt: 'Four pears on an olive-wood board' },
  { src: lenses, alt: 'Camera lenses seen from above, black and white' },
];
