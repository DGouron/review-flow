import { readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import type {
  ReviewLogFileGateway,
  LogFileInfo,
} from '@/modules/data-lifecycle/interface-adapters/gateways/reviewLogFile.gateway.js';

const LOG_FILE_PATTERN = /\.(log|json)$/;

export class FileSystemReviewLogFileGateway implements ReviewLogFileGateway {
  async listLogFiles(projectPath: string): Promise<LogFileInfo[]> {
    const logsDirectory = this.getLogsDirectory(projectPath);
    const logFiles: LogFileInfo[] = [];

    try {
      const files = await readdir(logsDirectory);

      for (const filename of files) {
        if (!LOG_FILE_PATTERN.test(filename)) continue;

        try {
          const filePath = join(logsDirectory, filename);
          const fileStat = await stat(filePath);
          logFiles.push({
            filename,
            path: filePath,
            mtime: fileStat.mtime.toISOString(),
            size: fileStat.size,
          });
        } catch {
          // Skip files we cannot stat
        }
      }
    } catch {
      // Directory does not exist or is not readable
    }

    return logFiles;
  }

  async deleteLogFile(projectPath: string, filename: string): Promise<boolean> {
    const filePath = join(this.getLogsDirectory(projectPath), filename);

    try {
      await unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }

  getLogsDirectory(projectPath: string): string {
    return join(projectPath, '.claude', 'reviews', 'logs');
  }
}
