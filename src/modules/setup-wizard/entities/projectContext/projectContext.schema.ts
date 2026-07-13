import { z } from 'zod';

export const platformSchema = z.enum(['github', 'gitlab', 'unknown']);

export type Platform = z.infer<typeof platformSchema>;

export const presetSchema = z.enum(['backend', 'frontend', 'fullstack', 'basic', 'custom']);

export type Preset = z.infer<typeof presetSchema>;

export const languageSchema = z.enum(['en', 'fr']);

export type Language = z.infer<typeof languageSchema>;

export const agentDefinitionSchema = z.object({
  name: z.string(),
  displayName: z.string(),
});

export const projectContextSchema = z.object({
  localPath: z.string().nullable(),
  platform: platformSchema.nullable(),
  preset: presetSchema.nullable(),
  language: languageSchema.nullable(),
  remoteUrl: z.string().nullable(),
  // Optional: absent from state files persisted before this field existed.
  agents: z.array(agentDefinitionSchema).nullable().optional(),
});

export type ProjectContext = z.infer<typeof projectContextSchema>;
