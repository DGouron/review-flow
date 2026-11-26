/**
 * Dashboard module — Worktrees view (SPEC-231).
 *
 * Renders the worktree pool overview (GET /api/worktrees) as counters, a
 * table that never overflows the page, the sweep and report retention card,
 * and the worktrees in error. Keeps the `data-action` hooks the dashboard
 * binds: sweep, force-cleanup, purge-reports.
 */

import { escapeHtml } from './html.js';
import { formatBytes } from './worktreePanel.js';

/** @typedef {(key: string, params?: Record<string, string | number>) => string} Translate */

/**
 * @param {number} ageSeconds
 * @param {Translate} t
 * @returns {string}
 */
export function formatWriteAge(ageSeconds, t) {
  const minutes = Math.max(0, Math.floor(ageSeconds / 60));
  if (minutes < 60) return t('worktree.age.minutes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('worktree.age.hours', { count: hours });
  return t('queue.age.days', { count: Math.floor(hours / 24) });
}

/**
 * @param {string} nextSweepAt
 * @param {number} nowMs
 * @param {Translate} t
 * @returns {string}
 */
export function formatNextSweep(nextSweepAt, nowMs, t) {
  const nextMs = Date.parse(nextSweepAt);
  if (Number.isNaN(nextMs)) return String(nextSweepAt ?? '');
  const totalMinutes = Math.round((nextMs - nowMs) / 60000);
  if (totalMinutes <= 0) return t('worktree.sweep.imminent');
  return t('worktree.sweep.in', {
    hours: Math.floor(totalMinutes / 60),
    minutes: String(totalMinutes % 60).padStart(2, '0'),
  });
}

function shortPath(path) {
  const segments = String(path).split('/').filter(Boolean);
  return segments.length > 1 ? `…/${segments.at(-1)}` : String(path);
}

function renderCounters(pool, t) {
  const counters = [
    ['worktree.stat.total', pool.totalCount],
    ['worktree.stat.active', pool.activeCount],
    ['worktree.stat.idle', pool.idleCount],
    ['worktree.stat.stale', pool.staleCount],
    ['worktree.stat.disk', formatBytes(pool.totalSizeBytes)],
  ];
  return `<div class="metric-grid metric-grid-5">${counters
    .map(
      ([key, value]) =>
        `<div class="metric-cell"><div class="metric-label">${escapeHtml(t(key))}</div><div class="metric-value mono">${escapeHtml(String(value))}</div></div>`,
    )
    .join('')}</div>`;
}

function renderRows(pool, t, options) {
  return pool.groups
    .flatMap((group) =>
      group.worktrees.map((row) => ({
        ...row,
        projectPath: group.projectPath,
        platform: group.platform,
      })),
    )
    .map((row) => {
      const title = options.titleOf(row.projectPath, row.mrNumber);
      const prefix = row.platform === 'gitlab' ? '!' : '#';
      const subject = title
        ? `<span class="worktree-subject">${escapeHtml(title)}</span>`
        : `<span class="worktree-subject tone-none">${escapeHtml(row.projectPath)}</span>`;
      return `<tr data-status="${escapeHtml(row.status)}">
  <td class="cell-pr"><span class="mr-number">${prefix}${escapeHtml(String(row.mrNumber))}</span>${subject}</td>
  <td><span class="meta-item"><span class="dot dot-status-${escapeHtml(row.status)}" aria-hidden="true"></span>${escapeHtml(t(`worktree.status.${row.status}`))}</span></td>
  <td class="mono">${escapeHtml(formatBytes(row.sizeBytes))}</td>
  <td>${escapeHtml(formatWriteAge(row.ageSeconds, t))}</td>
  <td class="cell-path mono" title="${escapeHtml(row.path)}">${escapeHtml(shortPath(row.path))}</td>
</tr>`;
    })
    .join('');
}

function renderTable(pool, t, options) {
  if (pool.totalCount === 0)
    return `<div class="queue-empty">${escapeHtml(t('worktree.empty'))}</div>`;
  const headers = ['pr', 'status', 'size', 'lastWrite', 'path']
    .map((key) => `<th scope="col">${escapeHtml(t(`worktree.column.${key}`))}</th>`)
    .join('');
  return `<div class="table-scroll"><table class="data-table"><thead><tr>${headers}</tr></thead><tbody>${renderRows(pool, t, options)}</tbody></table></div>`;
}

function renderSweepCard(pool, t, options) {
  const lastSweep = pool.lastSweep
    ? t('worktree.sweep.lastValue', {
        date: new Date(pool.lastSweep.ranAt).toLocaleString(),
        removed: pool.lastSweep.removed,
        failures: pool.lastSweep.failures,
      })
    : t('worktree.lastSweep.never');
  const fact = (labelKey, value) =>
    `<div><div class="metric-label">${escapeHtml(t(labelKey))}</div><div class="fact-value">${escapeHtml(value)}</div></div>`;
  const purgeLabel = options.purgeArmed ? t('worktree.purge.confirm') : t('worktree.purge');
  return `<section class="card sweep-card" aria-label="${escapeHtml(t('worktree.sweep.now'))}">
  ${fact('worktree.sweep.last', lastSweep)}
  ${fact('worktree.sweep.next', formatNextSweep(pool.nextSweepAt, options.nowMs, t))}
  ${fact('worktree.retention', t('worktree.retention.value', { days: options.retentionDays }))}
  <div class="grow"></div>
  <button type="button" class="btn" data-action="sweep"><span class="worktree-sweep-label">${escapeHtml(t('worktree.sweep.now'))}</span></button>
  <button type="button" class="btn${options.purgeArmed ? ' btn-primary' : ' btn-ghost'}" data-action="purge-reports">${escapeHtml(purgeLabel)}</button>
</section>`;
}

function renderDegraded(pool, t) {
  const degraded = Array.isArray(pool.degraded) ? pool.degraded : [];
  if (degraded.length === 0) {
    return `<div class="shell-footer"><span class="footer-item"><span class="dot dot-ok" aria-hidden="true"></span>${escapeHtml(t('worktree.healthy'))}</span></div>`;
  }
  const alerts = degraded
    .map(
      (row) =>
        `<div class="degraded-row"><span class="dot dot-error" aria-hidden="true"></span><div class="degraded-text"><strong>#${escapeHtml(String(row.mrNumber))} · ${escapeHtml(row.reasonLabel)}</strong><span>${escapeHtml(row.recommendedAction)}</span></div><button type="button" class="btn" data-action="force-cleanup" data-platform="${escapeHtml(row.platform)}" data-project-path="${escapeHtml(row.projectPath)}" data-mr-number="${escapeHtml(String(row.mrNumber))}">${escapeHtml(t('worktree.forceCleanup'))}</button></div>`,
    )
    .join('');
  return `<section class="card degraded" aria-label="${escapeHtml(t('worktree.degraded', { count: degraded.length }))}"><div class="view-subtitle">${escapeHtml(t('worktree.degraded', { count: degraded.length }))}</div>${alerts}</section>`;
}

/**
 * @param {Record<string, any>} pool view model returned by GET /api/worktrees
 * @param {Translate} t
 * @param {{ nowMs: number, retentionDays: number, titleOf: (projectPath: string, mrNumber: number) => string | null, purgeArmed: boolean }} options
 * @returns {string}
 */
export function renderWorktreeViewHtml(pool, t, options) {
  return `<p class="view-subtitle">${escapeHtml(t('worktree.view.subtitle'))}</p>
<section class="card">${renderCounters(pool, t)}${renderTable(pool, t, options)}</section>
${renderSweepCard(pool, t, options)}
${renderDegraded(pool, t)}`;
}
