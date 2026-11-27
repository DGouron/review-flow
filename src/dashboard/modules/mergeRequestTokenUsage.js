/**
 * Dashboard module — token usage of one pull request: one row per Claude session.
 * Humble object: pure functions, no global state, no direct DOM access.
 */

import { escapeHtml } from './html.js';
import { formatTokenCount } from './tokenUsage.js';

const minutesCell = (minutes) => (minutes === null ? '—' : `${minutes} min`);

/**
 * @param {{ durationMinutes: number | null, cacheReadTokens: number, costUsd: string }} row
 * @param {{ kind: string, model: string, role: string | null }} labels  role null: no role column
 */
function renderRow(row, labels) {
  const roleCell = labels.role === null ? '' : `\n      <td>${escapeHtml(labels.role)}</td>`;
  return `
    <tr>
      <td>${escapeHtml(labels.kind)}</td>${roleCell}
      <td>${escapeHtml(labels.model)}</td>
      <td>${minutesCell(row.durationMinutes)}</td>
      <td>${formatTokenCount(row.cacheReadTokens)}</td>
      <td>${escapeHtml(row.costUsd)}</td>
    </tr>`;
}

function renderSignals(viewModel, t) {
  const signals = [];
  if (viewModel.cacheReadSharePercent !== null) {
    signals.push(t('tokenUsage.signal.cacheRead', { percent: viewModel.cacheReadSharePercent }));
  }
  if (viewModel.costVsProjectMedian !== null) {
    signals.push(t('tokenUsage.signal.projectMedian', { ratio: viewModel.costVsProjectMedian }));
  }
  if (signals.length === 0) return '';
  return `<ul class="token-usage-signals">${signals.map((signal) => `<li>${escapeHtml(signal)}</li>`).join('')}</ul>`;
}

/**
 * @param {import('../../modules/token-accounting/interface-adapters/presenters/mergeRequestTokenUsage.presenter.js').MergeRequestTokenUsageViewModel} viewModel
 * @param {(key: string, params?: Record<string, string | number>) => string} t
 * @returns {string}
 */
export function renderMergeRequestTokenUsage(viewModel, t) {
  if (viewModel.isEmpty) {
    return `<div class="empty-state" style="font-size: 0.8rem;">${escapeHtml(t('tokenUsage.mergeRequest.empty'))}</div>`;
  }

  return `
    <div class="token-usage-table-wrap">
      <table class="sheet-history-table token-usage-table">
        ${renderTableContent(viewModel, t)}
      </table>
    </div>
    ${renderSignals(viewModel, t)}`;
}

function renderTableContent(viewModel, t) {
  const columns = viewModel.showsRoles
    ? ['kind', 'role', 'model', 'duration', 'cacheRead', 'cost']
    : ['kind', 'model', 'duration', 'cacheRead', 'cost'];
  const headers = columns
    .map((column) => `<th>${escapeHtml(t(`tokenUsage.column.${column}`))}</th>`)
    .join('');
  const roleLabelOf = (role) => (viewModel.showsRoles ? (role ?? '—') : null);
  const rows = viewModel.sessions
    .map((row) =>
      renderRow(row, {
        kind: t(`tokenUsage.jobType.${row.jobType}`),
        model: row.model,
        role: roleLabelOf(row.role),
      }),
    )
    .join('');
  const totalRow = renderRow(viewModel.total, {
    kind: t('tokenUsage.total'),
    model: '',
    role: viewModel.showsRoles ? '' : null,
  });
  return `<thead><tr>${headers}</tr></thead>
        <tbody>${rows}</tbody>
        <tfoot>${totalRow}</tfoot>`;
}

/**
 * @param {string} project
 * @param {number} mrNumber
 * @param {typeof fetch} [fetchImpl]  injectable for tests
 */
export async function fetchMergeRequestTokenUsage(project, mrNumber, fetchImpl = fetch) {
  const params = new URLSearchParams({ project, mrNumber: String(mrNumber) });
  const response = await fetchImpl(`/api/token-usage/merge-request?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Merge request token usage request failed: ${response.status}`);
  }
  return response.json();
}
