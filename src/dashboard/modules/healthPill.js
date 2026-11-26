/**
 * Dashboard module — single system status pill (SPEC-230).
 *
 * Folds Claude CLI, the platform CLI, live updates, worktrees and the version
 * into one tone, and renders the pill with its detail popover.
 */

import { escapeHtml } from './html.js';

/** @typedef {'ok' | 'warn' | 'error' | 'checking' | 'neutral'} Tone */

function serviceTone(state) {
  if (state === 'ok') return 'ok';
  if (state === 'error') return 'error';
  return 'checking';
}

function platformLine(platform) {
  const labelKey = platform.kind === 'gitlab' ? 'health.platform.gitlab' : 'health.platform';
  if (platform.kind === null) {
    return {
      key: 'platform',
      labelKey,
      tone: 'neutral',
      valueKey: 'health.platform.none',
      value: null,
    };
  }
  return {
    key: 'platform',
    labelKey,
    tone: serviceTone(platform.state),
    valueKey: null,
    value: platform.detail,
  };
}

function updatesLine(connection) {
  const tone = connection === 'websocket' ? 'ok' : connection === 'polling' ? 'warn' : 'error';
  return {
    key: 'updates',
    labelKey: 'health.updates',
    tone,
    valueKey: `health.updates.${connection}`,
    value: null,
  };
}

function worktreesLine(worktrees) {
  if (!worktrees)
    return {
      key: 'worktrees',
      labelKey: 'health.worktrees',
      tone: 'neutral',
      valueKey: null,
      value: null,
    };
  const tone = worktrees.failed > 0 ? 'warn' : 'ok';
  return {
    key: 'worktrees',
    labelKey: 'health.worktrees',
    tone,
    valueKey: null,
    value: null,
    worktrees,
  };
}

function versionLine(version) {
  const tone = version.updateAvailable ? 'warn' : 'neutral';
  return {
    key: 'version',
    labelKey: 'health.version',
    tone,
    valueKey: null,
    value: version.current,
    version,
  };
}

function overallTone(lines) {
  const coreTones = lines
    .filter((line) => line.key !== 'updates' || line.tone === 'error')
    .map((line) => line.tone);
  if (coreTones.includes('error')) return 'error';
  if (coreTones.includes('checking')) return 'checking';
  if (coreTones.includes('warn')) return 'warn';
  return 'ok';
}

/**
 * @param {{
 *   claude: { state: string, detail: string | null },
 *   platform: { kind: string | null, state: string, detail: string | null },
 *   connection: string,
 *   worktrees: { active: number, disk: string, failed: number } | null,
 *   version: { current: string, latest: string | null, updateAvailable: boolean },
 * }} input
 */
export function buildHealthModel(input) {
  const lines = [
    {
      key: 'claude',
      labelKey: 'health.claude',
      tone: serviceTone(input.claude.state),
      valueKey: null,
      value: input.claude.detail,
    },
    platformLine(input.platform),
    updatesLine(input.connection),
    worktreesLine(input.worktrees),
    versionLine(input.version),
  ];
  const tone = overallTone(lines);
  return { tone, labelKey: `health.label.${tone}`, lines };
}

function lineValue(line, t) {
  if (line.valueKey) return t(line.valueKey);
  if (line.key === 'worktrees' && line.worktrees) {
    const summary = t('health.worktrees.summary', {
      active: line.worktrees.active,
      disk: line.worktrees.disk,
    });
    return line.worktrees.failed > 0
      ? `${summary} · ${t('health.worktrees.failed', { count: line.worktrees.failed })}`
      : summary;
  }
  if (line.key === 'version' && line.version?.updateAvailable && line.version.latest) {
    return `${line.version.current} · ${t('health.version.available', { version: line.version.latest })}`;
  }
  if (line.tone === 'checking') return t('health.checking');
  return line.value ?? '';
}

/**
 * @param {ReturnType<typeof buildHealthModel>} model
 * @param {(key: string, params?: Record<string, string | number>) => string} t
 * @returns {string}
 */
export function renderHealthPillHtml(model, t) {
  return `<span class="dot dot-${model.tone}" aria-hidden="true"></span>${escapeHtml(t(model.labelKey))}`;
}

/**
 * @param {ReturnType<typeof buildHealthModel>} model
 * @param {(key: string, params?: Record<string, string | number>) => string} t
 * @returns {string}
 */
export function renderHealthLinesHtml(model, t) {
  return model.lines
    .map(
      (line) =>
        `<div class="health-line"><span class="dot dot-${line.tone}" aria-hidden="true"></span><span class="health-line-label">${escapeHtml(t(line.labelKey))}</span><span class="health-line-value">${escapeHtml(lineValue(line, t))}</span></div>`,
    )
    .join('');
}
