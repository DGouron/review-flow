import type { Logger } from 'pino';

import type { SupervisorGateway } from '@/modules/supervisor-management/entities/supervisor/supervisor.gateway.js';
import type { SupervisorLockGateway } from '@/modules/supervisor-management/entities/supervisor/supervisorLock.gateway.js';
import type { SupervisorStatusStore } from '@/modules/supervisor-management/entities/supervisor/supervisorStatusStore.gateway.js';
import { checkSupervisorAndRespawn } from '@/modules/supervisor-management/usecases/checkSupervisorAndRespawn.usecase.js';

export interface SupervisorSchedulerDependencies {
  supervisorGateway: SupervisorGateway;
  lockGateway: SupervisorLockGateway;
  statusStore: SupervisorStatusStore;
  logger: Logger;
  now: () => Date;
  intervalMs: number;
}

export interface SupervisorScheduler {
  stop: () => void;
}

export function startSupervisorScheduler(
  deps: SupervisorSchedulerDependencies,
): SupervisorScheduler {
  const runCheck = async (): Promise<void> => {
    try {
      await checkSupervisorAndRespawn({
        supervisorGateway: deps.supervisorGateway,
        lockGateway: deps.lockGateway,
        statusStore: deps.statusStore,
        logger: deps.logger,
        now: deps.now,
      });
    } catch (error) {
      deps.logger.error({ error }, 'Supervisor scheduler tick failed');
    }
  };

  void runCheck();
  const timer = setInterval(() => {
    void runCheck();
  }, deps.intervalMs);

  return {
    stop: () => clearInterval(timer),
  };
}
