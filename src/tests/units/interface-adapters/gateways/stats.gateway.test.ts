import { describe, it, expect } from 'vitest';
import { InMemoryStatsGateway } from '../../../stubs/stats.stub.js';
import { ProjectStatsFactory, ReviewStatsFactory } from '../../../factories/projectStats.factory.js';

describe('StatsGateway', () => {
  describe('loadProjectStats', () => {
    it('should return null when no stats exist', () => {
      const gateway = new InMemoryStatsGateway();

      const result = gateway.loadProjectStats('/some/project');

      expect(result).toBeNull();
    });

    it('should return saved stats', () => {
      const gateway = new InMemoryStatsGateway();
      const stats = ProjectStatsFactory.create({ totalReviews: 5 });

      gateway.saveProjectStats('/my/project', stats);
      const result = gateway.loadProjectStats('/my/project');

      expect(result).toBeDefined();
      expect(result?.totalReviews).toBe(5);
    });
  });

  describe('saveProjectStats', () => {
    it('should update lastUpdated on save', () => {
      const gateway = new InMemoryStatsGateway();
      const stats = ProjectStatsFactory.create({ lastUpdated: '2020-01-01T00:00:00Z' });

      gateway.saveProjectStats('/my/project', stats);
      const result = gateway.loadProjectStats('/my/project');

      expect(result?.lastUpdated).not.toBe('2020-01-01T00:00:00Z');
    });

    it('should preserve reviews array', () => {
      const gateway = new InMemoryStatsGateway();
      const reviews = [
        ReviewStatsFactory.create({ mrNumber: 1 }),
        ReviewStatsFactory.create({ mrNumber: 2 }),
      ];
      const stats = ProjectStatsFactory.withReviews(reviews);

      gateway.saveProjectStats('/my/project', stats);
      const result = gateway.loadProjectStats('/my/project');

      expect(result?.reviews).toHaveLength(2);
    });
  });

  describe('statsFileExists', () => {
    it('should return false when no stats exist', () => {
      const gateway = new InMemoryStatsGateway();

      expect(gateway.statsFileExists('/unknown/project')).toBe(false);
    });

    it('should return true when stats exist', () => {
      const gateway = new InMemoryStatsGateway();
      gateway.saveProjectStats('/my/project', ProjectStatsFactory.create());

      expect(gateway.statsFileExists('/my/project')).toBe(true);
    });
  });
});
