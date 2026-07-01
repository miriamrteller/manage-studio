export const BLAST_MAX_RECIPIENTS = 500;

export const BLAST_SCOPES = ['all', 'level', 'class'] as const;
export type BlastScope = (typeof BLAST_SCOPES)[number];
