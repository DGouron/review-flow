/**
 * Dashboard module — token usage of one pull request: one row per Claude session.
 * Humble object: pure functions, no global state, no direct DOM access.
 */

import { escapeHtml } from './html.js';
import { formatTokenCount } from './tokenUsage.js';

const minutesCell = (minutes) => (minutes === null ? '—' : `${minutes} min`);

function renderRow(row, kindLabel, modelLabel) {
  return `
    <tr>
      <td>${escapeHtml(kindLabel)}</td>
      <td>${escapeHtml(modelLabel)}</td>
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

  const headers = ['kind', 'model', 'duration', 'cacheRead', 'cost']
    .map((column) => `<th>${escapeHtml(t(`tokenUsage.column.${column}`))}</th>`)
    .join('');
  const rows = viewModel.sessions
    .map((row) => renderRow(row, t(`tokenUsage.jobType.${row.jobType}`), row.model))
    .join('');

  return `
    <div class="token-usage-table-wrap">
      <table class="sheet-history-table token-usage-table">
        <thead><tr>${headers}</tr></thead>
        <tbody>${rows}</tbody>
        <tfoot>${renderRow(viewModel.total, t('tokenUsage.total'), '')}</tfoot>
      </table>
    </div>
    ${renderSignals(viewModel, t)}`;
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
