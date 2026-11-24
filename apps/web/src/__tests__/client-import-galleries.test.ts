import { describe, expect, it } from 'vitest';
import { buildClients, clientFieldKeys, guessClientColumns, type ClientColumn } from '@/features/students/import/clientImportRows';
import {
  galleryNameKey,
  matchGallery,
  planGalleryLinks,
  previewGalleries,
  type GalleryOption,
} from '@/features/students/import/galleryLinks';
import type { ImportClient } from '@/features/students/import/clientImportRows';
import type { Cell } from '@/features/finance-admin/import/readSpreadsheet';

const galleries: GalleryOption[] = [
  { key: 'k1', name: 'Cohen Family 2025' },
  { key: 'k2', name: 'Levi newborn' },
  { key: 'k3', name: 'Twins' },
  { key: 'k4', name: 'twins ' },
];

describe('client import: SmugMug gallery column', () => {
  it('is found only with Projects and the photo shop', () => {
    const headers = ['Name', 'Shoot', 'SmugMug gallery'];
    expect(guessClientColumns(headers, false, true, true).map((c) => c.field)).toEqual([
      'name',
      'shoot_name',
      'shoot_gallery',
    ]);
    expect(guessClientColumns(headers, false, true, false).map((c) => c.field)).toEqual([
      'name',
      'shoot_name',
      'skip',
    ]);
    expect(guessClientColumns(['Gallery name', 'שם הגלריה'], false, true, true).map((c) => c.field)).toEqual([
      'shoot_gallery',
      'skip',
    ]);
    expect(clientFieldKeys(false, true, true)).toContain('shoot_gallery');
    expect(clientFieldKeys(false, true)).not.toContain('shoot_gallery');
  });

  it('puts the gallery name on the row shoot; a gallery alone makes a shoot with the default name', () => {
    const rows: Cell[][] = [
      ['Name', 'Email', 'Shoot', 'Gallery'],
      ['Dana', 'dana@example.test', 'Family shoot', 'Cohen Family 2025'],
      ['Avi', 'avi@example.test', '', 'Levi newborn'],
      ['Noa', 'noa@example.test', '', ''],
    ];
    const columns: ClientColumn[] = (['name', 'email', 'shoot_name', 'shoot_gallery'] as const).map(
      (field, index) => ({ index, header: field, field }),
    );
    const built = buildClients(rows, 0, {
      columns,
      families: false,
      dayFirst: true,
      familyName: (n) => n,
      projects: true,
      defaultShootName: 'Shoot',
      today: '2026-11-18',
    });
    expect(built.clients.map((c) => c.shoots)).toEqual([
      [{ name: 'Family shoot', date: null, gallery: 'Cohen Family 2025' }],
      [{ name: 'Shoot', date: null, gallery: 'Levi newborn' }],
      undefined,
    ]);
  });
});

describe('gallery matching', () => {
  it('ignores case, spaces and direction marks, and never guesses between two', () => {
    expect(galleryNameKey('  Cohen‏  family 2025 ')).toBe('cohen family 2025');
    expect(matchGallery(galleries, 'cohen FAMILY 2025')).toEqual({ key: 'k1' });
    expect(matchGallery(galleries, 'Unknown')).toBe('none');
    expect(matchGallery(galleries, 'Twins')).toBe('several');
  });

  const clients: ImportClient[] = [
    { name: 'Dana', shoots: [{ name: 'Shoot', date: null, gallery: 'Cohen Family 2025' }] },
    { name: 'Avi', shoots: [{ name: 'Shoot', date: null, gallery: 'Levi newborn' }] },
    { name: 'Rina', shoots: [{ name: 'Shoot', date: null, gallery: 'Missing one' }] },
    { name: 'Tal', shoots: [{ name: 'Shoot', date: null, gallery: 'Twins' }] },
    { name: 'Noa', shoots: [{ name: 'Shoot', date: null }] },
  ] as ImportClient[];

  it('previews found and missing names', () => {
    expect(previewGalleries(clients, galleries)).toEqual({
      total: 4,
      found: 2,
      missing: ['Missing one'],
      several: ['Twins'],
    });
  });

  it('links each shoot once and leaves shoots that already have a gallery', () => {
    const plan = planGalleryLinks(
      clients,
      [
        { client: 0, shoot: 0, engagement_id: 'e0', has_gallery: false },
        { client: 1, shoot: 0, engagement_id: 'e1', has_gallery: true },
        { client: 2, shoot: 0, engagement_id: 'e2', has_gallery: false },
        { client: 3, shoot: 0, engagement_id: 'e3', has_gallery: false },
        { client: 4, shoot: 0, engagement_id: 'e4', has_gallery: false },
        { client: 0, shoot: 0, engagement_id: 'e0', has_gallery: false },
      ],
      galleries,
    );
    expect(plan).toEqual({
      link: [{ engagementId: 'e0', albumKey: 'k1', gallery: 'Cohen Family 2025' }],
      alreadyLinked: 1,
      notFound: ['Missing one', 'Twins'],
    });
  });
});
