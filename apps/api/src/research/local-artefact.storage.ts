import { link, mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { isAbsolute, relative, resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sha256 } from '@dao-platform/database';

@Injectable()
export class LocalArtefactStorage {
  private readonly root: string;
  constructor(config: ConfigService) {
    this.root = resolve(process.cwd(), config.get<string>('ARTEFACT_STORAGE_DIR', '../../data/artefacts'));
  }
  async put(storageKey: string, bytes: Buffer): Promise<void> {
    const destination = this.safePath(storageKey);
    await mkdir(resolve(destination, '..'), { recursive: true });
    const temporary = `${destination}.${randomUUID()}.tmp`;
    await writeFile(temporary, bytes, { flag: 'wx' });
    try {
      try { await link(temporary, destination); }
      catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        if (sha256(await readFile(destination)) !== sha256(bytes)) throw new Error('Stored artefact content hash mismatch.');
      }
    } finally { await unlink(temporary); }
  }
  async get(storageKey: string): Promise<Buffer> {
    const path = this.safePath(storageKey);
    await stat(path);
    return readFile(path);
  }
  private safePath(storageKey: string): string {
    const path = resolve(this.root, storageKey);
    const rel = relative(this.root, path);
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Invalid storage key.');
    return path;
  }
}
