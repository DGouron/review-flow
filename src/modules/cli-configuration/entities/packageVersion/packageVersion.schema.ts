import { z } from 'zod';

export const npmRegistryResponseSchema = z.object({
  version: z.string(),
});

export type NpmRegistryResponse = z.infer<typeof npmRegistryResponseSchema>;

export const versionCheckResultSchema = z.object({
  currentVersion: z.string(),
  latestVersion: z.string().nullable(),
  updateAvailable: z.boolean(),
  checkedAt: z.string(),
  installType: z.enum(['global-npm', 'source-checkout']),
});
