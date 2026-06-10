import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  SupervisorLockFileSystemGateway,
  createDefaultSupervisorLockFileSystem,
  getDefaultSupervisorLockFilePath,
  type SupervisorLockFileSystem,
} from '@/modules/supervisor-management/interface-adapters/gateways/supervisorLock.fileSystem.gateway.js';

class FakeFileSystem implements SupervisorLockFileSystem {
  files = new Map<string, string>();
  ensuredDirs: string[] = [];
  alivePids = new Set<number>();

  readFile(path: string): string | null {
    return this.files.get(path) ?? null;
  }

  writeFile(path: string, content: string): void {
    this.files.set(path, content);
  }

  deleteFile(path: string): void {
    this.files.delete(path);
  }

  ensureDirectory(path: string): void {
    this.ensuredDirs.push(path);
  }

  isProcessAlive(pid: number): boolean {
    return this.alivePids.has(pid);
  }
}

describe('SupervisorLockFileSystemGateway', () => {
  let fileSystem: FakeFileSystem;

  beforeEach(() => {
    fileSystem = new FakeFileSystem();
  });

  it('acquires the lock when no lock file exists, writing the current pid', async () => {
    const gateway = new SupervisorLockFileSystemGateway({
      lockFilePath: '/lock',
      currentPid: 1000,
      fileSystem,
    });

    const result = await gateway.acquire();

    expect(result.acquired).toBe(true);
    expect(fileSystem.files.get('/lock')).toBe('1000');
  });

  it('refuses to acquire when the lock file already exists and the owner is alive', async () => {
    fileSystem.files.set('/lock', '2222');
    fileSystem.alivePids.add(2222);

    const gateway = new SupervisorLockFileSystemGateway({
      lockFilePath: '/lock',
      currentPid: 1000,
      fileSystem,
    });

    const result = await gateway.acquire();

    expect(result.acquired).toBe(false);
    expect(result.reason).toMatch(/2222/);
    expect(fileSystem.files.get('/lock')).toBe('2222');
  });

  it('takes over a stale lock when the recorded pid is dead', async () => {
    fileSystem.files.set('/lock', '9999');

    const gateway = new SupervisorLockFileSystemGateway({
      lockFilePath: '/lock',
      currentPid: 1000,
      fileSystem,
    });

    const result = await gateway.acquire();

    expect(result.acquired).toBe(true);
    expect(fileSystem.files.get('/lock')).toBe('1000');
  });

  it('treats a corrupted lock file (non-integer) as stale and takes over', async () => {
    fileSystem.files.set('/lock', 'garbage');

    const gateway = new SupervisorLockFileSystemGateway({
      lockFilePath: '/lock',
      currentPid: 1000,
      fileSystem,
    });

    const result = await gateway.acquire();

    expect(result.acquired).toBe(true);
    expect(fileSystem.files.get('/lock')).toBe('1000');
  });

  it('releases the lock only when we still own it', async () => {
    const gateway = new SupervisorLockFileSystemGateway({
      lockFilePath: '/lock',
      currentPid: 1000,
      fileSystem,
    });
    await gateway.acquire();

    await gateway.release();

    expect(fileSystem.files.has('/lock')).toBe(false);
  });

  it('does not delete the lock on release when ownership has changed', async () => {
    fileSystem.files.set('/lock', '5555');

    const gateway = new SupervisorLockFileSystemGateway({
      lockFilePath: '/lock',
      currentPid: 1000,
      fileSystem,
    });

    await gateway.release();

    expect(fileSystem.files.get('/lock')).toBe('5555');
  });

  it('is a no-op on release when no lock file exists', async () => {
    const gateway = new SupervisorLockFileSystemGateway({
      lockFilePath: '/lock',
      currentPid: 1000,
      fileSystem,
    });

    await gateway.release();

    expect(fileSystem.files.has('/lock')).toBe(false);
  });
});

describe('getDefaultSupervisorLockFilePath', () => {
  it('points at the reviewflow supervisor lock under the home directory', () => {
    expect(getDefaultSupervisorLockFilePath()).toBe(
      join(homedir(), '.reviewflow', 'supervisor.lock'),
    );
  });
});

describe('createDefaultSupervisorLockFileSystem (integration with real filesystem)', () => {
  let baseDir: string;

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), 'supervisor-lock-'));
  });

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });

  it('returns null when reading a file that does not exist', () => {
    const fileSystem = createDefaultSupervisorLockFileSystem();

    expect(fileSystem.readFile(join(baseDir, 'missing.lock'))).toBe(null);
  });

  it('writes a file creating parent directories, then reads it back', () => {
    const fileSystem = createDefaultSupervisorLockFileSystem();
    const lockPath = join(baseDir, 'nested', 'supervisor.lock');

    fileSystem.writeFile(lockPath, '4242');

    expect(fileSystem.readFile(lockPath)).toBe('4242');
    expect(readFileSync(lockPath, 'utf-8')).toBe('4242');
  });

  it('ensures a directory exists', () => {
    const fileSystem = createDefaultSupervisorLockFileSystem();
    const dirPath = join(baseDir, 'ensured');

    fileSystem.ensureDirectory(dirPath);

    fileSystem.writeFile(join(dirPath, 'child.lock'), 'ok');
    expect(fileSystem.readFile(join(dirPath, 'child.lock'))).toBe('ok');
  });

  it('deletes an existing file and is a no-op on a missing one', () => {
    const fileSystem = createDefaultSupervisorLockFileSystem();
    const lockPath = join(baseDir, 'to-delete.lock');
    writeFileSync(lockPath, '1');

    fileSystem.deleteFile(lockPath);
    expect(fileSystem.readFile(lockPath)).toBe(null);

    fileSystem.deleteFile(lockPath);
    expect(fileSystem.readFile(lockPath)).toBe(null);
  });

  it('reports the current process as alive and a fabricated pid as dead', () => {
    const fileSystem = createDefaultSupervisorLockFileSystem();

    expect(fileSystem.isProcessAlive(process.pid)).toBe(true);
    expect(fileSystem.isProcessAlive(2_147_483_646)).toBe(false);
  });
});
