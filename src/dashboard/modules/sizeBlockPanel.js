/**
 * Dashboard module — oversized-MR size-block panel (SPEC-218).
 * Humble object: pure functions, no global state, no direct DOM access here.
 * The panel is only rendered when at least one MR is currently blocked for size;
 * each row exposes a "Force launch" action carrying the MR identity.
 *
 * Visual DNA: "Agentic OS" — see project_agentic_os_design_dna.md.
 */

import { escapeHtml, sanitizeHttpUrl } from './html.js';

/**
 * @typedef {Object} SizeBlockApiRow
 * @property {string} mrId
 * @property {number} mrNumber
 * @property {string} title
 * @property {string} url
 * @property {'gitlab' | 'github'} platform
 * @property {string} projectName
 * @property {string} projectPath
 * @property {number} countedLines
 * @property {number} budget
 * @property {string} blockedAt
 */

/**
 * @typedef {Object} SizeBlockApiPayload
 * @property {SizeBlockApiRow[]} blocks
 * @property {boolean} isEmpty
 */

/**
 * @typedef {Object} SizeBlockPanelViewModel
 * @property {boolean} isEmpty
 * @property {number} count
 * @property {SizeBlockApiRow[]} rows
 */

/**
 * @param {SizeBlockApiPayload} payload
 * @returns {SizeBlockPanelViewModel}
 */
export function buildSizeBlockPanelModel(payload) {
  const rows = Array.isArray(payload?.blocks) ? payload.blocks : [];
  return {
    isEmpty: rows.length === 0,
    count: rows.length,
    rows,
  };
}

/**
 * @param {SizeBlockApiRow} row
 * @returns {string}
 */
function renderRow(row) {
  const prefix = row.platform === 'github' ? 'PR' : 'MR';
  return `
    <div class="size-block-row" data-mr-id="${escapeHtml(row.mrId)}">
      <div class="size-block-identity">
        <span class="size-block-project">${escapeHtml(row.projectName)}</span>
        <a class="size-block-title" href="${escapeHtml(sanitizeHttpUrl(row.url))}" target="_blank" rel="noopener noreferrer">${prefix} #${escapeHtml(String(row.mrNumber))} — ${escapeHtml(row.title)}</a>
      </div>
      <div class="size-block-metrics">
        <span class="size-block-counted">${escapeHtml(String(row.countedLines))}</span>
        <span class="size-block-separator">/</span>
        <span class="size-block-budget">${escapeHtml(String(row.budget))}</span>
      </div>
      <button
        type="button"
        class="size-block-force-button"
        data-action="force-launch"
        data-mr-id="${escapeHtml(row.mrId)}"
        data-project-path="${escapeHtml(row.projectPath)}"
      >Lancer quand même</button>
    </div>
  `;
}

/**
 * @param {SizeBlockPanelViewModel} viewModel
 * @returns {string}
 */
export function renderSizeBlockPanelHtml(viewModel) {
  if (viewModel.isEmpty) return '';

  return `
    <div class="size-block-panel">
      <div class="size-block-panel-header">
        <span class="size-block-panel-title">// MERGE REQUESTS BLOQUÉES POUR TAILLE · ${escapeHtml(String(viewModel.count))}</span>
      </div>
      <div class="size-block-panel-body">
        ${viewModel.rows.map(renderRow).join('')}
      </div>
    </div>
  `;
}

/**
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<SizeBlockApiPayload>}
 */
export async function fetchSizeBlocks(fetchImpl = fetch) {
  const response = await fetchImpl('/api/size-blocks');
  if (!response.ok) {
    throw new Error(`Size blocks request failed: ${response.status}`);
  }
  return response.json();
}

/**
 * @param {{ mrId: string; projectPath: string }} payload
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{ success: boolean; error?: string }>}
 */
export async function triggerForceLaunch(payload, fetchImpl = fetch) {
  const response = await fetchImpl('/api/mr-tracking/force-start', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  return { success: response.ok && body.success === true, error: body.error };
}
