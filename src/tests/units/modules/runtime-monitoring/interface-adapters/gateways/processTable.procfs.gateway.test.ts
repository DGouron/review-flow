import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ProcessTableProcfsGateway } from '@/modules/runtime-monitoring/interface-adapters/gateways/processTable.procfs.gateway.js';

function statLine(
  pid: number,
  command: string,
  fields: { parentPid: number; user: number; system: number; rssPages: number },
): string {
  const { parentPid, user, system, rssPages } = fields;
  const head = `${pid} (${command}) S ${parentPid} ${pid} ${pid} 0 -1 4194560 100 0 0 0`;
  const tail = `0 0 20 0 12 0 5000 123456789 ${rssPages} 18446744073709551615`;
  return `${head} ${user} ${system} ${tail}\n`;
}

describe('ProcessTableProcfsGateway', () => {
  let processFileSystemRoot: string;

  function writeProcess(pid: string, content: string): void {
    mkdirSync(join(processFileSystemRoot, pid), { recursive: true });
    writeFileSync(join(processFileSystemRoot, pid, 'stat'), content);
  }

  beforeEach(() => {
    processFileSystemRoot = mkdtempSync(join(tmpdir(), 'procfs-'));
  });

  afterEach(() => {
    rmSync(processFileSystemRoot, { recursive: true, force: true });
  });

  it('reads parent, CPU time and resident memory of every process', async () => {
    writeProcess(
      '4100',
      statLine(4100, 'claude', { parentPid: 1, user: 150, system: 50, rssPages: 2560 }),
    );
    writeProcess(
      '4101',
      statLine(4101, 'node', { parentPid: 4100, user: 3, system: 0, rssPages: 100 }),
    );

    const records = await new ProcessTableProcfsGateway(processFileSystemRoot).read();

    expect(records).toEqual(
      expect.arrayContaining([
        { pid: 4100, parentPid: 1, cpuTimeMilliseconds: 2000, memoryBytes: 2560 * 4096 },
        { pid: 4101, parentPid: 4100, cpuTimeMilliseconds: 30, memoryBytes: 100 * 4096 },
      ]),
    );
    expect(records).toHaveLength(2);
  });

  it('reads a command name holding spaces and parentheses', async () => {
    writeProcess(
      '77',
      statLine(77, 'tmux: server (1)', { parentPid: 1, user: 1, system: 1, rssPages: 1 }),
    );

    const records = await new ProcessTableProcfsGateway(processFileSystemRoot).read();

    expect(records).toEqual([
      { pid: 77, parentPid: 1, cpuTimeMilliseconds: 20, memoryBytes: 4096 },
    ]);
  });

  it('ignores non-process entries, unreadable and malformed process files', async () => {
    writeProcess('self', statLine(1, 'init', { parentPid: 0, user: 1, system: 1, rssPages: 1 }));
    mkdirSync(join(processFileSystemRoot, '900'));
    writeProcess('901', 'garbage');
    writeProcess('902', statLine(902, 'ok', { parentPid: 1, user: 0, system: 0, rssPages: 0 }));

    const records = await new ProcessTableProcfsGateway(processFileSystemRoot).read();

    expect(records).toEqual([{ pid: 902, parentPid: 1, cpuTimeMilliseconds: 0, memoryBytes: 0 }]);
  });

  it('reports the table as unavailable when the machine has no process file system', async () => {
    const records = await new ProcessTableProcfsGateway(
      join(processFileSystemRoot, 'missing'),
    ).read();

    expect(records).toBeNull();
  });
});
