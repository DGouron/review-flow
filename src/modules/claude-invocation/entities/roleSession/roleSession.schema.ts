import { z } from 'zod';

import { sessionIdSchema } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.schema.js';
import { reviewRoleSchema } from '@/modules/claude-invocation/entities/roleSession/reviewRole.js';

export const roleSessionRecordSchema = z.object({
  sessionId: sessionIdSchema,
  role: reviewRoleSchema,
  launchedAt: z.string().min(1),
});

export type RoleSessionRecord = z.infer<typeof roleSessionRecordSchema>;
