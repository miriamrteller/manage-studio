export const BLAST_MAX_RECIPIENTS = 500;
export const BLAST_RECIPIENT_QUERY_MAX = 200;

export const BLAST_SCOPES = ['all', 'level', 'class', 'account'] as const;
export type BlastScope = (typeof BLAST_SCOPES)[number];
