import { describe, it, expect } from 'vitest';

import { GetProjectStatsUseCase } from '@/modules/statistics-insights/usecases/stats/getProjectStats.usecase.js';
import { ProjectStatsFactory } from '@/tests/factories/projectStats.factory.js';
import { InMemoryStatsGateway } from '@/tests/stubs/stats.stub.js';

describe('GetProjectStatsUseCase', () => {
  it('returns the stored stats when the project is present', () => {
    const statsGateway = new InMemoryStatsGateway();
    statsGateway.saveProjectStats('/project', ProjectStatsFactory.create({ totalReviews: 5 }));

    const result = new GetProjectStatsUseCase(statsGateway).execute({ projectPath: '/project' });

    expect(result?.totalReviews).toBe(5);
  });

  it('returns null when the project is absent (no empty-stats fallback)', () => {
    const statsGateway = new InMemoryStatsGateway();

    const result = new GetProjectStatsUseCase(statsGateway).execute({ projectPath: '/missing' });

    expect(result).toBeNull();
  });
});
