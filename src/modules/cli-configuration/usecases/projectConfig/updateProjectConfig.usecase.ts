import type { ProjectConfig } from '@/config/projectConfig.js';
import { validateProjectConcurrencyCap } from '@/modules/cli-configuration/entities/projectConcurrencyCap/projectConcurrencyCap.valueObject.js';
import type { ProjectConfigGateway } from '@/modules/cli-configuration/entities/projectConfig/projectConfig.gateway.js';
import type { Language } from '@/modules/shared-kernel/entities/language/language.schema.js';
import type { UseCase } from '@/shared/foundation/usecase.base.js';

export const EDITABLE_PROJECT_CONFIG_KEYS = [
  'language',
  'defaultModel',
  'reviewSkill',
  'reviewFollowupSkill',
  'externalLink',
  'qualityThreshold',
  'maxConcurrentReviews',
] as const;

export const EXTERNAL_LINK_PATTERN = /^https:\/\/.+/;
const FORBIDDEN_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const QUALITY_THRESHOLD_INVALID_MESSAGE = 'qualityThreshold must be an integer between 0 and 10';

const SUPPORTED_LANGUAGES: readonly Language[] = ['en', 'fr'];
const SUPPORTED_MODELS: readonly ProjectConfig['defaultModel'][] = ['haiku', 'sonnet', 'opus'];

export type ProjectConfigPatch = Partial<
  Pick<
    ProjectConfig,
    'language' | 'defaultModel' | 'reviewSkill' | 'reviewFollowupSkill' | 'externalLink'
  >
> & {
  qualityThreshold?: number | null;
  maxConcurrentReviews?: number | null;
};

export interface UpdateProjectConfigInput {
  path: string;
  patch: ProjectConfigPatch;
}

export type UpdateProjectConfigResult =
  | { status: 'success'; config: ProjectConfig }
  | { status: 'invalid'; reason: string }
  | { status: 'not-found' }
  | { status: 'malformed' }
  | { status: 'io-error'; reason: string };

function validateExternalLink(value: string): { ok: true } | { ok: false; reason: string } {
  if (value === '') return { ok: true };
  if (value.startsWith('http://')) {
    return { ok: false, reason: 'Le lien doit être en HTTPS' };
  }
  if (FORBIDDEN_SCHEME_PATTERN.test(value) && !EXTERNAL_LINK_PATTERN.test(value)) {
    return { ok: false, reason: 'URL invalide' };
  }
  if (!EXTERNAL_LINK_PATTERN.test(value)) {
    return { ok: false, reason: 'URL invalide' };
  }
  return { ok: true };
}

function validateQualityThreshold(value: number): { ok: true } | { ok: false; reason: string } {
  if (!Number.isInteger(value) || value < 0 || value > 10) {
    return { ok: false, reason: QUALITY_THRESHOLD_INVALID_MESSAGE };
  }
  return { ok: true };
}

function pickWhitelisted(patch: ProjectConfigPatch): ProjectConfigPatch {
  const sanitized: ProjectConfigPatch = {};
  for (const key of EDITABLE_PROJECT_CONFIG_KEYS) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      const value = patch[key];
      if (value !== undefined) {
        Object.assign(sanitized, { [key]: value });
      }
    }
  }
  return sanitized;
}

const SUPPORTED_LANGUAGE_VALUES: readonly string[] = SUPPORTED_LANGUAGES;
const SUPPORTED_MODEL_VALUES: readonly string[] = SUPPORTED_MODELS;

function isSupportedLanguage(value: unknown): value is Language {
  return typeof value === 'string' && SUPPORTED_LANGUAGE_VALUES.includes(value);
}

function isSupportedModel(value: unknown): value is ProjectConfig['defaultModel'] {
  return typeof value === 'string' && SUPPORTED_MODEL_VALUES.includes(value);
}

function mergeConfig(current: ProjectConfig, patch: ProjectConfigPatch): ProjectConfig {
  let merged: ProjectConfig = { ...current };
  if (patch.language !== undefined && isSupportedLanguage(patch.language)) {
    merged.language = patch.language;
  }
  if (patch.defaultModel !== undefined && isSupportedModel(patch.defaultModel)) {
    merged.defaultModel = patch.defaultModel;
  }
  if (patch.reviewSkill !== undefined) {
    merged.reviewSkill = patch.reviewSkill;
  }
  if (patch.reviewFollowupSkill !== undefined) {
    merged.reviewFollowupSkill = patch.reviewFollowupSkill;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'externalLink')) {
    if (patch.externalLink === undefined || patch.externalLink === '') {
      const { externalLink: _omitted, ...withoutLink } = merged;
      merged = withoutLink;
    } else {
      merged.externalLink = patch.externalLink;
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'qualityThreshold')) {
    if (patch.qualityThreshold === null || patch.qualityThreshold === undefined) {
      const { qualityThreshold: _omitted, ...withoutThreshold } = merged;
      merged = withoutThreshold;
    } else {
      merged.qualityThreshold = patch.qualityThreshold;
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'maxConcurrentReviews')) {
    if (patch.maxConcurrentReviews === null || patch.maxConcurrentReviews === undefined) {
      const { maxConcurrentReviews: _omitted, ...withoutCap } = merged;
      merged = withoutCap;
    } else {
      merged.maxConcurrentReviews = patch.maxConcurrentReviews;
    }
  }
  return merged;
}

export class UpdateProjectConfigUseCase implements UseCase<
  UpdateProjectConfigInput,
  UpdateProjectConfigResult
> {
  constructor(
    private readonly gateway: ProjectConfigGateway,
    private readonly onUpdated?: (config: ProjectConfig) => void,
  ) {}

  execute(input: UpdateProjectConfigInput): UpdateProjectConfigResult {
    const sanitized = pickWhitelisted(input.patch);

    if (typeof sanitized.externalLink === 'string') {
      const linkValidation = validateExternalLink(sanitized.externalLink);
      if (!linkValidation.ok) {
        return { status: 'invalid', reason: linkValidation.reason };
      }
    }

    if (typeof sanitized.qualityThreshold === 'number') {
      const thresholdValidation = validateQualityThreshold(sanitized.qualityThreshold);
      if (!thresholdValidation.ok) {
        return { status: 'invalid', reason: thresholdValidation.reason };
      }
    }

    if (Object.prototype.hasOwnProperty.call(sanitized, 'maxConcurrentReviews')) {
      const raw = sanitized.maxConcurrentReviews;
      if (raw !== null) {
        const capValidation = validateProjectConcurrencyCap(raw);
        if (!capValidation.ok) {
          return { status: 'invalid', reason: capValidation.reason };
        }
      }
    }

    const readResult = this.gateway.read(input.path);
    if (readResult.status === 'not-found') {
      return { status: 'not-found' };
    }
    if (readResult.status === 'malformed') {
      return { status: 'malformed' };
    }

    const merged = mergeConfig(readResult.config, sanitized);

    const writeResult = this.gateway.write(input.path, merged);
    if (!writeResult.ok) {
      return { status: 'io-error', reason: writeResult.reason };
    }

    if (this.onUpdated) {
      this.onUpdated(merged);
    }

    return { status: 'success', config: merged };
  }
}
