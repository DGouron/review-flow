import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { LOG_DIR, LOG_FILE_PATH } from './daemonPaths.js';

export function spawnDaemon(port: number | undefined): number {
  mkdirSync(LOG_DIR, { recursive: true });

  const logFd = openSync(LOG_FILE_PATH, 'a');

  const args = ['start', '--skip-dependency-check'];
  if (port !== undefined) {
    args.push('--port', String(port));
  }

  const child = spawn(process.execPath, [process.argv[1], ...args], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: { ...process.env, REVIEWFLOW_DAEMON: '1' },
  });

  child.unref();

  if (!child.pid) {
    throw new Error('Failed to spawn daemon process');
  }

  return child.pid;
}
