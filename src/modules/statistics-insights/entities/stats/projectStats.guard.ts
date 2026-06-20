import { projectStatsSchema } from '@/modules/statistics-insights/entities/stats/projectStats.schema.js';
import { createGuard } from '@/shared/foundation/guard.base.js';

const projectStatsGuard = createGuard(projectStatsSchema, 'projectStats');

export const isValidProjectStats = projectStatsGuard.isValid;
export const safeParseProjectStats = projectStatsGuard.safeParse;
