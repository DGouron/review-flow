import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { z } from 'zod';

import {
  languageSchema,
  type Language,
} from '@/modules/shared-kernel/entities/language/language.schema.js';
import {
  triggerModeSchema,
  type TriggerMode,
} from '@/modules/shared-kernel/entities/triggerMode/triggerMode.schema.js';

export const claudeModelSchema = z.enum(['haiku', 'sonnet', 'opus']);
export type ClaudeModel = z.infer<typeof claudeModelSchema>;

const worktreeStaleThresholdHoursSchema = z.number().int().min(1).max(720);

export const REVIEW_TIMEOUT_MINUTES_MIN = 5;
export const REVIEW_TIMEOUT_MINUTES_MAX = 480;
const DEFAULT_REVIEW_TIMEOUT_MINUTES = 15;

const reviewTimeoutMinutesSchema = z
  .number()
  .int()
  .min(REVIEW_TIMEOUT_MINUTES_MIN)
  .max(REVIEW_TIMEOUT_MINUTES_MAX);

const runtimeSettingsSchema = z.object({
  language: languageSchema,
  model: claudeModelSchema,
  worktreeStaleThresholdHours: worktreeStaleThresholdHoursSchema.default(24),
  triggerMode: triggerModeSchema.nullable().default(null),
  reviewTimeoutMinutes: reviewTimeoutMinutesSchema.default(DEFAULT_REVIEW_TIMEOUT_MINUTES),
});

type RuntimeSettings = z.infer<typeof runtimeSettingsSchema>;

type SettingsLogger = {
  warn: (message: string) => void;
};

const DEFAULT_SETTINGS: RuntimeSettings = {
  model: 'opus',
  language: 'en',
  worktreeStaleThresholdHours: 24,
  triggerMode: null,
  reviewTimeoutMinutes: DEFAULT_REVIEW_TIMEOUT_MINUTES,
};

let settings: RuntimeSettings = { ...DEFAULT_SETTINGS };
let settingsPath: string | null = null;
let logger: SettingsLogger = { warn: (message) => console.warn(message) };
let writeQueue: Promise<void> = Promise.resolve();

export function getDefaultSettingsPath(): string {
  return join(homedir(), '.claude-review', 'settings.json');
}

export function configureSettingsPath(path: string): void {
  settingsPath = path;
}

export function configureSettingsLogger(injected: SettingsLogger): void {
  logger = injected;
}

export async function loadSettingsFromDisk(): Promise<void> {
  if (!settingsPath) return;

  if (!existsSync(settingsPath)) {
    settings = { ...DEFAULT_SETTINGS };
    await persistAsync();
    return;
  }

  let raw: string;
  try {
    raw = readFileSync(settingsPath, 'utf-8');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logger.warn(
      `[runtimeSettings] failed to read settings file at ${settingsPath}: ${reason}; using defaults`,
    );
    settings = { ...DEFAULT_SETTINGS };
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    logger.warn(`[runtimeSettings] malformed JSON at ${settingsPath}; using defaults`);
    settings = { ...DEFAULT_SETTINGS };
    return;
  }

  const result = runtimeSettingsSchema.safeParse(parsed);
  if (!result.success) {
    logger.warn(`[runtimeSettings] invalid settings at ${settingsPath}; using defaults`);
    settings = { ...DEFAULT_SETTINGS };
    return;
  }

  settings = result.data;
}

async function writeAtomically(path: string, payload: string): Promise<void> {
  const temporaryPath = `${path}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(temporaryPath, payload, 'utf-8');
  await rename(temporaryPath, path);
}

function persistAsync(): Promise<void> {
  if (!settingsPath) return Promise.resolve();
  const path = settingsPath;
  const previousWrite = writeQueue;
  const enqueue = (async () => {
    await Promise.allSettled([previousWrite]);
    await writeAtomically(path, JSON.stringify(settings, null, 2));
  })();
  writeQueue = enqueue;
  return enqueue;
}

export function getModel(): ClaudeModel {
  return settings.model;
}

export async function setModel(model: ClaudeModel): Promise<void> {
  const result = claudeModelSchema.safeParse(model);
  if (!result.success) {
    throw new Error(`Invalid model: ${model}`);
  }
  settings.model = result.data;
  await persistAsync();
}

export function getDefaultLanguage(): Language {
  return settings.language;
}

export async function setDefaultLanguage(language: Language): Promise<void> {
  const result = languageSchema.safeParse(language);
  if (!result.success) {
    throw new Error(`Invalid language: ${language}`);
  }
  settings.language = result.data;
  await persistAsync();
}

export function getWorktreeStaleThresholdHours(): number {
  return settings.worktreeStaleThresholdHours;
}

export async function setWorktreeStaleThresholdHours(hours: number): Promise<void> {
  const result = worktreeStaleThresholdHoursSchema.safeParse(hours);
  if (!result.success) {
    throw new Error(`Invalid stale threshold (hours): ${hours}`);
  }
  settings.worktreeStaleThresholdHours = result.data;
  await persistAsync();
}

export function getTriggerMode(): TriggerMode | null {
  return settings.triggerMode;
}

export async function setTriggerMode(triggerMode: TriggerMode): Promise<void> {
  const result = triggerModeSchema.safeParse(triggerMode);
  if (!result.success) {
    throw new Error(`Invalid trigger mode: ${triggerMode}`);
  }
  settings.triggerMode = result.data;
  await persistAsync();
}

export function getReviewTimeoutMinutes(): number {
  return settings.reviewTimeoutMinutes;
}

/**
 * Wall-clock budget for a single Claude review session, expressed in
 * milliseconds so callers can hand it straight to awaitSessionCompletion.
 */
export function getReviewTimeoutMs(): number {
  return settings.reviewTimeoutMinutes * 60 * 1000;
}

export async function setReviewTimeoutMinutes(minutes: number): Promise<void> {
  const result = reviewTimeoutMinutesSchema.safeParse(minutes);
  if (!result.success) {
    throw new Error(
      `Invalid review timeout (minutes): ${minutes}. Use an integer between ${REVIEW_TIMEOUT_MINUTES_MIN} and ${REVIEW_TIMEOUT_MINUTES_MAX}`,
    );
  }
  settings.reviewTimeoutMinutes = result.data;
  await persistAsync();
}

export function getSettings(): RuntimeSettings {
  return { ...settings };
}

/**
 * Test-only helper. Resets module-level state (settings, path, logger, write queue).
 * Exposed because this module owns module-level mutable state; production code must
 * never call this. A proper fix would extract a SettingsRepository class with
 * constructor-injected dependencies; see PR #221 review for context.
 */
export function __resetForTestsOnly(): void {
  settings = { ...DEFAULT_SETTINGS };
  settingsPath = null;
  logger = { warn: (message) => console.warn(message) };
  writeQueue = Promise.resolve();
}
