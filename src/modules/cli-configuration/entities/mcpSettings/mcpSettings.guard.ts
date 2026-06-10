import {
  mcpSettingsSchema,
  type McpSettings,
} from '@/modules/cli-configuration/entities/mcpSettings/mcpSettings.schema.js';
import { createGuard } from '@/shared/foundation/guard.base.js';

const mcpSettingsGuard = createGuard(mcpSettingsSchema, 'mcpSettings');

export type { McpSettings };

export const isValidMcpSettings: (data: unknown) => data is McpSettings = mcpSettingsGuard.isValid;
export const safeParseMcpSettings = mcpSettingsGuard.safeParse;

export function parseMcpSettings(data: unknown): McpSettings {
  return mcpSettingsSchema.passthrough().parse(data);
}

export function hasServerEntry(data: unknown, serverName: string): boolean {
  const result = mcpSettingsGuard.safeParse(data);
  if (!result.success) return false;
  return serverName in result.data.mcpServers;
}
