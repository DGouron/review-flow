import { homedir } from 'node:os';
import { join } from 'node:path';

const CONFIG_DIR = join(homedir(), '.config', 'reviewflow');

export const PID_FILE_PATH = join(CONFIG_DIR, 'reviewflow.pid');
export const LOG_FILE_PATH = join(CONFIG_DIR, 'logs', 'reviewflow.log');
export const LOG_DIR = join(CONFIG_DIR, 'logs');

export const WORKTREE_BASE_DIR = join(homedir(), '.reviewflow', 'worktrees');
