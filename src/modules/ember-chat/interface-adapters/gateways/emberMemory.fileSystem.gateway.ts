import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { EmberMemoryGateway } from '@/modules/ember-chat/entities/emberMemory/emberMemory.gateway.js';
import { emberMemoryGuard } from '@/modules/ember-chat/entities/emberMemory/emberMemory.guard.js';
import type {
  EmberMemory,
  EmberMemoryTurn,
  EmberRecurringInsight,
} from '@/modules/ember-chat/entities/emberMemory/emberMemory.schema.js';

export interface EmberMemoryFileSystemGatewayOptions {
  homeDir: string;
}

/**
 * Ember's private per-project notebook. One file per project under
 * ~/.claude-review/ember-memory/<slug>.json — never inside the reviewed repo and
 * never a write to project state (reviews, threads, config). A corrupted or
 * unreadable notebook resolves to null so it can never block an answer.
 */
export class EmberMemoryFileSystemGateway implements EmberMemoryGateway {
  private readonly directory: string;

  constructor(options: EmberMemoryFileSystemGatewayOptions) {
    this.directory = join(options.homeDir, '.claude-review', 'ember-memory');
  }

  async load(projectPath: string): Promise<EmberMemory | null> {
    const path = this.notebookFor(projectPath);
    if (!existsSync(path)) {
      return null;
    }
    try {
      const raw = readFileSync(path, 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      const result = emberMemoryGuard.safeParse(parsed);
      return result.success ? result.data : null;
    } catch {
      return null;
    }
  }

  async appendTurn(projectPath: string, turn: EmberMemoryTurn): Promise<void> {
    const current = (await this.load(projectPath)) ?? { turns: [], insights: [] };
    this.write(projectPath, { turns: [...current.turns, turn], insights: current.insights });
  }

  async appendInsight(projectPath: string, insight: EmberRecurringInsight): Promise<void> {
    const normalized = insight.trim();
    if (normalized.length === 0) {
      return;
    }
    const current = (await this.load(projectPath)) ?? { turns: [], insights: [] };
    if (current.insights.includes(normalized)) {
      return;
    }
    this.write(projectPath, { turns: current.turns, insights: [...current.insights, normalized] });
  }

  async clear(projectPath: string): Promise<void> {
    const path = this.notebookFor(projectPath);
    if (existsSync(path)) {
      unlinkSync(path);
    }
  }

  private write(projectPath: string, memory: EmberMemory): void {
    if (!existsSync(this.directory)) {
      mkdirSync(this.directory, { recursive: true });
    }
    writeFileSync(this.notebookFor(projectPath), JSON.stringify(memory), 'utf-8');
  }

  private notebookFor(projectPath: string): string {
    const slug = projectPath.replace(/\//g, '-');
    return join(this.directory, `${slug}.json`);
  }
}
