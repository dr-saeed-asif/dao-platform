export interface SearchResult {
  rank: number;
  score: number;
  chunkEvidenceId: string;
  artefactEvidenceId: string;
  proposalId: string | null;
  filename: string | null;
  content: string;
  metadata: Record<string, unknown>;
}

export interface SearchOptions {
  proposalId?: string;
  topK?: number;
}

export const DOCUMENT_EVIDENCE_SEARCH = Symbol('DOCUMENT_EVIDENCE_SEARCH');
export interface DocumentEvidenceSearch { search(question: string, options?: SearchOptions): Promise<SearchResult[]>; }
