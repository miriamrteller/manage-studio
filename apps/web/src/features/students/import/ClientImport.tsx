import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FEATURES } from '@shared/index';
import { Button } from '@/components/ui/button';
import { useTenant } from '@/hooks/useTenant';
import { useHasFeature } from '@/hooks/useHasFeature';
import { useEntityLabels } from '@/hooks/useEntityLabels';
import { cellText, findHeaderRow, headerNames } from '@/features/finance-admin/import/importRows';
import { readSpreadsheet, SpreadsheetError, type SheetData } from '@/features/finance-admin/import/readSpreadsheet';
import {
  buildClients,
  clientFieldKeys,
  guessClientColumns,
  hasAmbiguousDates,
  type ClientColumn,
  type ClientFieldKey,
} from './clientImportRows';
import { ClientImportService, type ClientImportResult, type ClientMatch } from './clientImportService';
import { SmugMugService } from '@/features/settings/services/smugmugService';
import { planGalleryLinks, previewGalleries, type GalleryLinkPlan } from './galleryLinks';

/** Same key as the shoot page's "already watermarked" tick (JobPhotoShopSource). */
const IN_PHOTOS_KEY = 'os_photo_shop_watermark_in_photos';

interface GalleryLinkResult {
  linked: number;
  failed: number;
  plan: GalleryLinkPlan;
}

interface LoadedFile {
  file: File;
  sheets: SheetData[];
}

/** Import a studio's clients (and, at family studios, their students) from a spreadsheet. */
export function ClientImport() {
  const { t, i18n } = useTranslation();
  const tenant = useTenant();
  const queryClient = useQueryClient();
  const { labels, vertical, profile } = useEntityLabels();
  // Photographers never have families; other studios do when family accounts are on.
  const families = vertical !== 'photographer' && profile.familyAccounts;
  // Past shoots (owner, 17 Nov 2026): a "Shoot" column gives each client a shoot marked Shot.
  // Follows the feature set, like the Shoots page.
  const { hasFeature } = useHasFeature();
  const projects = hasFeature(FEATURES.billing.quotes);
  // SmugMug gallery column (owner, 18 Nov 2026): links each imported shoot to its gallery.
  const photoShop = projects && hasFeature(FEATURES.billing.photoShop);
  const smugmugStatus = useQuery({
    queryKey: ['smugmug-status'],
    queryFn: () => SmugMugService.getStatus(),
    enabled: photoShop,
  });
  const smugmugConnected = smugmugStatus.data?.connected === true;
  const fieldKeys = clientFieldKeys(families, projects, photoShop);

  const [loaded, setLoaded] = useState<LoadedFile | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [columns, setColumns] = useState<ClientColumn[]>([]);
  const [dayFirst, setDayFirst] = useState(true);
  // Same-name matches are left out unless the studio says otherwise (index → add anyway).
  const [result, setResult] = useState<ClientImportResult | null>(null);
  const [galleryResult, setGalleryResult] = useState<GalleryLinkResult | null>(null);
  const [galleryProgress, setGalleryProgress] = useState<{ done: number; total: number } | null>(null);

  const batchesQuery = useQuery({
    queryKey: ['client-import-batches', tenant?.id],
    queryFn: () => ClientImportService.listBatches(tenant!.id),
    enabled: !!tenant?.id,
  });

  const sheet = loaded?.sheets[sheetIndex] ?? null;
  const headerRow = sheet ? findHeaderRow(sheet.rows) : 0;
  const example = useMemo(() => (sheet ? exampleRow(sheet.rows, headerRow) : []), [sheet, headerRow]);

  const chooseSheet = (data: LoadedFile, index: number) => {
    const rows = data.sheets[index]?.rows ?? [];
    const hRow = findHeaderRow(rows);
    const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
    setSheetIndex(index);
    setColumns(guessClientColumns(headerNames(rows[hRow] ?? [], width), families, projects, photoShop));
    setGalleryResult(null);
    setDayFirst(true);
    setResult(null);
  };

  const handleFile = async (file: File | undefined) => {
    setReadError(null);
    setResult(null);
    if (!file) return;
    try {
      const sheets = (await readSpreadsheet(file)).filter((s) => s.rows.some((r) => r.some((c) => cellText(c) !== '')));
      if (sheets.length === 0) {
        setReadError(t('clients_import.error_empty'));
        setLoaded(null);
        return;
      }
      const data = { file, sheets };
      setLoaded(data);
      chooseSheet(data, 0);
    } catch (err) {
      const code = err instanceof SpreadsheetError ? err.code : 'unreadable';
      setReadError(t(`finance.import.error_${code}`));
      setLoaded(null);
    }
  };

  const dateCols = columns.filter((c) => c.field === 'student_dob' || c.field === 'shoot_date').map((c) => c.index);
  const showDateOrder = !!sheet && dateCols.some((col) => hasAmbiguousDates(sheet.rows, headerRow, col));
  const hasName = columns.some((c) => c.field === 'name' || c.field === 'first_name' || c.field === 'last_name');

  const built = useMemo(() => {
    if (!sheet || !hasName) return null;
    return buildClients(sheet.rows, headerRow, {
      columns,
      families,
      dayFirst,
      familyName: (name) => t('clients_import.family_name', { name }),
      projects,
      defaultShootName: t('clients_import.default_shoot_name'),
    });
  }, [sheet, headerRow, columns, families, dayFirst, hasName, projects, t]);

  // The duplicate check: which rows are already clients.
  const matchesQuery = useQuery({
    queryKey: ['client-import-matches', tenant?.id, built?.clients.map((c) => [c.name, c.email, c.phone])],
    queryFn: () => ClientImportService.matches(built!.clients),
    enabled: !!tenant?.id && !!built && built.clients.length > 0 && !result,
    staleTime: 60_000,
  });

  const matches = useMemo(() => {
    const byIndex = new Map<number, ClientMatch>();
    for (const m of matchesQuery.data ?? []) byIndex.set(m.index, m);
    return byIndex;
  }, [matchesQuery.data]);

  // New clients, plus clients already here who have a past shoot to add or an email
  // (sent with their person_id, so they are not added twice; the database saves the
  // email only for a client who has none). A row with the same name as a client is that
  // client: nothing to tick or answer (owner, 22 Nov 2026: "don't ask her any questions").
  const toImport = useMemo(() => {
    if (!built) return [];
    return built.clients.flatMap((c, i) => {
      const m = matches.get(i);
      if (!m) return [c];
      return c.shoots?.length || c.email ? [{ ...c, person_id: m.person_id }] : [];
    });
  }, [built, matches]);
  const newClients = toImport.filter((c) => !c.person_id);
  const studentsToImport = newClients.reduce((n, c) => n + (c.students?.length ?? 0), 0);
  const shootsToImport = toImport.reduce((n, c) => n + (c.shoots?.length ?? 0), 0);
  const alreadyClients = [...matches.values()];

  // The studio's SmugMug galleries, read once when the sheet has a gallery column.
  const hasGalleryColumn = photoShop && columns.some((c) => c.field === 'shoot_gallery');
  const galleriesQuery = useQuery({
    queryKey: ['smugmug-albums', 'import'],
    queryFn: async () => (await SmugMugService.listAlbums('')).albums,
    enabled: hasGalleryColumn && smugmugConnected && !result,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const galleryPreview = useMemo(
    () => (galleriesQuery.data ? previewGalleries(toImport, galleriesQuery.data) : null),
    [galleriesQuery.data, toImport],
  );
  const galleriesOnSheet = toImport.some((c) => c.shoots?.some((sh) => sh.gallery));

  /** After import: link each shoot to its gallery with the shoot page's "Check gallery". */
  const linkGalleries = async (sent: typeof toImport, res: ClientImportResult) => {
    const galleries = galleriesQuery.data;
    if (!galleries || !res.shoot_links?.length) return;
    const plan = planGalleryLinks(sent, res.shoot_links, galleries);
    if (plan.link.length === 0 && plan.alreadyLinked === 0 && plan.notFound.length === 0) return;
    const inPhotos = typeof localStorage !== 'undefined' && localStorage.getItem(IN_PHOTOS_KEY) === '1';
    let linked = 0;
    let failed = 0;
    setGalleryProgress({ done: 0, total: plan.link.length });
    // One at a time: SmugMug is read once per gallery, like choosing it on the shoot page.
    for (const item of plan.link) {
      try {
        await SmugMugService.checkGallery(item.engagementId, item.albumKey, inPhotos);
        linked++;
      } catch {
        failed++;
      }
      setGalleryProgress({ done: linked + failed, total: plan.link.length });
    }
    setGalleryProgress(null);
    setGalleryResult({ linked, failed, plan });
    void queryClient.invalidateQueries({ queryKey: ['photo-shop'] });
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      const sent = toImport;
      const res = await ClientImportService.importClients({
        fileName: loaded!.file.name,
        sheetName: loaded!.sheets.length > 1 ? sheet!.name : null,
        mapping: Object.fromEntries(columns.map((c) => [c.header, c.field])),
        clients: sent,
      });
      return { res, sent };
    },
    onSuccess: ({ res, sent }) => {
      setResult(res);
      if (hasGalleryColumn && smugmugConnected) void linkGalleries(sent, res);
      void queryClient.invalidateQueries({ queryKey: ['client-import-batches', tenant?.id] });
      void queryClient.invalidateQueries({ queryKey: ['people'] });
      void queryClient.invalidateQueries({ queryKey: ['students'] });
      void queryClient.invalidateQueries({ queryKey: ['families'] });
      void queryClient.invalidateQueries({ queryKey: ['jobs'] });
      void queryClient.invalidateQueries({ queryKey: ['job-packages'] });
    },
  });

  const setField = (index: number, field: ClientFieldKey) => {
    setColumns((prev) =>
      prev.map((c) => {
        if (c.index === index) return { ...c, field };
        // Each field comes from one column: the old column is left out instead.
        if (field !== 'skip' && c.field === field) return { ...c, field: 'skip' };
        return c;
      }),
    );
  };

  const rowsLabel = (rowNumbers: number[]) => t('clients_import.rows_label', { rows: rowNumbers.join(', ') });

  return (
    <div className="space-y-8 p-4">
      <section className="space-y-2">
        <Link to="/admin/people" className="text-sm font-medium text-primary underline">
          {t('clients_import.back', { noun: labels.contact.plural })}
        </Link>
        <h1 className="text-3xl font-bold">{t('clients_import.title')}</h1>
        <p className="text-gray-600">{families ? t('clients_import.intro_families') : t('clients_import.intro')}</p>
        {projects && <p className="text-gray-600">{t('clients_import.shoots_hint')}</p>}
        <p className="text-sm text-gray-600">{t('finance.import.google_sheets_hint')}</p>
      </section>

      <div className="space-y-2 rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="note">
        <p>{t('clients_import.notice_permission')}</p>
        <p>{t('clients_import.notice_no_email')}</p>
      </div>

      <section className="space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">{t('finance.import.choose_file')}</span>
          <input
            type="file"
            accept=".csv,.xlsx,.tsv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
        </label>
        {readError && (
          <div className="alert-error" role="alert">
            {readError}
          </div>
        )}
        {loaded && loaded.sheets.length > 1 && (
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{t('finance.import.choose_sheet')}</span>
            <select
              className="rounded border px-3 py-2"
              value={sheetIndex}
              onChange={(e) => chooseSheet(loaded, Number(e.target.value))}
            >
              {loaded.sheets.map((s, i) => (
                <option key={s.name + i} value={i}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      {sheet && !result && (
        <>
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">{t('finance.import.columns_title')}</h2>
            <p className="text-sm text-gray-600">{t('clients_import.columns_hint')}</p>
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-start">{t('finance.import.col_sheet_column')}</th>
                    <th className="px-3 py-2 text-start">{t('finance.import.col_example')}</th>
                    <th className="px-3 py-2 text-start">{t('finance.import.col_goes_to')}</th>
                  </tr>
                </thead>
                <tbody>
                  {columns.map((c) => (
                    <tr key={c.index}>
                      <td className="px-3 py-2 font-medium" dir="auto">
                        {c.header}
                      </td>
                      <td className="px-3 py-2 text-gray-600" dir="auto">
                        {exampleValue(example, c.index)}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          className="rounded border px-2 py-1"
                          aria-label={t('finance.import.col_goes_to_for', { column: c.header })}
                          value={c.field}
                          onChange={(e) => setField(c.index, e.target.value as ClientFieldKey)}
                        >
                          {fieldKeys.map((f) => (
                            <option key={f} value={f}>
                              {t(`clients_import.field.${f}`)}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!hasName && (
              <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
                {t('clients_import.need_name')}
              </p>
            )}
          </section>

          {showDateOrder && (
            <details className="rounded border p-4 text-sm">
              <summary className="cursor-pointer font-medium">{t('finance.import.details_filled')}</summary>
              <label className="mt-3 block">
                <span className="mb-1 block font-medium">{t('finance.import.date_order_label')}</span>
                <select
                  className="rounded border px-2 py-1"
                  value={dayFirst ? 'day' : 'month'}
                  onChange={(e) => setDayFirst(e.target.value === 'day')}
                >
                  <option value="day">{t('finance.import.date_order_day')}</option>
                  <option value="month">{t('finance.import.date_order_month')}</option>
                </select>
              </label>
            </details>
          )}

          {built && (
            <section className="space-y-3">
              <h2 className="text-xl font-semibold">{t('clients_import.check_title')}</h2>
              {matchesQuery.isLoading && <p className="text-sm text-gray-600">{t('clients_import.checking')}</p>}
              {matchesQuery.error && (
                <div className="alert-error" role="alert">
                  {t('clients_import.check_failed', { message: (matchesQuery.error as Error).message })}
                </div>
              )}
              {!matchesQuery.isLoading && !matchesQuery.error && alreadyClients.length === 0 && (
                <p className="text-sm text-gray-600">{t('clients_import.no_duplicates')}</p>
              )}

              {alreadyClients.length > 0 && (
                <details className="rounded border border-blue-200 bg-blue-50 p-3 text-sm">
                  <summary className="cursor-pointer">
                    {shootsToImport > 0
                      ? t('clients_import.already_clients_shoots', { count: alreadyClients.length })
                      : t('clients_import.already_clients', { count: alreadyClients.length })}
                  </summary>
                  <ul className="mt-2 space-y-0.5">
                    {alreadyClients.slice(0, 100).map((m) => (
                      <li key={m.index} dir="auto">
                        {t(`clients_import.match_${m.reason}`, {
                          name: built.clients[m.index]?.name ?? '',
                          existing: m.name,
                        })}{' '}
                        <span className="text-gray-600">({rowsLabel(built.clients[m.index]?.rowNumbers ?? [])})</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              <ul className="space-y-1 text-sm">
                <li>{t('clients_import.preview_clients', { count: newClients.length })}</li>
                {families && studentsToImport > 0 && (
                  <li>{t('clients_import.preview_students', { count: studentsToImport })}</li>
                )}
                {shootsToImport > 0 && (
                  <li>{t('clients_import.preview_shoots', { count: shootsToImport })}</li>
                )}
                {galleryPreview && galleryPreview.total > 0 && (
                  <li>
                    {t('clients_import.preview_galleries', {
                      count: galleryPreview.total,
                      found: galleryPreview.found,
                    })}
                  </li>
                )}
              </ul>
              {hasGalleryColumn && galleriesOnSheet && !smugmugConnected && !smugmugStatus.isLoading && (
                <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
                  {t('clients_import.galleries_not_connected')}
                </p>
              )}
              {galleriesQuery.isError && (
                <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
                  {t('clients_import.galleries_unreadable')}
                </p>
              )}
              {galleryPreview && (galleryPreview.missing.length > 0 || galleryPreview.several.length > 0) && (
                <details className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <summary className="cursor-pointer">
                    {t('clients_import.galleries_missing', {
                      count: galleryPreview.missing.length + galleryPreview.several.length,
                    })}
                  </summary>
                  <ul className="mt-2 space-y-0.5">
                    {galleryPreview.missing.slice(0, 100).map((g) => (
                      <li key={`m-${g}`} dir="auto">{t('clients_import.gallery_not_found', { name: g })}</li>
                    ))}
                    {galleryPreview.several.slice(0, 100).map((g) => (
                      <li key={`s-${g}`} dir="auto">{t('clients_import.gallery_several', { name: g })}</li>
                    ))}
                  </ul>
                </details>
              )}

              {built.problems.length > 0 && (
                <details className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <summary className="cursor-pointer">
                    {t('clients_import.problems', { count: built.problems.length })}
                  </summary>
                  <ul className="mt-2 space-y-0.5">
                    {built.problems.slice(0, 100).map((p) => (
                      <li key={`${p.rowNumber}-${p.code}`}>
                        {t('finance.import.problem_row', {
                          row: p.rowNumber,
                          reason: t(`clients_import.problem.${p.code}`),
                        })}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {importMutation.error && (
                <div className="alert-error" role="alert">
                  {t('finance.import.error_import', { message: (importMutation.error as Error).message })}
                </div>
              )}
              <Button
                type="button"
                variant="primary"
                disabled={toImport.length === 0 || matchesQuery.isLoading}
                isLoading={importMutation.isPending}
                onClick={() => importMutation.mutate()}
              >
                {newClients.length === 0 && galleryPreview && galleryPreview.found > 0
                  ? t('clients_import.import_button_galleries', { count: galleryPreview.found })
                  : newClients.length === 0 && shootsToImport > 0
                    ? t('clients_import.import_button_shoots', { count: shootsToImport })
                    : t('clients_import.import_button', { count: newClients.length })}
              </Button>
            </section>
          )}
        </>
      )}

      {result && (
        <section className="space-y-3 rounded border border-green-200 bg-green-50 p-4" role="status">
          <h2 className="text-xl font-semibold">{t('finance.import.done_title')}</h2>
          <ul className="space-y-1 text-sm">
            <li>{t('clients_import.done_clients', { count: result.clients })}</li>
            {result.students > 0 && <li>{t('clients_import.done_students', { count: result.students })}</li>}
            {(result.shoots ?? 0) > 0 && <li>{t('clients_import.done_shoots', { count: result.shoots })}</li>}
            {(result.emails_added ?? 0) > 0 && (
              <li>{t('clients_import.done_emails', { count: result.emails_added })}</li>
            )}
            {result.skipped > 0 && (
              <li>
                {(result.shoots ?? 0) > 0
                  ? t('clients_import.done_already', { count: result.skipped })
                  : t('clients_import.done_skipped', { count: result.skipped })}
              </li>
            )}
          </ul>
          {galleryProgress && (
            <p className="text-sm">
              {t('clients_import.galleries_linking', { done: galleryProgress.done, total: galleryProgress.total })}
            </p>
          )}
          {galleryResult && (
            <ul className="space-y-1 text-sm">
              {galleryResult.linked > 0 && (
                <li>{t('clients_import.done_galleries', { count: galleryResult.linked })}</li>
              )}
              {galleryResult.plan.alreadyLinked > 0 && (
                <li>{t('clients_import.done_galleries_already', { count: galleryResult.plan.alreadyLinked })}</li>
              )}
              {galleryResult.plan.notFound.length > 0 && (
                <li>{t('clients_import.done_galleries_not_found', { count: galleryResult.plan.notFound.length })}</li>
              )}
              {galleryResult.failed > 0 && (
                <li>{t('clients_import.done_galleries_failed', { count: galleryResult.failed })}</li>
              )}
            </ul>
          )}
          <Link to="/admin/people" className="text-sm font-medium text-primary underline">
            {t('clients_import.see_clients', { noun: labels.contact.plural })}
          </Link>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t('finance.import.history_title')}</h2>
        {batchesQuery.data && batchesQuery.data.length === 0 && (
          <p className="text-sm text-gray-600">{t('finance.import.history_empty')}</p>
        )}
        {batchesQuery.data && batchesQuery.data.length > 0 && (
          <ul className="space-y-2 text-sm">
            {batchesQuery.data.map((b) => (
              <li key={b.id} className="rounded border p-3">
                <p className="font-medium" dir="auto">
                  {b.sheet_name ? `${b.file_name} · ${b.sheet_name}` : b.file_name}
                </p>
                <p className="text-gray-600">
                  {t('clients_import.history_line', {
                    date: new Date(b.created_at).toLocaleDateString(i18n.language),
                    clients: b.clients_count,
                    skipped: b.skipped_count,
                  })}
                  {b.students_count > 0 && ` · ${t('clients_import.done_students', { count: b.students_count })}`}
                  {b.shoots_count > 0 && ` · ${t('clients_import.done_shoots', { count: b.shoots_count })}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * The sheet row the "Example" column shows: one real row, so every example belongs to the same
 * person (the first row with the most filled cells). Taking each column's first filled cell put
 * one row's email next to another row's name.
 */
function exampleRow(rows: SheetData['rows'], headerRow: number): SheetData['rows'][number] {
  let best: SheetData['rows'][number] = [];
  let bestFilled = 0;
  for (const row of rows.slice(headerRow + 1)) {
    const filled = row.filter((c) => cellText(c) !== '').length;
    if (filled > bestFilled) {
      best = row;
      bestFilled = filled;
    }
  }
  return best;
}

function exampleValue(row: SheetData['rows'][number], col: number): string {
  const v = cellText(row[col]);
  return v.length > 40 ? `${v.slice(0, 40)}…` : v;
}
