export interface EmailDetailsTableRow {
    label: string;
    value: string;
    /** When set (or when value is a {{TOKEN}} placeholder), row can be stripped in email shells. */
    optionalRowToken?: string;
}
export interface EmailDetailsTableProps {
    heading: string;
    rows: EmailDetailsTableRow[];
}
/**
 * Key/value detail block used across transactional emails (class info, payment summary).
 */
export declare function EmailDetailsTable({ heading, rows }: EmailDetailsTableProps): import("react/jsx-runtime").JSX.Element | null;
//# sourceMappingURL=EmailDetailsTable.d.ts.map