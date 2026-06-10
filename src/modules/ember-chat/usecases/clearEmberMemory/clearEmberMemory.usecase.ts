import type { EmberMemoryGateway } from '@/modules/ember-chat/entities/emberMemory/emberMemory.gateway.js';

export interface ClearEmberMemoryDependencies {
  memory: EmberMemoryGateway;
  projectPath: string;
}

export async function clearEmberMemory(dependencies: ClearEmberMemoryDependencies): Promise<void> {
  await dependencies.memory.clear(dependencies.projectPath);
}
