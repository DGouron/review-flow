import type {
  NextActionsInput,
  NextActionsPort,
  NextActionsViewModel,
} from '@/modules/setup-wizard/entities/nextActions/nextActions.port.js';
import type { Platform } from '@/modules/setup-wizard/entities/projectContext/projectContext.schema.js';
import { truncateSecret } from '@/shared/services/secretGenerator.js';

export type {
  NextActionsInput,
  NextActionsViewModel,
} from '@/modules/setup-wizard/entities/nextActions/nextActions.port.js';

function eventTypeForPlatform(platform: Platform): string {
  if (platform === 'github') return 'pull_request, pull_request_review_comment';
  if (platform === 'gitlab') return 'Merge request events, Note events';
  return 'platform-specific events';
}

export class NextActionsPresenter implements NextActionsPort {
  present(input: NextActionsInput): NextActionsViewModel {
    const webhookUrl = `http://${input.host}:${input.port}/webhooks/${input.platform}`;
    const eventType = eventTypeForPlatform(input.platform);
    const maskedSecret = truncateSecret(input.webhookSecret, 16);
    const fullSecret = input.showSecrets ? input.webhookSecret : null;
    const secretDisplay = input.showSecrets ? input.webhookSecret : maskedSecret;
    const lines = [
      `Configurez le webhook sur ${input.platform}:`,
      `  URL=${webhookUrl}`,
      `  Secret=${secretDisplay}`,
      `  Events=${eventType}`,
    ];
    return { webhookUrl, eventType, maskedSecret, fullSecret, lines };
  }
}
