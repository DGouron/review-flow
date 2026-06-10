import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { z } from 'zod';

const pidFileContentSchema = z.object({
  pid: z.number(),
  startedAt: z.string(),
  port: z.number(),
});

export type PidFileContent = z.infer<typeof pidFileContentSchema>;

export interface PidFileDeps {
  readPidFile: () => PidFileContent | null;
  writePidFile: (content: PidFileContent) => void;
  removePidFile: () => void;
  isProcessRunning: (pid: number) => boolean;
}

export interface PidFileManagerDependencies {
  readFileSync: (path: string, encoding: BufferEncoding) => string;
  writeFileSync: (path: string, data: string) => void;
  unlinkSync: (path: string) => void;
  existsSync: (path: string) => boolean;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
}

const defaultDeps: PidFileManagerDependencies = {
  readFileSync: (path, encoding) => readFileSync(path, encoding),
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
    const parsed = pidFileContentSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
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
