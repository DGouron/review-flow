import { formatStartupBanner } from '@/cli/startupBanner.js';
import { loadConfig } from '@/frameworks/config/configLoader.js';
import { startServer } from '@/main/server.js';
import {
  StartDaemonUseCase,
  type StartDaemonDependencies,
} from '@/modules/cli-configuration/usecases/cli/startDaemon.usecase.js';
import { yellow } from '@/shared/services/ansiColors.js';
import { openInBrowser } from '@/shared/services/browserOpener.js';
import { spawnDaemon } from '@/shared/services/daemonSpawner.js';
import { validateDependencies } from '@/shared/services/dependencyChecker.js';
import type { PidFileDeps } from '@/shared/services/pidFileManager.js';

export interface StartDependencies {
  validateDependencies: () => { name: string; installUrl: string }[];
  startServer: (port?: number) => Promise<unknown>;
  exit: (code: number) => void;
  error: (...args: unknown[]) => void;
  log: (...args: unknown[]) => void;
  startDaemonDeps: StartDaemonDependencies;
  loadStartupInfo: () => { enabledPlatforms: Array<'gitlab' | 'github'>; defaultPort: number };
  openInBrowser: (url: string) => void;
}

function showBanner(
  port: number,
  daemonPid: number | null,
  open: boolean,
  deps: StartDependencies,
): void {
  const { enabledPlatforms } = deps.loadStartupInfo();
  const banner = formatStartupBanner({ port, enabledPlatforms, daemonPid });
  for (const line of banner.lines) {
    deps.log(line);
  }
  if (open) {
    deps.openInBrowser(banner.dashboardUrl);
  }
}

export function executeStart(
  skipDependencyCheck: boolean,
  daemon: boolean,
  port: number | undefined,
  open: boolean,
  deps: StartDependencies,
): void {
  const resolvedPort = port ?? deps.loadStartupInfo().defaultPort;

  if (daemon) {
    const usecase = new StartDaemonUseCase(deps.startDaemonDeps);
    const result = usecase.execute({ daemon: true, port });

    switch (result.status) {
      case 'started':
        showBanner(resolvedPort, result.pid, open, deps);
        break;
      case 'already-running':
        deps.log(yellow(`Server already running (PID: ${result.pid}, port: ${result.port})`));
        break;
      case 'foreground':
        break;
    }
    return;
  }

  if (!skipDependencyCheck) {
    const missing = deps.validateDependencies();
    if (missing.length > 0) {
      deps.error('Missing dependencies:');
      for (const dep of missing) {
        deps.error(`  - ${dep.name}: ${dep.installUrl}`);
      }
      deps.exit(1);
      return;
    }
  }

  const startForeground = async () => {
    try {
      await deps.startServer(port);
      showBanner(resolvedPort, null, open, deps);
    } catch (err) {
      deps.error('Fatal error:', err);
      deps.exit(1);
    }
  };
  startForeground();
}

export function createStartDependencies(pidDeps: PidFileDeps): StartDependencies {
  return {
    validateDependencies,
    startServer: (port) => startServer({ portOverride: port }),
    exit: process.exit,
    error: console.error,
    log: console.log,
    startDaemonDeps: { ...pidDeps, spawnDaemon },
    loadStartupInfo: () => {
      try {
        const config = loadConfig();
        const enabledPlatforms: Array<'gitlab' | 'github'> = [
          ...new Set(config.repositories.filter((r) => r.enabled).map((r) => r.platform)),
        ];
        return { enabledPlatforms, defaultPort: config.server.port };
      } catch {
        return { enabledPlatforms: [], defaultPort: 3000 };
      }
    },
    openInBrowser,
  };
}
