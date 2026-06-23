import React from 'react';

export interface EmailDetailsTableRow {
  label: string;
  value: string;
}

export interface EmailDetailsTableProps {
  heading: string;
  rows: EmailDetailsTableRow[];
}

/**
 * Key/value detail block used across transactional emails (class info, payment summary).
 */
export function EmailDetailsTable({ heading, rows }: EmailDetailsTableProps) {
  if (rows.length === 0) return null;

  return (
    <table
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        backgroundColor: '#f9fafb',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        marginBottom: '24px',
      }}
    >
      <tbody>
        <tr>
          <td colSpan={2} style={{ padding: '12px 16px 4px', fontWeight: 700, fontSize: '15px' }}>
            {heading}
          </td>
        </tr>
        {rows.map((row) => (
          <tr key={row.label}>
            <td
              style={{
                padding: '4px 16px',
                fontSize: '14px',
                color: '#6b7280',
                width: '35%',
                verticalAlign: 'top',
              }}
            >
              {row.label}
            </td>
            <td style={{ padding: '4px 16px', fontSize: '14px', color: '#111827', fontWeight: 600 }}>
              {row.value}
            </td>
          </tr>
        ))}
        <tr>
          <td colSpan={2} style={{ height: '8px' }} />
        </tr>
      </tbody>
    </table>
  );
}
