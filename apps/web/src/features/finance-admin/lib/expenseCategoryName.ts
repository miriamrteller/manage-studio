/** A common category's names (expense_category_catalog). */
export interface ExpenseCatalogNames {
  name_en: string;
  name_he: string;
}

export interface ExpenseCatalogItem extends ExpenseCatalogNames {
  key: string;
  is_vat_eligible: boolean;
  sort_order: number;
}

export type ExpenseLanguage = 'en' | 'he';

export function expenseLanguage(appLanguage: string | undefined): ExpenseLanguage {
  return appLanguage?.startsWith('he') ? 'he' : 'en';
}

/**
 * The name to show: a common category in the reader's language, the studio's own
 * category as typed.
 */
export function expenseCategoryName(
  category: { name: string; catalog?: ExpenseCatalogNames | null } | null | undefined,
  language: ExpenseLanguage,
): string {
  if (!category) return '';
  if (category.catalog) return language === 'he' ? category.catalog.name_he : category.catalog.name_en;
  return category.name;
}

/**
 * The catalogue split for one studio: its skin's set first (in catalogue order), then the
 * rest. A skin with no list of its own uses the generic one.
 */
export function splitExpenseCatalog(
  catalog: ExpenseCatalogItem[],
  skinKeys: string[] | null | undefined,
  genericKeys: string[] | null | undefined,
): { suggested: ExpenseCatalogItem[]; more: ExpenseCatalogItem[] } {
  const keys = new Set(skinKeys ?? genericKeys ?? []);
  const sorted = [...catalog].sort((a, b) => a.sort_order - b.sort_order);
  return {
    suggested: sorted.filter((c) => keys.has(c.key)),
    more: sorted.filter((c) => !keys.has(c.key)),
  };
}
