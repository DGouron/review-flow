import type { ProjectStats } from '@/modules/statistics-insights/entities/stats/projectStats.js';
import type { StatsGateway } from '@/modules/statistics-insights/entities/stats/stats.gateway.js';
import type { UseCase } from '@/shared/foundation/usecase.base.js';

export interface GetProjectStatsInput {
  projectPath: string;
}

export class GetProjectStatsUseCase implements UseCase<GetProjectStatsInput, ProjectStats | null> {
  constructor(private readonly statsGateway: StatsGateway) {}

  execute(input: GetProjectStatsInput): ProjectStats | null {
    return this.statsGateway.loadProjectStats(input.projectPath);
  }
}
