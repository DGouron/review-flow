import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  configureSettingsPath,
  configureSettingsLogger,
  loadSettingsFromDisk,
  getDefaultLanguage,
  setDefaultLanguage,
  getModel,
  setModel,
  getTriggerMode,
  setTriggerMode,
  getReviewTimeoutMinutes,
  getReviewTimeoutMs,
  setReviewTimeoutMinutes,
  getSettings,
  __resetForTestsOnly,
  type ClaudeModel,
} from '@/frameworks/settings/runtimeSettings.js';
import type { TriggerMode } from '@/modules/shared-kernel/entities/triggerMode/triggerMode.schema.js';

describe('runtimeSettings', () => {
  describe('in-memory API (no path configured)', () => {
    beforeEach(() => {
      __resetForTestsOnly();
    });

    it('defaults language to "en"', () => {
      expect(getDefaultLanguage()).toBe('en');
    });

    it('changes language to "fr"', async () => {
      await setDefaultLanguage('fr');
      expect(getDefaultLanguage()).toBe('fr');
    });

    it('includes language in getSettings()', async () => {
      await setDefaultLanguage('fr');
      expect(getSettings().language).toBe('fr');
    });
  });

  describe('persistence', () => {
    let directory: string;
    let settingsPath: string;

    beforeEach(() => {
      directory = mkdtempSync(join(tmpdir(), 'reviewflow-settings-'));
      settingsPath = join(directory, 'settings.json');
      __resetForTestsOnly();
      configureSettingsPath(settingsPath);
    });

    afterEach(() => {
      __resetForTestsOnly();
      rmSync(directory, { recursive: true, force: true });
    });

    describe('loadSettingsFromDisk', () => {
      it('restores language and model from existing file', async () => {
        writeFileSync(settingsPath, JSON.stringify({ language: 'fr', model: 'sonnet' }));

        await loadSettingsFromDisk();

        expect(getDefaultLanguage()).toBe('fr');
        expect(getModel()).toBe('sonnet');
      });

      it('creates the file with defaults when it does not exist', async () => {
        await loadSettingsFromDisk();

        expect(existsSync(settingsPath)).toBe(true);
        const written = JSON.parse(readFileSync(settingsPath, 'utf-8'));
        expect(written).toEqual({
          language: 'en',
          model: 'opus',
          worktreeStaleThresholdHours: 24,
          triggerMode: null,
          reviewTimeoutMinutes: 15,
        });
      });

      it('falls back to defaults silently when file is malformed JSON', async () => {
        writeFileSync(settingsPath, '{ this is not valid json');

        await loadSettingsFromDisk();

        expect(getDefaultLanguage()).toBe('en');
        expect(getModel()).toBe('opus');
      });

      it('falls back to defaults silently when language is unknown', async () => {
        writeFileSync(settingsPath, JSON.stringify({ language: 'es', model: 'opus' }));

        await loadSettingsFromDisk();

        expect(getDefaultLanguage()).toBe('en');
      });

      it('falls back to defaults silently when model is unknown', async () => {
        writeFileSync(settingsPath, JSON.stringify({ language: 'fr', model: 'gpt-5' }));

        await loadSettingsFromDisk();

        expect(getModel()).toBe('opus');
      });
    });

    describe('persistence on set', () => {
      it('persists language to disk after setDefaultLanguage', async () => {
        await loadSettingsFromDisk();

        await setDefaultLanguage('fr');

        const written = JSON.parse(readFileSync(settingsPath, 'utf-8'));
        expect(written.language).toBe('fr');
      });

      it('persists model to disk after setModel', async () => {
        await loadSettingsFromDisk();

        await setModel('sonnet');

        const written = JSON.parse(readFileSync(settingsPath, 'utf-8'));
        expect(written.model).toBe('sonnet');
      });

      it('survives a simulated process restart', async () => {
        await loadSettingsFromDisk();
        await setDefaultLanguage('fr');
        await setModel('sonnet');

        __resetForTestsOnly();
        configureSettingsPath(settingsPath);
        await loadSettingsFromDisk();

        expect(getDefaultLanguage()).toBe('fr');
        expect(getModel()).toBe('sonnet');
      });

      it('writes atomically (no .tmp leftover after persist)', async () => {
        await loadSettingsFromDisk();

        await setDefaultLanguage('fr');

        const entries = readdirSync(directory);
        expect(entries.filter((name) => name.endsWith('.tmp'))).toEqual([]);
      });

      it('preserves both fields across concurrent setModel and setDefaultLanguage', async () => {
        await loadSettingsFromDisk();

        await Promise.all([setModel('sonnet'), setDefaultLanguage('fr')]);

        const written = JSON.parse(readFileSync(settingsPath, 'utf-8'));
        expect(written).toEqual({
          language: 'fr',
          model: 'sonnet',
          worktreeStaleThresholdHours: 24,
          triggerMode: null,
          reviewTimeoutMinutes: 15,
        });
      });
    });

    describe('triggerMode', () => {
      it('defaults to null when no settings file exists', async () => {
        await loadSettingsFromDisk();

        expect(getTriggerMode()).toBeNull();
      });

      it('restores triggerMode from an existing file', async () => {
        writeFileSync(
          settingsPath,
          JSON.stringify({ language: 'en', model: 'opus', triggerMode: 'semi-auto' }),
        );

        await loadSettingsFromDisk();

        expect(getTriggerMode()).toBe('semi-auto');
      });

      it('falls back to null when the persisted trigger mode is unknown', async () => {
        writeFileSync(
          settingsPath,
          JSON.stringify({ language: 'en', model: 'opus', triggerMode: 'manual' }),
        );

        await loadSettingsFromDisk();

        expect(getTriggerMode()).toBeNull();
      });

      it('persists triggerMode to disk after setTriggerMode', async () => {
        await loadSettingsFromDisk();

        await setTriggerMode('semi-auto');

        const written = JSON.parse(readFileSync(settingsPath, 'utf-8'));
        expect(written.triggerMode).toBe('semi-auto');
        expect(getTriggerMode()).toBe('semi-auto');
      });

      it('survives a simulated process restart', async () => {
        await loadSettingsFromDisk();
        await setTriggerMode('semi-auto');

        __resetForTestsOnly();
        configureSettingsPath(settingsPath);
        await loadSettingsFromDisk();

        expect(getTriggerMode()).toBe('semi-auto');
      });

      it('throws when setTriggerMode receives an unknown trigger mode', async () => {
        await loadSettingsFromDisk();

        await expect(setTriggerMode('manual' as TriggerMode)).rejects.toThrow(
          /Invalid trigger mode/,
        );
      });
    });

    describe('validation', () => {
      it('throws when setModel receives an unknown model', async () => {
        await expect(setModel('gpt-5' as ClaudeModel)).rejects.toThrow(/Invalid model/);
      });
    });

    describe('worktreeStaleThresholdHours', () => {
      it('defaults to 24 when no settings file exists', async () => {
        await loadSettingsFromDisk();

        const { getWorktreeStaleThresholdHours } =
          await import('@/frameworks/settings/runtimeSettings.js');
        expect(getWorktreeStaleThresholdHours()).toBe(24);
      });

      it('restores worktreeStaleThresholdHours from an existing file', async () => {
        writeFileSync(
          settingsPath,
          JSON.stringify({ language: 'en', model: 'opus', worktreeStaleThresholdHours: 48 }),
        );

        await loadSettingsFromDisk();
        const { getWorktreeStaleThresholdHours } =
          await import('@/frameworks/settings/runtimeSettings.js');

        expect(getWorktreeStaleThresholdHours()).toBe(48);
      });

      it('falls back to the default when the persisted value is below the minimum', async () => {
        writeFileSync(
          settingsPath,
          JSON.stringify({ language: 'en', model: 'opus', worktreeStaleThresholdHours: 0 }),
        );

        await loadSettingsFromDisk();
        const { getWorktreeStaleThresholdHours } =
          await import('@/frameworks/settings/runtimeSettings.js');

        expect(getWorktreeStaleThresholdHours()).toBe(24);
      });

      it('persists worktreeStaleThresholdHours after setWorktreeStaleThresholdHours', async () => {
        await loadSettingsFromDisk();
        const { setWorktreeStaleThresholdHours } =
          await import('@/frameworks/settings/runtimeSettings.js');

        await setWorktreeStaleThresholdHours(72);

        const written = JSON.parse(readFileSync(settingsPath, 'utf-8'));
        expect(written.worktreeStaleThresholdHours).toBe(72);
      });

      it('throws when setWorktreeStaleThresholdHours receives a value outside [1, 720]', async () => {
        await loadSettingsFromDisk();
        const { setWorktreeStaleThresholdHours } =
          await import('@/frameworks/settings/runtimeSettings.js');

        await expect(setWorktreeStaleThresholdHours(0)).rejects.toThrow(/Invalid stale threshold/);
        await expect(setWorktreeStaleThresholdHours(721)).rejects.toThrow(
          /Invalid stale threshold/,
        );
      });
    });

    describe('reviewTimeoutMinutes', () => {
      it('defaults to 15 when no settings file exists', async () => {
        await loadSettingsFromDisk();

        expect(getReviewTimeoutMinutes()).toBe(15);
      });

      it('exposes the default as milliseconds', async () => {
        await loadSettingsFromDisk();

        expect(getReviewTimeoutMs()).toBe(15 * 60 * 1000);
      });

      it('restores reviewTimeoutMinutes from an existing file', async () => {
        writeFileSync(
          settingsPath,
          JSON.stringify({ language: 'en', model: 'opus', reviewTimeoutMinutes: 90 }),
        );

        await loadSettingsFromDisk();

        expect(getReviewTimeoutMinutes()).toBe(90);
        expect(getReviewTimeoutMs()).toBe(90 * 60 * 1000);
      });

      it('falls back to the default when the persisted value is below the minimum', async () => {
        writeFileSync(
          settingsPath,
          JSON.stringify({ language: 'en', model: 'opus', reviewTimeoutMinutes: 1 }),
        );

        await loadSettingsFromDisk();

        expect(getReviewTimeoutMinutes()).toBe(15);
      });

      it('persists reviewTimeoutMinutes after setReviewTimeoutMinutes', async () => {
        await loadSettingsFromDisk();

        await setReviewTimeoutMinutes(45);

        const written = JSON.parse(readFileSync(settingsPath, 'utf-8'));
        expect(written.reviewTimeoutMinutes).toBe(45);
      });

      it('survives a simulated process restart', async () => {
        await loadSettingsFromDisk();
        await setReviewTimeoutMinutes(120);

        __resetForTestsOnly();
        configureSettingsPath(settingsPath);
        await loadSettingsFromDisk();

        expect(getReviewTimeoutMinutes()).toBe(120);
      });

      it('throws when setReviewTimeoutMinutes receives a value outside [5, 480]', async () => {
        await loadSettingsFromDisk();

        await expect(setReviewTimeoutMinutes(4)).rejects.toThrow(/Invalid review timeout/);
        await expect(setReviewTimeoutMinutes(481)).rejects.toThrow(/Invalid review timeout/);
      });

      it('throws when setReviewTimeoutMinutes receives a non-integer', async () => {
        await loadSettingsFromDisk();

        await expect(setReviewTimeoutMinutes(15.5)).rejects.toThrow(/Invalid review timeout/);
      });
    });

    describe('logger injection', () => {
      it('reports malformed JSON via the injected logger instead of console', async () => {
        const warnings: string[] = [];
        configureSettingsLogger({ warn: (message: string) => warnings.push(message) });
        writeFileSync(settingsPath, '{ not valid json');

        await loadSettingsFromDisk();

        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toMatch(/malformed json/i);
      });

      it('reports schema violation via the injected logger', async () => {
        const warnings: string[] = [];
        configureSettingsLogger({ warn: (message: string) => warnings.push(message) });
        writeFileSync(settingsPath, JSON.stringify({ language: 'es', model: 'opus' }));

        await loadSettingsFromDisk();

        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toMatch(/invalid settings/i);
      });
    });
  });
});
