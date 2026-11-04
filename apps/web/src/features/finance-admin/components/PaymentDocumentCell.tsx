import { useTranslation } from 'react-i18next';
import type { PaymentLogRow } from '@shared/schemas';
import { useTenant } from '@/hooks/useTenant';
import { paymentDocumentStatus } from '../lib/paymentDocuments';
import { paymentDocumentLinkClassName } from '../lib/paymentsLogDisplay';

/**
 * A payment's tax document: its type and number (linked when we have the file), or a short
 * reason why there is none. Same wording as the accountant export.
 */
export function PaymentDocumentCell({ row }: { row: PaymentLogRow }) {
  const { t } = useTranslation();
  const tenant = useTenant();
  const doc = paymentDocumentStatus(row, tenant);

  if (!doc.issued) {
    return (
      <span className="text-muted-foreground">
        {t(`finance.accountant_export.no_document.${doc.reason}`)}
      </span>
    );
  }

  const provider = t([`settings.provider_names.${row.provider}`, `finance.provider.${row.provider}`], {
    defaultValue: row.provider,
  });
  const type = doc.kind
    ? t(`finance.accountant_export.document_kind.${doc.kind}`)
    : t('finance.accountant_export.document_kind.unknown', { provider });

  return (
    <span>
      <span className="block">{type}</span>
      {doc.number &&
        (doc.url ? (
          <a
            href={doc.url}
            target="_blank"
            rel="noopener noreferrer"
            className={paymentDocumentLinkClassName}
            onClick={(e) => e.stopPropagation()}
          >
            {doc.number}
          </a>
        ) : (
          <span>{doc.number}</span>
        ))}
    </span>
  );
}
