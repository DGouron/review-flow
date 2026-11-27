import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const LOCK_RETRY_DELAY_MS = 50;
const STALE_LOCK_AGE_MS = 120_000;

export interface ExclusiveFileLockOptions {
  waitLimitMs: number;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function tokenIn(lockPath: string): string | null {
  try {
    return readFileSync(lockPath, 'utf-8');
  } catch {
    return null;
  }
}

/** Removes the lock only while it still holds `token`, so a lock taken over meanwhile survives. */
function removeIfStillHeldBy(lockPath: string, token: string): void {
  if (tokenIn(lockPath) === token) rmSync(lockPath, { force: true });
}

function tryCreate(lockPath: string, token: string): boolean {
  try {
    writeFileSync(lockPath, token, { flag: 'wx' });
    return true;
  } catch {
    return false;
  }
}

function removeIfStale(lockPath: string): void {
  const staleToken = tokenIn(lockPath);
  try {
    if (staleToken !== null && Date.now() - statSync(lockPath).mtimeMs > STALE_LOCK_AGE_MS) {
      removeIfStillHeldBy(lockPath, staleToken);
    }
  } catch {
    return;
  }
}

async function acquire(lockPath: string, token: string, waitLimitMs: number): Promise<void> {
  mkdirSync(dirname(lockPath), { recursive: true });
  const deadline = Date.now() + waitLimitMs;
  while (!tryCreate(lockPath, token)) {
    if (Date.now() > deadline) throw new Error(`another launch holds ${lockPath}`);
    removeIfStale(lockPath);
    await delay(LOCK_RETRY_DELAY_MS);
  }
}

/** Runs `work` while this process alone holds the lock file; a lock older than 2 min is stale. */
export async function withExclusiveFileLock<Result>(
  lockPath: string,
  work: () => Promise<Result>,
  options: ExclusiveFileLockOptions,
): Promise<Result> {
  const token = randomUUID();
  await acquire(lockPath, token, options.waitLimitMs);
  try {
    return await work();
  } finally {
    removeIfStillHeldBy(lockPath, token);
  }
}
