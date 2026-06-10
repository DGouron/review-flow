import { join } from 'node:path';

import type {
  ReviewLogFileGateway,
  LogFileInfo,
} from '@/modules/data-lifecycle/entities/reviewLog/reviewLogFile.gateway.js';

interface LogFileEntry {
  mtime: string;
  size: number;
}

export class InMemoryReviewLogFileGateway implements ReviewLogFileGateway {
  private files = new Map<string, LogFileEntry>();

  async listLogFiles(projectPath: string): Promise<LogFileInfo[]> {
    const prefix = this.getLogsDirectory(projectPath) + '/';
    const logFiles: LogFileInfo[] = [];

    for (const [filePath, entry] of this.files.entries()) {
      if (!filePath.startsWith(prefix)) continue;

      const filename = filePath.slice(prefix.length);
      logFiles.push({
        filename,
        path: filePath,
        mtime: entry.mtime,
        size: entry.size,
      });
    }

    return logFiles;
  }

  async deleteLogFile(projectPath: string, filename: string): Promise<boolean> {
    const filePath = join(this.getLogsDirectory(projectPath), filename);
    return this.files.delete(filePath);
  }

  getLogsDirectory(projectPath: string): string {
    return join(projectPath, '.claude', 'reviews', 'logs');
  }

  addLogFile(projectPath: string, filename: string, entry: LogFileEntry): void {
    const filePath = join(this.getLogsDirectory(projectPath), filename);
    this.files.set(filePath, entry);
  }

  clear(): void {
    this.files.clear();
  }
}
