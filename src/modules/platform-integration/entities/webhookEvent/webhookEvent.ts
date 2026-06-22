import type { Language } from '@/modules/shared-kernel/entities/language/language.schema.js';
import type { Platform } from '@/modules/tracking/entities/tracking/reviewRequestTracking.gateway.js';

export interface WebhookEventBase {
  platform: Platform;
  projectPath: string;
  localPath: string;
  mergeRequestNumber: number;
}

export interface WebhookEventAssignedBy {
  username: string;
  displayName: string | null;
}

export type WebhookEvent =
  | ({
      type: 'review-requested';
      mergeRequestUrl: string;
      sourceBranch: string;
      targetBranch: string;
      title: string;
      description: string | null;
      assignedBy: WebhookEventAssignedBy;
      skill: string;
      language: Language | null;
    } & WebhookEventBase)
  | ({
      type: 'followup-push';
      mergeRequestUrl: string;
      sourceBranch: string;
      targetBranch: string;
    } & WebhookEventBase)
  | ({ type: 'close' } & WebhookEventBase)
  | ({ type: 'merge' } & WebhookEventBase)
  | ({ type: 'approve'; reviewId: number | null } & WebhookEventBase)
  | { type: 'ignored'; reason: string };
