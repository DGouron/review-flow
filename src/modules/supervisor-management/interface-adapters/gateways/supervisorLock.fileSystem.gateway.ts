import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import type {
  SupervisorLockAcquireResult,
  SupervisorLockGateway,
} from '@/modules/supervisor-management/entities/supervisor/supervisorLock.gateway.js';

export interface SupervisorLockFileSystem {
  readFile(path: string): string | null;
  writeFile(path: string, content: string): void;
  deleteFile(path: string): void;
  ensureDirectory(path: string): void;
  isProcessAlive(pid: number): boolean;
}

export interface SupervisorLockGatewayDependencies {
  lockFilePath: string;
  currentPid: number;
  fileSystem: SupervisorLockFileSystem;
}

export function getDefaultSupervisorLockFilePath(): string {
  return join(homedir(), '.reviewflow', 'supervisor.lock');
}

export function createDefaultSupervisorLockFileSystem(): SupervisorLockFileSystem {
  return {
    readFile(path: string): string | null {
      if (!existsSync(path)) return null;
      return readFileSync(path, 'utf-8');
    },
    writeFile(path: string, content: string): void {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content, 'utf-8');
    },
    deleteFile(path: string): void {
      if (existsSync(path)) unlinkSync(path);
    },
    ensureDirectory(path: string): void {
      mkdirSync(path, { recursive: true });
    },
    isProcessAlive(pid: number): boolean {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    },
  };
}

function parsePid(content: string): number | null {
  const trimmed = content.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export class SupervisorLockFileSystemGateway implements SupervisorLockGateway {
  constructor(private readonly deps: SupervisorLockGatewayDependencies) {}

  async acquire(): Promise<SupervisorLockAcquireResult> {
    const { fileSystem, lockFilePath, currentPid } = this.deps;
    const existing = fileSystem.readFile(lockFilePath);

    if (existing !== null) {
      const ownerPid = parsePid(existing);
      if (ownerPid !== null && fileSystem.isProcessAlive(ownerPid)) {
        return { acquired: false, reason: `lock held by live pid ${ownerPid}` };
      }
    }

    fileSystem.writeFile(lockFilePath, String(currentPid));
    return { acquired: true, reason: null };
  }

  async release(): Promise<void> {
    const { fileSystem, lockFilePath, currentPid } = this.deps;
    const existing = fileSystem.readFile(lockFilePath);
    if (existing === null) return;

    const ownerPid = parsePid(existing);
    if (ownerPid !== currentPid) return;

    fileSystem.deleteFile(lockFilePath);
  }
}
