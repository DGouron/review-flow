import type { ChangedFile } from '@/modules/shared-kernel/entities/diffSizeGate/diffSizeGate.js';

export class ChangedFilesFactory {
  static create(overrides: Partial<ChangedFile> = {}): ChangedFile {
    return {
      path: 'src/example.ts',
      additions: 50,
      deletions: 10,
      ...overrides,
    };
  }

  static list(files: Array<Partial<ChangedFile>>): ChangedFile[] {
    return files.map((file) => ChangedFilesFactory.create(file));
  }
}
