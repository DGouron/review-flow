/**
 * Dashboard module — monthly Claude budget cap (slider + live gauge + toast).
 * Humble object: pure functions, no global state, no direct DOM access.
 * Backs spec #163 Token Budget Cap with Live Indicator.
 */

/**
 * @typedef {Object} BudgetStatusViewModel
 * @property {string} limitUsdFormatted
 * @property {string} consumedUsdFormatted
 * @property {string} remainingUsdFormatted
 * @property {string} percentUsedFormatted
 * @property {number} gaugeWidthPercent
 * @property {boolean} exceeded
 * @property {string} periodStart
 */

/**
 * @typedef {Object} BudgetExceededPayload
 * @property {number} mrNumber
 * @property {'gitlab'|'github'} platform
 * @property {string} projectPath
 * @property {number} limitUsd
 * @property {number} consumedUsd
 */

/**
 * @typedef {Object} BudgetConfigViewModel
 * @property {number} limitUsd
 */

/**
 * @typedef {Object} SubmitBudgetResult
 * @property {boolean} success
 * @property {number} [limitUsd]
 * @property {string} [error]
 */

/**
 * @param {string | null | undefined} text
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
 * Renders the budget tile as an HTML string.
 *
 * @param {BudgetStatusViewModel} viewModel
 * @returns {string}
 */
export function renderBudgetTile(viewModel) {
  const exceededBadge = viewModel.exceeded
    ? '<span class="budget-tile-badge budget-tile-badge--exceeded">Budget exceeded</span>'
    : '';
  const gaugeClass = viewModel.exceeded
    ? 'budget-gauge-fill budget-gauge-fill--exceeded'
    : 'budget-gauge-fill';
  const headerSection = viewModel.exceeded
    ? `<div class="budget-tile-header">${exceededBadge}</div>`
    : '';

  return `
    <div class="budget-tile">
      ${headerSection}
      <div class="budget-tile-figures">
        <span class="budget-tile-consumed">${escapeHtml(viewModel.consumedUsdFormatted)}</span>
        <span class="budget-tile-separator">/</span>
        <span class="budget-tile-limit">${escapeHtml(viewModel.limitUsdFormatted)}</span>
        <span class="budget-tile-percent">${escapeHtml(viewModel.percentUsedFormatted)}</span>
      </div>
      <div class="budget-gauge">
        <div class="${gaugeClass}" style="width: ${viewModel.gaugeWidthPercent}%"></div>
      </div>
      <div class="budget-tile-remaining">Remaining: ${escapeHtml(viewModel.remainingUsdFormatted)}</div>
    </div>
  `;
}

/**
 * Parses a WebSocket "budget-status" message into a view model.
 * Returns null if the message is not of the expected shape.
 *
 * @param {unknown} message
 * @returns {BudgetStatusViewModel | null}
 */
export function parseBudgetStatusMessage(message) {
  if (!message || typeof message !== 'object') return null;
  const record = /** @type {Record<string, unknown>} */ (message);
  if (record.type !== 'budget-status') return null;
  const data = record.data;
  if (!data || typeof data !== 'object') return null;
  return /** @type {BudgetStatusViewModel} */ (data);
}

/**
 * Parses a WebSocket "budget-exceeded" message into a toast payload.
 * Returns null if the message is not of the expected shape.
 *
 * @param {unknown} message
 * @returns {BudgetExceededPayload | null}
 */
export function parseBudgetExceededMessage(message) {
  if (!message || typeof message !== 'object') return null;
  const record = /** @type {Record<string, unknown>} */ (message);
  if (record.type !== 'budget-exceeded') return null;
  const data = record.data;
  if (!data || typeof data !== 'object') return null;
  return /** @type {BudgetExceededPayload} */ (data);
}

/**
 * Fetches the raw budget config.
 *
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<BudgetConfigViewModel>}
 */
export async function fetchBudget(fetchImpl = fetch) {
  const response = await fetchImpl('/api/budget');
  if (!response.ok) {
    throw new Error(`Budget fetch failed: ${response.status}`);
  }
  return response.json();
}

/**
 * Fetches the budget status view model.
 *
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<BudgetStatusViewModel>}
 */
export async function fetchBudgetStatus(fetchImpl = fetch) {
  const response = await fetchImpl('/api/budget/status');
  if (!response.ok) {
    throw new Error(`Budget status fetch failed: ${response.status}`);
  }
  return response.json();
}

/**
 * Submits a new budget limit. The server enforces the 0-600 range.
 *
 * @param {number} limitUsd
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<SubmitBudgetResult>}
 */
export async function submitBudget(limitUsd, fetchImpl = fetch) {
  const response = await fetchImpl('/api/budget', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limitUsd }),
  });
  return response.json();
}
