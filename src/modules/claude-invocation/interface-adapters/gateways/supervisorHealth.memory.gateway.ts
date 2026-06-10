import type { SupervisorHealthGateway } from '@/modules/claude-invocation/entities/supervisorHealth/supervisorHealth.gateway.js';
import type {
  SupervisorHealth,
  SupervisorHealthStatus,
} from '@/modules/claude-invocation/entities/supervisorHealth/supervisorHealth.schema.js';

export class InMemorySupervisorHealthGateway implements SupervisorHealthGateway {
  private state: SupervisorHealth = {
    status: 'up',
    lastCheckAt: null,
    lastDownReason: null,
  };

  read(): SupervisorHealth {
    return { ...this.state };
  }

  update(status: SupervisorHealthStatus, reason: string | null, checkedAt: string): void {
    this.state = {
      status,
      lastCheckAt: checkedAt,
      lastDownReason: status === 'down' ? reason : null,
    };
  }
}
