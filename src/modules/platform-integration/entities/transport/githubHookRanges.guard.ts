import {
  gitHubMetaResponseSchema,
  hookRangesSnapshotSchema,
  type GitHubMetaResponse,
  type HookRangesSnapshot,
} from '@/modules/platform-integration/entities/transport/githubHookRanges.schema.js';
import { createGuard } from '@/shared/foundation/guard.base.js';

const gitHubMetaResponseGuard = createGuard(gitHubMetaResponseSchema, 'gitHubMetaResponse');
const hookRangesSnapshotGuard = createGuard(hookRangesSnapshotSchema, 'hookRangesSnapshot');

export function parseGitHubMetaResponse(data: unknown): GitHubMetaResponse {
  return gitHubMetaResponseGuard.parse(data);
}

export function safeParseGitHubMetaResponse(data: unknown) {
  return gitHubMetaResponseGuard.safeParse(data);
}

export function isValidGitHubMetaResponse(data: unknown): data is GitHubMetaResponse {
  return gitHubMetaResponseGuard.isValid(data);
}

export function parseHookRangesSnapshot(data: unknown): HookRangesSnapshot {
  return hookRangesSnapshotGuard.parse(data);
}

export function safeParseHookRangesSnapshot(data: unknown) {
  return hookRangesSnapshotGuard.safeParse(data);
}

export function isValidHookRangesSnapshot(data: unknown): data is HookRangesSnapshot {
  return hookRangesSnapshotGuard.isValid(data);
}
