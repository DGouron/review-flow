import type { Platform } from '@/modules/setup-wizard/entities/projectContext/projectContext.schema.js';

export interface NextActionsInput {
  platform: Platform;
  host: string;
  port: number;
  webhookSecret: string;
  projectPath: string;
  showSecrets: boolean;
}

export interface NextActionsViewModel {
  webhookUrl: string;
  eventType: string;
  maskedSecret: string;
  fullSecret: string | null;
  lines: string[];
}

export interface NextActionsPort {
  present(input: NextActionsInput): NextActionsViewModel;
}
