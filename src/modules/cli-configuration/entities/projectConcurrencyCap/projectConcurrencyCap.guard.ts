import {
  projectConcurrencyCapSchema,
  type ProjectConcurrencyCap,
} from '@/modules/cli-configuration/entities/projectConcurrencyCap/projectConcurrencyCap.schema.js';
import { createGuard } from '@/shared/foundation/guard.base.js';

export const projectConcurrencyCapGuard = createGuard<ProjectConcurrencyCap>(
  projectConcurrencyCapSchema,
  'projectConcurrencyCap',
);
