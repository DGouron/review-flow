import { createGuard } from '@/shared/foundation/guard.base.js';
import { mcpSettingsSchema, type McpSettings } from '@/entities/mcpSettings/mcpSettings.schema.js';

const mcpSettingsGuard = createGuard(mcpSettingsSchema);

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
