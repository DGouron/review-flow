import { execFileSync as defaultExecFileSync } from 'node:child_process';
import { platform as defaultPlatform } from 'node:os';

interface BrowserOpenerDeps {
  platform: string;
  execFileSync: (command: string, args: string[]) => unknown;
}

const PLATFORM_COMMANDS: Record<string, string> = {
  linux: 'xdg-open',
  darwin: 'open',
  win32: 'start',
};

export function openInBrowser(
  url: string,
  deps: BrowserOpenerDeps = { platform: defaultPlatform(), execFileSync: defaultExecFileSync },
): void {
  const command = PLATFORM_COMMANDS[deps.platform];
  if (!command) return;

  try {
    deps.execFileSync(command, [url]);
  } catch {
    // silently ignore — missing xdg-open or similar should not crash the CLI
  }
}
