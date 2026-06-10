import {
  createSupervisorStatus,
  type SupervisorStatus,
} from '@/modules/supervisor-management/entities/supervisor/supervisorStatus.schema.js';
import type { SupervisorStatusStore } from '@/modules/supervisor-management/entities/supervisor/supervisorStatusStore.gateway.js';

const EPOCH = new Date(0);

export class InMemorySupervisorStatusStore implements SupervisorStatusStore {
  private current: SupervisorStatus = createSupervisorStatus('unknown', null, EPOCH);

  read(): SupervisorStatus {
    return {
      state: this.current.state,
      reason: this.current.reason,
      lastCheckedAt: new Date(this.current.lastCheckedAt.getTime()),
    };
  }

  set(status: SupervisorStatus): void {
    this.current = {
      state: status.state,
      reason: status.reason,
      lastCheckedAt: new Date(status.lastCheckedAt.getTime()),
    };
  }
}
