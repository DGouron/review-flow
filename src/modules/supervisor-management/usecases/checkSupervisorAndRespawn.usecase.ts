import type { Logger } from 'pino';

import type { SupervisorGateway } from '@/modules/supervisor-management/entities/supervisor/supervisor.gateway.js';
import type { SupervisorLockGateway } from '@/modules/supervisor-management/entities/supervisor/supervisorLock.gateway.js';
import {
  createSupervisorStatus,
  type SupervisorStatus,
} from '@/modules/supervisor-management/entities/supervisor/supervisorStatus.schema.js';
import type { SupervisorStatusStore } from '@/modules/supervisor-management/entities/supervisor/supervisorStatusStore.gateway.js';

const SPAWN_FAILED_REASON = 'supervisor-spawn-failed';
const LOCK_HELD_REASON = 'supervisor-lock-held';

export interface CheckSupervisorAndRespawnDependencies {
  supervisorGateway: SupervisorGateway;
  lockGateway: SupervisorLockGateway;
  statusStore: SupervisorStatusStore;
  logger: Logger;
  now: () => Date;
}

export async function checkSupervisorAndRespawn(
  deps: CheckSupervisorAndRespawnDependencies,
): Promise<SupervisorStatus> {
  const { supervisorGateway, lockGateway, statusStore, logger, now } = deps;

  const previousState = statusStore.read().state;
  const probe = await supervisorGateway.probe();

  if (probe.state === 'up') {
    const status = createSupervisorStatus('up', null, now());
    statusStore.set(status);
    logger.info('Claude agents supervisor reachable');
    return status;
  }

  if (previousState === 'up') {
    logger.warn(
      { reason: probe.reason },
      'Claude agents supervisor went down — attempting respawn',
    );
  } else {
    logger.warn(
      { reason: probe.reason },
      'Claude agents supervisor unreachable — attempting respawn',
    );
  }

  const lock = await lockGateway.acquire();
  if (!lock.acquired) {
    logger.warn(
      { reason: lock.reason },
      'Skipping supervisor respawn: another ReviewFlow process holds the lock',
    );
    const status = createSupervisorStatus('down', LOCK_HELD_REASON, now());
    statusStore.set(status);
    return status;
  }

  try {
    const spawnResult = await supervisorGateway.spawnDetached();
    if (spawnResult.state === 'failed') {
      logger.warn({ reason: spawnResult.reason }, 'Failed to spawn Claude agents supervisor');
      const status = createSupervisorStatus('down', SPAWN_FAILED_REASON, now());
      statusStore.set(status);
      return status;
    }

    logger.info(
      { pid: spawnResult.pid },
      `Claude agents supervisor spawned (pid=${spawnResult.pid ?? 'unknown'})`,
    );
    const status = createSupervisorStatus('up', null, now());
    statusStore.set(status);
    return status;
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown spawn error';
    logger.warn({ reason }, 'Spawn attempt threw an error');
    const status = createSupervisorStatus('down', SPAWN_FAILED_REASON, now());
    statusStore.set(status);
    return status;
  } finally {
    await lockGateway.release();
  }
}
