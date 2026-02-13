import { z } from 'zod';

export const mcpServerEntrySchema = z.object({
  command: z.string(),
  args: z.array(z.string()),
});

export const mcpSettingsSchema = z.object({
  mcpServers: z.record(z.string(), mcpServerEntrySchema),
});

export type McpSettings = z.infer<typeof mcpSettingsSchema>;
