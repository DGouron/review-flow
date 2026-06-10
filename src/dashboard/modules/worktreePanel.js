/**
 * Dashboard module — worktree pool panel (SPEC-173).
 * Humble object: pure functions, no global state, no direct DOM access here.
 * Animation choreography lives in the consumer (index.html) and styles.css.
 *
 * Visual DNA: "Agentic OS" — see project_agentic_os_design_dna.md.
 */

/**
 * @typedef {'active' | 'idle' | 'stale'} WorktreeRowStatus
 */

/**
 * @typedef {Object} WorktreeRowViewModel
 * @property {number} mrNumber
 * @property {string} path
 * @property {string} mtime
 * @property {number} ageSeconds
 * @property {number | null} sizeBytes
 * @property {WorktreeRowStatus} status
 */

/**
 * @typedef {Object} WorktreeGroupViewModel
 * @property {'gitlab' | 'github'} platform
 * @property {string} projectPath
 * @property {WorktreeRowViewModel[]} worktrees
 */

/**
 * @typedef {Object} LastSweepViewModel
 * @property {string} ranAt
 * @property {number} removed
 * @property {number} failures
 * @property {number} scanned
 */

/**
 * @typedef {'stale' | 'orphan-git-lock' | 'unresolved-conflict'} DegradedReasonCode
 */

/**
 * @typedef {Object} CleanupEndpointPayload
 * @property {'gitlab' | 'github'} platform
 * @property {string} projectPath
 * @property {number} mrNumber
 */

/**
 * @typedef {Object} DegradedRowViewModel
 * @property {number} mrNumber
 * @property {'gitlab' | 'github'} platform
 * @property {string} projectPath
 * @property {string} path
 * @property {DegradedReasonCode} reasonCode
 * @property {string} reasonLabel
 * @property {string} detectedAtIso
 * @property {string} recommendedAction
 * @property {CleanupEndpointPayload} cleanupEndpointPayload
 */

/**
 * @typedef {Object} WorktreePanelViewModel
 * @property {number} totalCount
 * @property {number} totalSizeBytes
 * @property {number} activeCount
 * @property {number} idleCount
 * @property {number} staleCount
 * @property {string} nextSweepAt
 * @property {LastSweepViewModel | null} lastSweep
 * @property {WorktreeGroupViewModel[]} groups
 * @property {number} degradedCount
 * @property {DegradedRowViewModel[]} degraded
 */

/**
 * @typedef {{ status: 'ok' }
 *        | { status: 'conflict' }
 *        | { status: 'not-found' }
 *        | { status: 'error'; reason?: string }} ForceCleanupResult
 */

/**
 * @typedef {Object} WorktreeTotals
 * @property {number} total
 * @property {number} active
 * @property {number} idle
 * @property {number} stale
 */

/**
 * @typedef {Object} NullableWorktreeTotals
 * @property {number | null} total
 * @property {number | null} active
 * @property {number | null} idle
 * @property {number | null} stale
 */

/**
 * @typedef {{ status: 'ok'; payload: { ranAt: string; removed: number; failures: number; scanned: number } }
 *        | { status: 'conflict'; startedAt: string }
 *        | { status: 'error'; reason?: string }} ManualSweepResult
 */

/**
 * @param {string | number | null | undefined} text
 * @returns {string}
 */
function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * @param {number | null} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

/**
 * @param {number} ageSeconds
 * @returns {string}
 */
export function formatRelativeAge(ageSeconds) {
  if (ageSeconds < 60) return `${ageSeconds}s`;
  const minutes = Math.floor(ageSeconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/**
 * @param {string} mtime
 * @returns {string}
 */
function formatMtime(mtime) {
  const date = new Date(mtime);
  if (Number.isNaN(date.getTime())) return mtime;
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(
    date.getUTCHours(),
  )}:${pad(date.getUTCMinutes())}`;
}

/**
 * @param {string} path
 * @returns {string}
 */
function truncatePathMiddle(path) {
  if (path.length <= 48) return path;
  return `${path.slice(0, 24)}…${path.slice(-20)}`;
}

/**
 * @param {WorktreeRowStatus} status
 * @returns {string}
 */
export function renderWorktreeStatusBadge(status) {
  if (status === 'active') {
    return '<span class="worktree-status worktree-status-active" data-status="active"><span class="worktree-status-glyph">●</span><span class="worktree-status-label">ACTIVE</span></span>';
  }
  if (status === 'idle') {
    return '<span class="worktree-status worktree-status-idle" data-status="idle"><span class="worktree-status-glyph">○</span><span class="worktree-status-label">IDLE</span></span>';
  }
  return '<span class="worktree-status worktree-status-stale" data-status="stale"><span class="worktree-status-glyph">◆</span><span class="worktree-status-label">STALE</span></span>';
}

/**
 * @returns {string}
 */
export function renderWorktreeEmptyState() {
  return `
    <div class="worktree-empty">
      <svg class="worktree-empty-illustration" viewBox="0 0 120 120" width="96" height="96" aria-hidden="true">
        <g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
          <path d="M60 102 V62" />
          <path d="M60 62 L36 42" />
          <path d="M60 62 L84 42" />
          <path d="M36 42 L26 26" />
          <path d="M36 42 L48 26" />
          <path d="M84 42 L72 26" />
          <path d="M84 42 L94 26" />
          <circle cx="26" cy="26" r="3" />
          <circle cx="48" cy="26" r="3" />
          <circle cx="72" cy="26" r="3" />
          <circle cx="94" cy="26" r="3" class="worktree-empty-leaf" />
          <rect x="50" y="100" width="20" height="6" rx="0" />
        </g>
      </svg>
      <div class="worktree-empty-title">// POOL EMPTY</div>
      <div class="worktree-empty-subtitle">No worktree on disk. The next scheduled review will materialize one.</div>
    </div>
  `;
}

/**
 * @param {WorktreeRowViewModel} row
 * @param {string} groupLabel  Display label for the row's group (e.g. "gitlab · group/project").
 * @returns {string}
 */
function renderRow(row, groupLabel) {
  const escapedPath = escapeHtml(row.path);
  const truncatedPath = escapeHtml(truncatePathMiddle(row.path));
  const truncatedLabel = groupLabel.length > 28 ? `${groupLabel.slice(0, 24)}…` : groupLabel;
  return `
    <tr class="worktree-row" data-status="${escapeHtml(row.status)}">
      <td class="worktree-cell worktree-cell-status">${renderWorktreeStatusBadge(row.status)}</td>
      <td class="worktree-cell worktree-cell-identity">
        <span class="worktree-project" title="${escapeHtml(groupLabel)}">${escapeHtml(truncatedLabel)}</span>
        <span class="worktree-mr">#${escapeHtml(row.mrNumber)}</span>
      </td>
      <td class="worktree-cell worktree-cell-path"><span title="${escapedPath}">${truncatedPath}</span></td>
      <td class="worktree-cell worktree-cell-age">${escapeHtml(formatRelativeAge(row.ageSeconds))}</td>
      <td class="worktree-cell worktree-cell-size">${escapeHtml(formatBytes(row.sizeBytes))}</td>
      <td class="worktree-cell worktree-cell-mtime">${escapeHtml(formatMtime(row.mtime))}</td>
    </tr>
  `;
}

/**
 * @param {WorktreeGroupViewModel} group
 * @returns {string}
 */
function renderGroupRows(group) {
  return group.worktrees
    .map((row) => renderRow(row, `${group.platform} · ${group.projectPath}`))
    .join('');
}

/**
 * Flattens the view model status counts into a single record consumed by the
 * animation layer (count-up + change-flash). The presenter is the single source
 * of truth for these counts — this helper just renames the keys.
 *
 * @param {WorktreePanelViewModel} viewModel
 * @returns {WorktreeTotals}
 */
export function snapshotTotals(viewModel) {
  return {
    total: viewModel.totalCount,
    active: viewModel.activeCount,
    idle: viewModel.idleCount,
    stale: viewModel.staleCount,
  };
}

/**
 * Returns the metric keys whose value changed between two snapshots. A key
 * whose previous value is null (cold start) is ignored — only transitions
 * between known values are surfaced.
 *
 * @param {NullableWorktreeTotals} previous
 * @param {WorktreeTotals} next
 * @returns {Array<'total' | 'active' | 'idle' | 'stale'>}
 */
export function computeChangedMetricKeys(previous, next) {
  const keys = /** @type {Array<'total' | 'active' | 'idle' | 'stale'>} */ ([
    'total',
    'active',
    'idle',
    'stale',
  ]);
  return keys.filter((key) => previous[key] !== null && previous[key] !== next[key]);
}

/**
 * @param {LastSweepViewModel | null} lastSweep
 * @returns {string}
 */
function renderLastSweep(lastSweep) {
  if (lastSweep === null) {
    return '<span class="worktree-lastsweep-value">never</span>';
  }
  const ranAt = formatMtime(lastSweep.ranAt);
  return `<span class="worktree-lastsweep-value">${escapeHtml(ranAt)} UTC · removed ${escapeHtml(lastSweep.removed)} · failures ${escapeHtml(lastSweep.failures)} · scanned ${escapeHtml(lastSweep.scanned)}</span>`;
}

/**
 * @param {string} nextSweepAt
 * @returns {string}
 */
function renderNextSweep(nextSweepAt) {
  const date = new Date(nextSweepAt);
  if (Number.isNaN(date.getTime())) return escapeHtml(nextSweepAt);
  const diffMs = date.getTime() - Date.now();
  if (diffMs <= 0) return 'imminent';
  const totalMinutes = Math.round(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `in ${minutes}m`;
  const pad = (value) => String(value).padStart(2, '0');
  return `in ${hours}h ${pad(minutes)}m`;
}

/**
 * @param {DegradedRowViewModel} row
 * @returns {string}
 */
function renderDegradedAlertBlock(row) {
  return `
    <div class="worktree-alert" data-severity="critical" data-reason="${escapeHtml(row.reasonCode)}">
      <div class="worktree-alert-frame">
        <span class="worktree-alert-label">// ALERT</span>
        <span class="worktree-alert-reason">${escapeHtml(row.reasonLabel)}</span>
      </div>
      <div class="worktree-alert-body">
        <span class="worktree-alert-identity">${escapeHtml(row.platform)} · ${escapeHtml(row.projectPath)} · #${escapeHtml(row.mrNumber)}</span>
        <span class="worktree-alert-action">${escapeHtml(row.recommendedAction)}</span>
      </div>
      <button
        class="worktree-cleanup-button"
        type="button"
        data-action="force-cleanup"
        data-platform="${escapeHtml(row.platform)}"
        data-project-path="${escapeHtml(row.projectPath)}"
        data-mr-number="${escapeHtml(row.mrNumber)}"
      >FORCE CLEANUP</button>
    </div>
  `;
}

/**
 * @param {DegradedRowViewModel[]} degraded
 * @returns {string}
 */
export function renderDegradedAlerts(degraded) {
  if (!Array.isArray(degraded) || degraded.length === 0) return '';
  return `<div class="worktree-alerts">${degraded.map(renderDegradedAlertBlock).join('')}</div>`;
}

/**
 * @param {WorktreePanelViewModel} viewModel
 * @returns {string}
 */
export function renderWorktreeSection(viewModel) {
  const isEmpty = viewModel.totalCount === 0;
  const degradedCount = typeof viewModel.degradedCount === 'number' ? viewModel.degradedCount : 0;
  const degraded = Array.isArray(viewModel.degraded) ? viewModel.degraded : [];
  const alertsBlock = degradedCount > 0 ? renderDegradedAlerts(degraded) : '';

  const body = isEmpty
    ? renderWorktreeEmptyState()
    : `
      <div class="worktree-metrics">
        <div class="worktree-metric"><div class="worktree-metric-label">TOTAL</div><div class="worktree-metric-value" data-metric="total">${escapeHtml(viewModel.totalCount)}</div></div>
        <div class="worktree-metric"><div class="worktree-metric-label">ACTIVE</div><div class="worktree-metric-value" data-metric="active">${escapeHtml(viewModel.activeCount)}</div></div>
        <div class="worktree-metric"><div class="worktree-metric-label">IDLE</div><div class="worktree-metric-value" data-metric="idle">${escapeHtml(viewModel.idleCount)}</div></div>
        <div class="worktree-metric"><div class="worktree-metric-label">STALE</div><div class="worktree-metric-value" data-metric="stale">${escapeHtml(viewModel.staleCount)}</div></div>
        <div class="worktree-metric"><div class="worktree-metric-label">TOTAL SIZE</div><div class="worktree-metric-value" data-metric="size">${escapeHtml(formatBytes(viewModel.totalSizeBytes))}</div></div>
      </div>
      <div class="worktree-table-wrapper">
        <table class="worktree-table">
          <thead>
            <tr>
              <th class="worktree-th">STATUS</th>
              <th class="worktree-th">PLATFORM · MR</th>
              <th class="worktree-th">PATH</th>
              <th class="worktree-th">AGE</th>
              <th class="worktree-th">SIZE</th>
              <th class="worktree-th">MTIME</th>
            </tr>
          </thead>
          <tbody>
            ${viewModel.groups.map(renderGroupRows).join('')}
          </tbody>
        </table>
      </div>
    `;

  return `
    <div class="worktree-panel" data-empty="${isEmpty ? 'true' : 'false'}">
      <div class="worktree-panel-header">
        <span class="worktree-panel-title">// WORKTREE POOL · ${escapeHtml(viewModel.totalCount)}</span>
        <button class="worktree-sweep-button" data-action="sweep" type="button">
          <svg class="worktree-sweep-broom" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
              <path d="M14 4 L20 10" />
              <path d="M13 5 L4 14 L10 20 L19 11" />
              <path d="M4 14 L2 18" />
              <path d="M6 16 L4 20" />
              <path d="M8 18 L6 22" />
            </g>
          </svg>
          <span class="worktree-sweep-label">SWEEP NOW</span>
        </button>
      </div>
      <div class="worktree-panel-body">${alertsBlock}${body}</div>
      <div class="worktree-panel-footer">
        <div class="worktree-footer-block">
          <span class="worktree-footer-label">// LAST SWEEP</span>
          ${renderLastSweep(viewModel.lastSweep)}
        </div>
        <div class="worktree-footer-block worktree-footer-next">
          <span class="worktree-footer-label">// NEXT SWEEP</span>
          <span class="worktree-nextsweep-value">${escapeHtml(renderNextSweep(viewModel.nextSweepAt))}</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<WorktreePanelViewModel>}
 */
export async function fetchWorktreeOverview(fetchImpl = fetch) {
  const response = await fetchImpl('/api/worktrees');
  if (!response.ok) {
    throw new Error(`Worktree overview request failed: ${response.status}`);
  }
  return response.json();
}

/**
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<ManualSweepResult>}
 */
export async function triggerManualSweep(fetchImpl = fetch) {
  const response = await fetchImpl('/api/worktrees/sweep', { method: 'POST' });
  if (response.ok) {
    const payload = await response.json();
    return { status: 'ok', payload };
  }
  if (response.status === 409) {
    const body = await response.json();
    return { status: 'conflict', startedAt: body.startedAt };
  }
  const body = await response.json().catch(() => ({}));
  return { status: 'error', reason: body.error };
}

/**
 * @param {CleanupEndpointPayload} payload
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<ForceCleanupResult>}
 */
export async function triggerForceCleanup(payload, fetchImpl = fetch) {
  const response = await fetchImpl('/api/worktrees/cleanup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (response.ok) {
    return { status: 'ok' };
  }
  if (response.status === 409) {
    return { status: 'conflict' };
  }
  if (response.status === 404) {
    return { status: 'not-found' };
  }
  const body = await response.json().catch(() => ({}));
  const reason = body.warning ?? body.error ?? '';
  return { status: 'error', reason };
}
