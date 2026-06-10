import {
  npmRegistryResponseSchema,
  type NpmRegistryResponse,
} from '@/modules/cli-configuration/entities/packageVersion/packageVersion.schema.js';
import { createGuard } from '@/shared/foundation/guard.base.js';

const npmRegistryResponseGuard = createGuard(npmRegistryResponseSchema, 'npmRegistryResponse');

export function parseNpmRegistryResponse(data: unknown): NpmRegistryResponse {
  return npmRegistryResponseGuard.parse(data);
}

export function safeParseNpmRegistryResponse(data: unknown) {
  return npmRegistryResponseGuard.safeParse(data);
}

export function isValidNpmRegistryResponse(data: unknown): data is NpmRegistryResponse {
  return npmRegistryResponseGuard.isValid(data);
}
