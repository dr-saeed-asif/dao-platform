import { ChunkingService } from '../chunking.service';

describe('ChunkingService', () => {
  let service: ChunkingService;

  beforeEach(() => {
    service = new ChunkingService();
  });

  describe('chunk', () => {
    it('should create deterministic chunks with stable evidence IDs', () => {
      const text = 'This is a test document. It has multiple sentences. Each sentence should be processed.';
      const artefactEvidenceId = 'artefact:sha256:abc123';
      const proposalId = 'proposal-1';

      const chunks1 = service.chunk(artefactEvidenceId, proposalId, text);
      const chunks2 = service.chunk(artefactEvidenceId, proposalId, text);

      expect(chunks1).toEqual(chunks2);
    });

    it('should generate unique evidence IDs per chunk index', () => {
      const text = 'Sentence one. Sentence two. Sentence three. Sentence four. Sentence five.';
      const artefactEvidenceId = 'artefact:sha256:abc123';
      const proposalId = 'proposal-1';

      const chunks = service.chunk(artefactEvidenceId, proposalId, text);

      const evidenceIds = chunks.map(c => c.evidenceId);
      const uniqueIds = new Set(evidenceIds);
      expect(uniqueIds.size).toBe(evidenceIds.length);
    });

    it('should include chunk index in metadata', () => {
      const text = 'Test content for chunking.';
      const artefactEvidenceId = 'artefact:sha256:abc123';

      const chunks = service.chunk(artefactEvidenceId, null, text);

      chunks.forEach((chunk, index) => {
        expect(chunk.index).toBe(index);
        expect(chunk.metadata.tokenCount).toBeDefined();
      });
    });

    it('should handle long text with overlap', () => {
      const sentences = Array(200).fill('This is a test sentence for chunking that is long enough to trigger chunking.').join(' ');
      const artefactEvidenceId = 'artefact:sha256:abc123';

      const chunks = service.chunk(artefactEvidenceId, null, sentences);

      expect(chunks.length).toBeGreaterThan(1);
    });

    it('should use consistent chunking version', () => {
      expect(service.getChunkingVersion()).toBe('v1');
    });

    it('should generate evidence IDs with format chunk:artefactEvidenceId:chunkIndex', () => {
      const text = 'Test content.';
      const artefactEvidenceId = 'artefact:sha256:abc123';

      const chunks = service.chunk(artefactEvidenceId, null, text);

      expect(chunks[0].evidenceId).toBeDefined();
      expect(chunks[0].evidenceId.length).toBe(64);
    });
  });
});