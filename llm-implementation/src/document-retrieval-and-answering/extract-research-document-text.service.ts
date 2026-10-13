import { Injectable, BadRequestException } from '@nestjs/common';
import pdfParse from 'pdf-parse';

export interface ExtractionResult {
  text: string;
  contentHash: string;
  status: 'SUCCESS' | 'ERROR';
  error?: string;
}

@Injectable()
export class TextExtractionService {
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
    return data.text;
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