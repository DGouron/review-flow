import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface PidFileContent {
  pid: number;
  startedAt: string;
  port: number;
}

export interface PidFileManagerDependencies {
  readFileSync: (path: string, encoding: string) => string;
  writeFileSync: (path: string, data: string) => void;
  unlinkSync: (path: string) => void;
  existsSync: (path: string) => boolean;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
}

const defaultDeps: PidFileManagerDependencies = {
  readFileSync: (path, encoding) => readFileSync(path, encoding as BufferEncoding),
  writeFileSync,
  unlinkSync,
  existsSync,
  mkdirSync: (path, options) => mkdirSync(path, options),
};

export function readPidFile(
  pidPath: string,
  deps: PidFileManagerDependencies = defaultDeps,
): PidFileContent | null {
  if (!deps.existsSync(pidPath)) {
    return null;
  }
  try {
    const raw = deps.readFileSync(pidPath, 'utf-8');
    return JSON.parse(raw) as PidFileContent;
  } catch {
    return null;
  }
}

export function writePidFile(
  pidPath: string,
  content: PidFileContent,
  deps: PidFileManagerDependencies = defaultDeps,
): void {
  deps.mkdirSync(dirname(pidPath), { recursive: true });
  deps.writeFileSync(pidPath, JSON.stringify(content, null, 2));
}

export function removePidFile(
  pidPath: string,
  deps: PidFileManagerDependencies = defaultDeps,
): void {
  if (deps.existsSync(pidPath)) {
    deps.unlinkSync(pidPath);
  }
}

export function pidFileExists(
  pidPath: string,
  deps: PidFileManagerDependencies = defaultDeps,
): boolean {
  return deps.existsSync(pidPath);
}
