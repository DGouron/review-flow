/**
 * Dashboard module — Settings modal humble object (SPEC-179).
 *
 * Pure functions, no global state, no DOM access. Builds a viewmodel from a
 * ProjectConfig payload, renders the dialog form HTML, validates the
 * externalLink field client-side, and extracts a whitelisted patch payload
 * from a FormData-like object.
 *
 * Visual DNA: "Agentic OS" — see project_agentic_os_design_dna.md.
 */

import { escapeHtml } from './html.js';
import { t } from './i18n.js';

const EDITABLE_KEYS = [
  'language',
  'defaultModel',
  'reviewSkill',
  'reviewFollowupSkill',
  'externalLink',
  'qualityThreshold',
  'maxConcurrentReviews',
];

const SUPPORTED_LANGUAGES = ['fr', 'en'];
const SUPPORTED_MODELS = ['haiku', 'sonnet', 'opus'];

const QUALITY_THRESHOLD_ERROR = 'Le seuil doit être un entier entre 0 et 10';

const PROJECT_CAP_REQUIRED_MESSAGE = 'La valeur est obligatoire';
const PROJECT_CAP_NOT_INTEGER_MESSAGE = 'La valeur doit être un nombre entier';
const PROJECT_CAP_OUT_OF_RANGE_MESSAGE = 'La valeur doit être comprise entre 1 et 10';
const DEFAULT_MAX_CONCURRENT_REVIEWS = 2;

/**
 * @typedef {Object} SettingsModalConfigInput
 * @property {'haiku' | 'sonnet' | 'opus'} defaultModel
 * @property {string} reviewSkill
 * @property {string} reviewFollowupSkill
 * @property {'en' | 'fr'} language
 * @property {string} [externalLink]
 * @property {number} [qualityThreshold]
 * @property {number} [maxConcurrentReviews]
 * @property {boolean} [github]
 * @property {boolean} [gitlab]
 * @property {number} [retentionDays]
 */

/**
 * @typedef {Object} SettingsModalBuildInput
 * @property {SettingsModalConfigInput} config
 * @property {string} [projectName]
 */

/**
 * @typedef {Object} SettingsModalViewModel
 * @property {'en' | 'fr'} language
 * @property {'haiku' | 'sonnet' | 'opus'} defaultModel
 * @property {string} reviewSkill
 * @property {string} reviewFollowupSkill
 * @property {string} externalLink
 * @property {string} qualityThreshold
 * @property {string} maxConcurrentReviews
 * @property {string} projectName
 */

/**
 * @param {SettingsModalBuildInput} input
 * @returns {SettingsModalViewModel}
 */
export function buildSettingsViewModel(input) {
  const config = input.config;
  return {
    language: config.language,
    defaultModel: config.defaultModel,
    reviewSkill: config.reviewSkill,
    reviewFollowupSkill: config.reviewFollowupSkill,
    externalLink: typeof config.externalLink === 'string' ? config.externalLink : '',
    qualityThreshold:
      typeof config.qualityThreshold === 'number' ? String(config.qualityThreshold) : '',
    maxConcurrentReviews:
      typeof config.maxConcurrentReviews === 'number'
        ? String(config.maxConcurrentReviews)
        : String(DEFAULT_MAX_CONCURRENT_REVIEWS),
    projectName:
      typeof input.projectName === 'string' && input.projectName.length > 0
        ? input.projectName
        : '—',
  };
}

/**
 * @param {SettingsModalViewModel} viewModel
 * @returns {string}
 */
function renderLanguageRadios(viewModel) {
  return SUPPORTED_LANGUAGES.map((value) => {
    const checked = viewModel.language === value ? ' checked' : '';
    const label = value === 'fr' ? 'Français' : 'English';
    return `
        <label class="settings-modal__radio">
          <input type="radio" name="language" value="${escapeHtml(value)}"${checked} />
          <span>${escapeHtml(label)}</span>
        </label>
      `.trim();
  }).join('');
}

/**
 * @param {SettingsModalViewModel} viewModel
 * @returns {string}
 */
function renderModelOptions(viewModel) {
  return SUPPORTED_MODELS.map((value) => {
    const selected = viewModel.defaultModel === value ? ' selected' : '';
    return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(value)}</option>`;
  }).join('');
}

/**
 * Renders the UI language selector (changes the dashboard interface language,
 * distinct from the project language used for Claude prompts).
 * @returns {string}
 */
function renderUiLanguageSelect() {
  return `
    <label class="settings-modal__field">
      <span class="settings-modal__label">${escapeHtml(t('settings.uiLanguage'))}</span>
      <select id="settings-modal-ui-language" class="settings-modal__select" onchange="changeLanguage(this.value)">
        <option value="en">English</option>
        <option value="fr">Français</option>
      </select>
    </label>
  `.trim();
}

/**
 * @param {SettingsModalViewModel} viewModel
 * @returns {string}
 */
export function renderSettingsModalHtml(viewModel) {
  return `
    <form class="settings-modal__form" method="dialog">
      <h2 class="settings-modal__title" id="settings-modal-title">// SETTINGS — ${escapeHtml(viewModel.projectName)}</h2>

      ${renderUiLanguageSelect()}

      <fieldset class="settings-modal__field">
        <legend class="settings-modal__legend">${escapeHtml(t('settings.claudePromptsLanguage'))}</legend>
        ${renderLanguageRadios(viewModel)}
      </fieldset>

      <label class="settings-modal__field">
        <span class="settings-modal__label">${escapeHtml(t('settings.defaultModel'))}</span>
        <select name="defaultModel" class="settings-modal__select">
          ${renderModelOptions(viewModel)}
        </select>
      </label>

      <label class="settings-modal__field">
        <span class="settings-modal__label">${escapeHtml(t('settings.reviewSkill'))}</span>
        <input type="text" name="reviewSkill" value="${escapeHtml(viewModel.reviewSkill)}" class="settings-modal__input" />
      </label>

      <label class="settings-modal__field">
        <span class="settings-modal__label">${escapeHtml(t('settings.reviewFollowupSkill'))}</span>
        <input type="text" name="reviewFollowupSkill" value="${escapeHtml(viewModel.reviewFollowupSkill)}" class="settings-modal__input" />
      </label>

      <label class="settings-modal__field">
        <span class="settings-modal__label">${escapeHtml(t('settings.externalLink'))}</span>
        <input type="url" name="externalLink" value="${escapeHtml(viewModel.externalLink)}" placeholder="${escapeHtml(t('settings.externalLinkPlaceholder'))}" class="settings-modal__input" />
      </label>

      <label class="settings-modal__field">
        <span class="settings-modal__label">${escapeHtml(t('settings.qualityThreshold'))}</span>
        <input name="qualityThreshold" type="number" value="${escapeHtml(viewModel.qualityThreshold)}" min="0" max="10" step="1" placeholder="${escapeHtml(t('settings.qualityThresholdPlaceholder'))}" class="settings-modal__input" />
        <span class="settings-modal__hint">${escapeHtml(t('settings.qualityThresholdHint'))}</span>
      </label>

      <label class="settings-modal__field">
        <span class="settings-modal__label">${escapeHtml(t('settings.maxConcurrentReviews'))}</span>
        <input name="maxConcurrentReviews" type="number" value="${escapeHtml(viewModel.maxConcurrentReviews)}" min="1" max="10" step="1" class="settings-modal__input" />
        <span class="settings-modal__hint">${escapeHtml(t('settings.maxConcurrentReviewsHint'))}</span>
      </label>

      <p class="settings-modal__error" aria-live="polite"></p>

      <div class="settings-modal__actions">
        <button type="button" class="settings-modal__cancel">${escapeHtml(t('settings.cancel'))}</button>
        <button type="submit" class="settings-modal__submit">${escapeHtml(t('settings.save'))}</button>
      </div>
    </form>
  `.trim();
}

/**
 * Validates qualityThreshold input: empty string means "clear", otherwise must
 * parse as an integer in [0, 10]. Mirrors server-side validation.
 *
 * @param {string} value
 * @returns {{ ok: true } | { ok: false; message: string }}
 */
export function validateQualityThreshold(value) {
  if (value === '') return { ok: true };
  if (!/^-?\d+$/.test(value)) {
    return { ok: false, message: QUALITY_THRESHOLD_ERROR };
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10) {
    return { ok: false, message: QUALITY_THRESHOLD_ERROR };
  }
  return { ok: true };
}

/**
 * Mirrors the server-side validation in projectConcurrencyCap.valueObject.ts.
 * Empty value is required; non-integer or out-of-range [1, 10] are rejected.
 *
 * @param {string} value
 * @returns {{ ok: true } | { ok: false; message: string }}
 */
export function validateMaxConcurrentReviews(value) {
  if (value === '') {
    return { ok: false, message: PROJECT_CAP_REQUIRED_MESSAGE };
  }
  if (!/^-?\d+$/.test(value)) {
    return { ok: false, message: PROJECT_CAP_NOT_INTEGER_MESSAGE };
  }
  const parsed = Number(value);
  if (parsed < 1 || parsed > 10) {
    return { ok: false, message: PROJECT_CAP_OUT_OF_RANGE_MESSAGE };
  }
  return { ok: true };
}

/**
 * Mirrors the server-side regex from updateProjectConfig.usecase.ts.
 *
 * @param {string} value
 * @returns {{ ok: true } | { ok: false; message: string }}
 */
export function validateExternalLink(value) {
  if (value === '') return { ok: true };
  if (value.startsWith('http://')) {
    return { ok: false, message: 'Le lien doit être en HTTPS' };
  }
  if (!/^https:\/\/.+/.test(value)) {
    return { ok: false, message: 'URL invalide' };
  }
  return { ok: true };
}

/**
 * Extracts a whitelisted payload from a FormData-like object (FormData or Map).
 *
 * @param {FormData | Map<string, string>} form
 * @returns {Record<string, string>}
 */
export function extractFormPayload(form) {
  /** @type {Record<string, string>} */
  const payload = {};
  for (const key of EDITABLE_KEYS) {
    const value = typeof form.get === 'function' ? form.get(key) : undefined;
    if (typeof value === 'string') {
      payload[key] = value;
    }
  }
  return payload;
}
