import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
function optionalRowKey(row) {
    if (row.optionalRowToken)
        return row.optionalRowToken;
    const value = row.value.trim();
    if (value.startsWith('{{') && value.endsWith('}}')) {
        return value.slice(2, -2);
    }
    return undefined;
}
/**
 * Key/value detail block used across transactional emails (class info, payment summary).
 */
export function EmailDetailsTable({ heading, rows }) {
    if (rows.length === 0)
        return null;
    return (_jsx("table", { style: {
            width: '100%',
            borderCollapse: 'collapse',
            backgroundColor: '#f9fafb',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            marginBottom: '24px',
        }, children: _jsxs("tbody", { children: [_jsx("tr", { children: _jsx("td", { colSpan: 2, style: { padding: '12px 16px 4px', fontWeight: 700, fontSize: '15px' }, children: heading }) }), rows.map((row) => {
                    const rowKey = optionalRowKey(row);
                    return (_jsxs("tr", { ...(rowKey ? { 'data-ms-opt-row': rowKey } : {}), children: [_jsx("td", { style: {
                                    padding: '4px 16px',
                                    fontSize: '14px',
                                    color: '#6b7280',
                                    width: '35%',
                                    verticalAlign: 'top',
                                }, children: row.label }), _jsx("td", { style: { padding: '4px 16px', fontSize: '14px', color: '#111827', fontWeight: 600 }, children: row.value })] }, row.label));
                }), _jsx("tr", { children: _jsx("td", { colSpan: 2, style: { height: '8px' } }) })] }) }));
}
