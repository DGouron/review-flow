import { join } from 'node:path';
import { homedir } from 'node:os';

export function getConfigDir(): string {
  const platform = process.platform;

  let base: string;
  if (process.env.XDG_CONFIG_HOME) {
    base = process.env.XDG_CONFIG_HOME;
  } else if (platform === 'darwin') {
    base = join(homedir(), 'Library', 'Application Support');
  } else if (platform === 'win32') {
    base = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming');
  } else {
    base = join(homedir(), '.config');
  }

  return join(base, 'reviewflow');
}
