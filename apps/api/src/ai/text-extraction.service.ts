import { Injectable, BadRequestException } from '@nestjs/common';
import pdfParse from 'pdf-parse';
import { ocrPdf } from './pdf-ocr';

export interface ExtractionResult {
  text: string;
  contentHash: string;
  status: 'SUCCESS' | 'ERROR';
  error?: string;
}

@Injectable()
export class TextExtractionService {
  // Coalesce background/query extraction and avoid repeating OCR every indexing tick.
  private readonly ocrCache = new Map<string, Promise<string>>();
  async extract(buffer: Buffer, mediaType: string, filename: string): Promise<ExtractionResult> {
    const contentHash = this.computeHash(buffer);

    try {
      let text: string;

      switch (mediaType) {
        case 'application/pdf':
          text = await this.extractPdf(buffer);
          break;
        case 'text/plain':
          text = this.extractText(buffer);
          break;
        case 'text/markdown':
        case 'text/x-markdown':
          text = this.extractText(buffer);
          break;
        case 'application/json':
          text = this.extractJson(buffer);
          break;
        default:
          throw new BadRequestException(`Unsupported media type for extraction: ${mediaType}`);
      }

      return {
        text: text.trim(),
        contentHash,
        status: 'SUCCESS',
      };
    } catch (error) {
      return {
        text: '',
        contentHash,
        status: 'ERROR',
        error: error instanceof Error ? error.message : 'Unknown extraction error',
      };
    }
  }

  private async extractPdf(buffer: Buffer): Promise<string> {
    const data = await pdfParse(buffer);
    if (data.text.trim()) return data.text;
    const hash = this.computeHash(buffer);
    const cached = this.ocrCache.get(hash);
    if (cached) return cached;
    const pending: Promise<string> = ocrPdf(buffer).catch((error: unknown) => {
      // A background indexer runs every five seconds. Cache failures briefly too,
      // so an unreadable image does not continually consume an OCR worker.
      const timer = setTimeout(() => {
        if (this.ocrCache.get(hash) === pending) this.ocrCache.delete(hash);
      }, 60_000);
      timer.unref();
      throw error;
    });
    if (this.ocrCache.size >= 16) this.ocrCache.delete(this.ocrCache.keys().next().value!);
    this.ocrCache.set(hash, pending);
    return pending;
  }

  private extractText(buffer: Buffer): string {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    return decoder.decode(buffer);
  }

  private extractJson(buffer: Buffer): string {
    const text = this.extractText(buffer);
    const parsed = JSON.parse(text);
    return JSON.stringify(parsed, null, 2);
  }

  private computeHash(buffer: Buffer): string {
    const crypto = require('crypto');
    return 'sha256:' + crypto.createHash('sha256').update(buffer).digest('hex');
  }
}
