import type { ImportClient } from './clientImportRows';

/** A SmugMug gallery as the studio's gallery list gives it. */
export interface GalleryOption {
  key: string;
  name: string;
}

/** One shoot the import made or found (import_clients "shoot_links"). */
export interface ShootLink {
  /** 0-based position in the clients sent. */
  client: number;
  /** 0-based position in that client's shoots. */
  shoot: number;
  engagement_id: string;
  has_gallery: boolean;
}

/** Gallery names match with case and spaces ignored. */
export function galleryNameKey(name: string): string {
  return name.replace(/[‎‏‪-‮]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export type GalleryMatch = { key: string } | 'none' | 'several';

/** The one gallery with this name; 'several' when the name is not unique, so nothing is guessed. */
export function matchGallery(galleries: GalleryOption[], name: string): GalleryMatch {
  const wanted = galleryNameKey(name);
  const found = galleries.filter((g) => galleryNameKey(g.name) === wanted);
  if (found.length === 0) return 'none';
  if (found.length > 1) return 'several';
  return { key: found[0]!.key };
}

/** Before import: how many gallery names on the sheet are found in SmugMug, and which are not. */
export function previewGalleries(
  clients: ImportClient[],
  galleries: GalleryOption[],
): { total: number; found: number; missing: string[]; several: string[] } {
  let total = 0;
  let found = 0;
  const missing = new Set<string>();
  const several = new Set<string>();
  for (const c of clients) {
    for (const s of c.shoots ?? []) {
      if (!s.gallery) continue;
      total++;
      const m = matchGallery(galleries, s.gallery);
      if (m === 'none') missing.add(s.gallery);
      else if (m === 'several') several.add(s.gallery);
      else found++;
    }
  }
  return { total, found, missing: [...missing], several: [...several] };
}

export interface GalleryLinkPlan {
  /** Shoots to link, in sheet order. */
  link: { engagementId: string; albumKey: string; gallery: string }[];
  /** The shoot already has a SmugMug gallery: left as it is. */
  alreadyLinked: number;
  /** No gallery, or more than one, with that name. */
  notFound: string[];
}

/** After import: which shoot gets which gallery. A shoot that already has one keeps it. */
export function planGalleryLinks(
  clients: ImportClient[],
  links: ShootLink[],
  galleries: GalleryOption[],
): GalleryLinkPlan {
  const plan: GalleryLinkPlan = { link: [], alreadyLinked: 0, notFound: [] };
  const seen = new Set<string>();
  for (const l of links) {
    const gallery = clients[l.client]?.shoots?.[l.shoot]?.gallery;
    if (!gallery || seen.has(l.engagement_id)) continue;
    seen.add(l.engagement_id);
    if (l.has_gallery) {
      plan.alreadyLinked++;
      continue;
    }
    const m = matchGallery(galleries, gallery);
    if (typeof m === 'string') plan.notFound.push(gallery);
    else plan.link.push({ engagementId: l.engagement_id, albumKey: m.key, gallery });
  }
  return plan;
}
