import type { EmberMemoryGateway } from '@/modules/ember-chat/entities/emberMemory/emberMemory.gateway.js';
import type {
  EmberMemory,
  EmberMemoryTurn,
  EmberRecurringInsight,
} from '@/modules/ember-chat/entities/emberMemory/emberMemory.schema.js';

/**
 * Backing store shared across gateway instances so a "restart" (a new gateway
 * over the same store) reloads what a previous instance persisted — mirroring
 * the durable filesystem gateway without touching disk.
 */
export class StubEmberMemoryStore {
  private readonly memoryByProject = new Map<string, EmberMemory>();

  read(projectPath: string): EmberMemory | null {
    const memory = this.memoryByProject.get(projectPath);
    if (memory === undefined) {
      return null;
    }
    return {
      turns: memory.turns.map((turn) => ({ ...turn })),
      insights: [...memory.insights],
    };
  }

  appendTurn(projectPath: string, turn: EmberMemoryTurn): void {
    const current = this.memoryByProject.get(projectPath) ?? { turns: [], insights: [] };
    this.memoryByProject.set(projectPath, {
      turns: [...current.turns, turn],
      insights: current.insights,
    });
  }

  appendInsight(projectPath: string, insight: EmberRecurringInsight): void {
    const normalized = insight.trim();
    if (normalized.length === 0) {
      return;
    }
    const current = this.memoryByProject.get(projectPath) ?? { turns: [], insights: [] };
    if (current.insights.includes(normalized)) {
      return;
    }
    this.memoryByProject.set(projectPath, {
      turns: current.turns,
      insights: [...current.insights, normalized],
    });
  }

  remove(projectPath: string): void {
    this.memoryByProject.delete(projectPath);
  }
}

export class StubEmberMemoryGateway implements EmberMemoryGateway {
  private corrupted = false;

  constructor(private readonly store: StubEmberMemoryStore = new StubEmberMemoryStore()) {}

  markCorrupted(): void {
    this.corrupted = true;
  }

  async load(projectPath: string): Promise<EmberMemory | null> {
    if (this.corrupted) {
      return null;
    }
    return this.store.read(projectPath);
  }

  async appendTurn(projectPath: string, turn: EmberMemoryTurn): Promise<void> {
    this.store.appendTurn(projectPath, turn);
  }

  async appendInsight(projectPath: string, insight: EmberRecurringInsight): Promise<void> {
    this.store.appendInsight(projectPath, insight);
  }

  async clear(projectPath: string): Promise<void> {
    this.store.remove(projectPath);
  }
}
