import { escapeHtml } from './html.js';

/**
 * @param {{ currentVersion: string, updateAvailable: boolean, latestVersion: string | null }} versionData
 * @param {(key: string, params?: Record<string, string | number>) => string} translate
 * @returns {string}
 */
export function renderVersionUpdateArea(versionData, translate) {
  const versionLabel = `<span class="version-label">v${escapeHtml(versionData.currentVersion)}</span>`;

  const checkButton = `<button id="version-check-btn" class="btn btn-icon" title="${escapeHtml(translate('version.checkTooltip'))}" onclick="checkForUpdates()">
    <i data-lucide="refresh-cw"></i>
  </button>`;

  if (!versionData.updateAvailable || !versionData.latestVersion) {
    return `${versionLabel}${checkButton}`;
  }

  const label = translate('version.updateAvailable', { version: versionData.latestVersion });

  const updateButton = `<button id="version-update-btn" class="btn btn-update" data-default-label="${escapeHtml(label)}" onclick="triggerVersionUpdate()">
    <i data-lucide="download"></i> <span>${escapeHtml(label)}</span>
  </button>`;

  return `${versionLabel}${updateButton}${checkButton}`;
}

/**
 * @param {HTMLElement} button
 * @param {string} label
 */
function setButtonLabel(button, label) {
  const span = button.querySelector('span');
  if (span) span.textContent = label;
}

/**
 * @param {'idle' | 'checking' | 'updating' | 'restarting'} status
 * @param {(key: string) => string} translate
 */
export function setVersionCheckState(status, translate) {
  const checkBtn = document.getElementById('version-check-btn');
  const updateBtn = document.getElementById('version-update-btn');

  if (status === 'checking' && checkBtn) {
    checkBtn.classList.add('spinning');
    checkBtn.disabled = true;
  } else if (checkBtn) {
    checkBtn.classList.remove('spinning');
    checkBtn.disabled = false;
  }

  if (status === 'updating' && updateBtn) {
    updateBtn.disabled = true;
    setButtonLabel(updateBtn, translate('version.updating'));
  } else if (status === 'restarting' && updateBtn) {
    updateBtn.disabled = true;
    setButtonLabel(updateBtn, translate('version.restarting'));
  } else if (updateBtn) {
    updateBtn.disabled = false;
    setButtonLabel(updateBtn, updateBtn.dataset.defaultLabel ?? '');
  }
}

/**
 * @typedef {{ kind: 'local-only' }
 *   | { kind: 'reviews-in-progress', count: number }
 *   | { kind: 'wrong-branch' }
 *   | { kind: 'dirty-checkout' }
 *   | { kind: 'missing-tool', tool: 'git' | 'yarn' }
 *   | { kind: 'fetch-failed', detail: string }
 *   | { kind: 'rebuild-failed' }} SelfUpdateRefusalMotive
 */

/**
 * @param {SelfUpdateRefusalMotive} motive
 * @param {(key: string, params?: Record<string, string | number>) => string} translate
 * @returns {string}
 */
export function resolveRefusalWording(motive, translate) {
  switch (motive.kind) {
    case 'local-only':
      return translate('version.refusal.localOnly');
    case 'reviews-in-progress': {
      const plural = motive.count === 1 ? '' : 's';
      return `${motive.count} ${translate('version.refusal.reviewsInProgress', { plural })}`;
    }
    case 'wrong-branch':
      return translate('version.refusal.wrongBranch');
    case 'dirty-checkout':
      return translate('version.refusal.dirtyCheckout');
    case 'missing-tool':
      return translate('version.refusal.missingTool', { tool: motive.tool });
    case 'fetch-failed':
      return `${translate('version.refusal.fetchFailed')} : ${motive.detail}`;
    case 'rebuild-failed':
      return translate('version.refusal.rebuildFailed');
    default:
      return translate('version.updateFailed');
  }
}
