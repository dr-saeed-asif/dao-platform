import { TextExtractionService } from '../text-extraction.service';

describe('TextExtractionService', () => {
  let service: TextExtractionService;

  beforeEach(() => {
    service = new TextExtractionService();
  });

  describe('extract', () => {
    it('should extract text from TXT', async () => {
      const buffer = Buffer.from('Hello world', 'utf-8');
      const result = await service.extract(buffer, 'text/plain', 'test.txt');

      expect(result.status).toBe('SUCCESS');
      expect(result.text).toBe('Hello world');
      expect(result.contentHash).toContain('sha256:');
    });

    it('should extract text from MD', async () => {
      const buffer = Buffer.from('# Header\n\nContent', 'utf-8');
      const result = await service.extract(buffer, 'text/markdown', 'test.md');

      expect(result.status).toBe('SUCCESS');
      expect(result.text).toBe('# Header\n\nContent');
    });

    it('should extract and format JSON', async () => {
      const buffer = Buffer.from('{"key": "value"}', 'utf-8');
      const result = await service.extract(buffer, 'application/json', 'test.json');

      expect(result.status).toBe('SUCCESS');
      expect(result.text).toContain('"key"');
      expect(result.text).toContain('"value"');
    });

    it('should fail on invalid JSON', async () => {
      const buffer = Buffer.from('{invalid}', 'utf-8');
      const result = await service.extract(buffer, 'application/json', 'test.json');

      expect(result.status).toBe('ERROR');
      expect(result.error).toBeDefined();
    });

    it('should fail on unsupported media type', async () => {
      const buffer = Buffer.from('test', 'utf-8');
      const result = await service.extract(buffer, 'image/png', 'test.png');

      expect(result.status).toBe('ERROR');
      expect(result.error).toContain('Unsupported media type');
    });

    it('should compute consistent content hash', async () => {
      const buffer = Buffer.from('test content', 'utf-8');
      const result1 = await service.extract(buffer, 'text/plain', 'test.txt');
      const result2 = await service.extract(buffer, 'text/plain', 'test.txt');

      expect(result1.contentHash).toBe(result2.contentHash);
    });
  });
});