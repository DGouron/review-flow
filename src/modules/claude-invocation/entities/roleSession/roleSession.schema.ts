import { z } from 'zod';

import { sessionIdSchema } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.schema.js';
import { recordedReviewRoleSchema } from '@/modules/claude-invocation/entities/roleSession/reviewRole.js';

export const roleSessionRecordSchema = z.object({
  sessionId: sessionIdSchema,
  role: recordedReviewRoleSchema,
  launchedAt: z.string().min(1),
});

export type RoleSessionRecord = z.infer<typeof roleSessionRecordSchema>;
