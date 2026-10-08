import { TextExtractionService } from '../text-extraction.service';
import pdfParse from 'pdf-parse';
import { ocrPdf } from '../pdf-ocr';

jest.mock('pdf-parse');
jest.mock('../pdf-ocr', () => ({ ocrPdf: jest.fn() }));

describe('TextExtractionService', () => {
  let service: TextExtractionService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new TextExtractionService();
  });

  afterEach(() => jest.useRealTimers());

  describe('extract', () => {
    it('uses and caches local OCR only when a PDF has no extractable text', async () => {
      jest.mocked(pdfParse).mockResolvedValue({ text: '\n  ' } as any);
      jest.mocked(ocrPdf).mockResolvedValue('Actual scanned document text.');
      const buffer = Buffer.from('scanned-pdf');
      const [first, second] = await Promise.all([
        service.extract(buffer, 'application/pdf', 'scan.pdf'),
        service.extract(buffer, 'application/pdf', 'scan.pdf'),
      ]);
      expect(first.status).toBe('SUCCESS');
      expect(first.text).toBe('Actual scanned document text.');
      expect(second).toEqual(first);
      expect(ocrPdf).toHaveBeenCalledTimes(1);
    });

    it('keeps text-readable PDFs on the existing extraction path', async () => {
      jest.mocked(pdfParse).mockResolvedValue({ text: 'Readable PDF' } as any);
      expect((await service.extract(Buffer.from('pdf'), 'application/pdf', 'doc.pdf')).text).toBe('Readable PDF');
      expect(ocrPdf).not.toHaveBeenCalled();
    });

    it('reports OCR failure and permits a later extraction attempt', async () => {
      jest.useFakeTimers();
      jest.mocked(pdfParse).mockResolvedValue({ text: '' } as any);
      jest.mocked(ocrPdf).mockRejectedValueOnce(new Error('No readable text')).mockResolvedValueOnce('Recovered text');
      const buffer = Buffer.from('pdf');
      const failed = await service.extract(buffer, 'application/pdf', 'scan.pdf');
      expect(failed.status).toBe('ERROR');
      expect(failed.error).toBe('No readable text');
      expect((await service.extract(buffer, 'application/pdf', 'scan.pdf')).status).toBe('ERROR');
      expect(ocrPdf).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(60_000);
      expect((await service.extract(buffer, 'application/pdf', 'scan.pdf')).text).toBe('Recovered text');
    });

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
