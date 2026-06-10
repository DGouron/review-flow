import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));

export function readVersion(): string {
  const packageJsonPath = join(currentDir, '..', '..', '..', 'package.json');
  const raw = readFileSync(packageJsonPath, 'utf-8');
  return JSON.parse(raw).version;
}

export function printHelp(): void {
  console.log(`reviewflow - Automated code review for GitLab/GitHub

Usage:
  reviewflow [command] [options]

Commands:
  init                     Interactive setup wizard
  start                    Start the review server (default)
  stop                     Stop the running daemon
  status                   Show server status
  logs                     Show daemon logs
  validate                 Validate configuration
  discover                 Scan and add repositories to existing config
  followup-importants      Trigger followups for pending-approval MRs with Important issues

Discover options:
  --scan-path <path>       Custom scan path (repeatable)
  --max-depth <n>          Max directory depth (default: 3)

Init options:
  -y, --yes                Accept all defaults (non-interactive)
  --skip-mcp               Skip MCP server configuration
  --show-secrets           Display full webhook secrets
  --scan-path <path>       Custom scan path (repeatable)

Start options:
  -d, --daemon             Run as background daemon
  -p, --port <port>        Server port (default: from config)
  -o, --open               Open dashboard in default browser
  --skip-dependency-check  Skip external dependency verification

Stop options:
  -f, --force              Force stop (SIGKILL instead of SIGTERM)

Status options:
  --json                   Output status as JSON

Logs options:
  -f, --follow             Follow log output (tail -f)
  -n, --lines <count>      Number of lines to show (default: 20)

Validate options:
  --fix                    Auto-fix correctable issues

Followup-importants options:
  -p, --project <path>     Scan specific project only
  -y, --yes                Skip confirmation prompt

General options:
  -v, --version            Show version
  -h, --help               Show this help
`);
}

export const DEFAULT_SCAN_PATHS = [
  join(homedir(), 'Documents'),
  join(homedir(), 'Projects'),
  join(homedir(), 'Development'),
  join(homedir(), 'dev'),
  join(homedir(), 'repos'),
];

export function getGitRemoteUrl(localPath: string): string | null {
  try {
    const result = execSync('git remote get-url origin', {
      cwd: localPath,
      encoding: 'utf-8',
      timeout: 5000,
    });
    return result.trim().replace(/\.git$/, '');
  } catch {
    return null;
  }
}
