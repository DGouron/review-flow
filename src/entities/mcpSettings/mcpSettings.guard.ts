import { z } from 'zod';

const mcpServerEntrySchema = z.object({
  command: z.string(),
  args: z.array(z.string()),
});

const mcpSettingsSchema = z.object({
  mcpServers: z.record(z.string(), mcpServerEntrySchema),
});

export type McpSettings = z.infer<typeof mcpSettingsSchema>;

export function isValidMcpSettings(data: unknown): boolean {
  return mcpSettingsSchema.safeParse(data).success;
}

export function parseMcpSettings(data: unknown): McpSettings {
  return mcpSettingsSchema.passthrough().parse(data);
}

export function safeParseMcpSettings(data: unknown) {
  return mcpSettingsSchema.safeParse(data);
}

export function hasServerEntry(data: unknown, serverName: string): boolean {
  const result = mcpSettingsSchema.safeParse(data);
  if (!result.success) return false;
  return serverName in result.data.mcpServers;
}
