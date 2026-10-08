import { createCanvas } from '@napi-rs/canvas';
import { createWorker, OEM } from 'tesseract.js';

/** Local OCR only: source PDFs and their registered hashes are never rewritten. */
export async function ocrPdf(buffer: Buffer): Promise<string> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const language = require('@tesseract.js-data/eng') as { langPath: string; gzip: boolean };
  const loading = getDocument({ data: new Uint8Array(buffer) });
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  try {
    const pdf = await loading.promise;
    if (pdf.numPages > 20) throw new Error('PDF OCR supports up to 20 pages; upload a text-readable PDF for larger documents.');
    worker = await createWorker('eng', OEM.LSTM_ONLY, {
      langPath: language.langPath, gzip: language.gzip, cacheMethod: 'none',
    });
    const pages: string[] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(2.5, Math.sqrt(16_000_000 / (base.width * base.height)));
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      try {
        await page.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise;
        let timer: NodeJS.Timeout | undefined;
        try {
          const result = await Promise.race([
            worker.recognize(canvas.toBuffer('image/png')),
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new Error(`PDF OCR timed out on page ${number}`)), 30_000);
            }),
          ]);
          if (result.data.text.trim() && result.data.confidence < 60) {
            throw new Error(`PDF OCR confidence is too low on page ${number} (${Math.round(result.data.confidence)}%); upload a text-readable document.`);
          }
          pages.push(result.data.text.trim());
        } finally {
          clearTimeout(timer);
        }
      } finally {
        page.cleanup();
        canvas.width = 1;
        canvas.height = 1;
      }
    }
    const text = pages.join('\n\n').trim();
    if (!text) throw new Error('PDF contains no extractable text even after OCR; upload a text-readable document.');
    return text;
  } finally {
    try { await worker?.terminate(); }
    finally { await loading.destroy(); }
  }
}
