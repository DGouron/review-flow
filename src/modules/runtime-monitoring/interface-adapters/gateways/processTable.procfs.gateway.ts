import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { ProcessTableGateway } from '@/modules/runtime-monitoring/entities/resourceUsage/processTable.gateway.js';
import type { ProcessRecord } from '@/modules/runtime-monitoring/entities/resourceUsage/resourceUsage.js';

const CLOCK_TICKS_PER_SECOND = 100;
const MEMORY_PAGE_BYTES = 4096;
const PROCESS_DIRECTORY_PATTERN = /^\d+$/;

const PARENT_PID_FIELD = 1;
const USER_TICKS_FIELD = 11;
const SYSTEM_TICKS_FIELD = 12;
const RESIDENT_PAGES_FIELD = 21;

/**
 * Parses `/proc/<pid>/stat`. The command name sits in parentheses and may hold spaces or
 * parentheses itself, so fields are counted from the last closing parenthesis.
 */
function parseStat(content: string): ProcessRecord | null {
  const commandEnd = content.lastIndexOf(')');
  if (commandEnd === -1) return null;
  const pid = Number.parseInt(content, 10);
  const fields = content
    .slice(commandEnd + 1)
    .trim()
    .split(/\s+/)
    .map(Number);
  const ticks = fields[USER_TICKS_FIELD] + fields[SYSTEM_TICKS_FIELD];
  const record = {
    pid,
    parentPid: fields[PARENT_PID_FIELD],
    cpuTimeMilliseconds: (ticks * 1000) / CLOCK_TICKS_PER_SECOND,
    memoryBytes: fields[RESIDENT_PAGES_FIELD] * MEMORY_PAGE_BYTES,
  };
  return Object.values(record).every(Number.isFinite) ? record : null;
}

export class ProcessTableProcfsGateway implements ProcessTableGateway {
  constructor(private readonly processFileSystemRoot = '/proc') {}

  async read(): Promise<ProcessRecord[] | null> {
    let entries: string[];
    try {
      entries = await readdir(this.processFileSystemRoot);
    } catch {
      return null;
    }
    const records = await Promise.all(
      entries
        .filter((entry) => PROCESS_DIRECTORY_PATTERN.test(entry))
        .map((entry) => this.readProcess(entry)),
    );
    return records.filter((record) => record !== null);
  }

  private async readProcess(pid: string): Promise<ProcessRecord | null> {
    try {
      return parseStat(await readFile(join(this.processFileSystemRoot, pid, 'stat'), 'utf-8'));
    } catch {
      return null;
    }
  }
}
