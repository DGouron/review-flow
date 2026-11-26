/**
 * Dashboard module — "Explain" a pull request (SPEC-232).
 *
 * Client of POST /api/mr-tracking/brief: reads the answer into a brief state
 * (idle, loading, ready, error) and renders it in the side panel.
 */

import { escapeHtml } from './html.js';
import { icon } from './icons.js';

/** The server may take up to 60 s; leave it room before giving up. */
export const BRIEF_TIMEOUT_MS = 75_000;

/** @typedef {(key: string, params?: Record<string, string | number>) => string} Translate */

/**
 * @typedef {{ mrNumber: number, headSha: string, generatedAt: string, what: string, problem: string,
 *   risks: string[], toCheck: string[], size: { additions: number, deletions: number, changedFiles: number },
 *   areas: string[] }} PullRequestBrief
 * @typedef {{ status: 'idle' } | { status: 'loading' } | { status: 'ready', brief: PullRequestBrief }
 *   | { status: 'error', errorKey: string, detail: string | null }} BriefState
 */

const isText = (value) => typeof value === 'string' && value.trim().length > 0;
const isTextList = (value) =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');
const isCount = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

function isBrief(body) {
  return (
    body !== null &&
    typeof body === 'object' &&
    isText(body.what) &&
    isText(body.problem) &&
    isTextList(body.risks) &&
    isTextList(body.toCheck) &&
    body.size !== null &&
    typeof body.size === 'object' &&
    isCount(body.size.additions) &&
    isCount(body.size.deletions) &&
    isCount(body.size.changedFiles)
  );
}

/**
 * @param {number} status HTTP status
 * @param {unknown} body parsed JSON body
 * @returns {BriefState}
 */
export function readBriefResponse(status, body) {
  const detail =
    body && typeof body === 'object' && typeof body.error === 'string' ? body.error : null;
  if (status === 200) {
    if (!isBrief(body)) return { status: 'error', errorKey: 'brief.error.malformed', detail: null };
    return { status: 'ready', brief: { ...body, areas: isTextList(body.areas) ? body.areas : [] } };
  }
  if (status === 404) return { status: 'error', errorKey: 'brief.error.notTracked', detail };
  if (status === 502) return { status: 'error', errorKey: 'brief.error.failed', detail };
  return { status: 'error', errorKey: 'brief.error.unexpected', detail };
}

/**
 * @param {{ projectPath: string, mrNumber: number, refresh: boolean }} request
 * @param {(url: string, init: { method?: string, headers?: Record<string, string>, body?: string, signal: AbortSignal }) => Promise<{ status: number, json: () => Promise<unknown> }>} [fetchImplementation]
 * @returns {Promise<BriefState>}
 */
export async function requestBrief(request, fetchImplementation = globalThis.fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BRIEF_TIMEOUT_MS);
  try {
    const response = await fetchImplementation('/api/mr-tracking/brief', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectPath: request.projectPath,
        mrNumber: request.mrNumber,
        refresh: request.refresh,
      }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null);
    return readBriefResponse(response.status, body);
  } catch {
    const timedOut = controller.signal.aborted;
    return {
      status: 'error',
      errorKey: timedOut ? 'brief.error.timeout' : 'brief.error.network',
      detail: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {{ additions: number, deletions: number, changedFiles: number }} size
 * @param {Translate} t
 * @param {string} locale
 * @returns {string}
 */
export function formatBriefSize(size, t, locale) {
  const format = new Intl.NumberFormat(locale);
  return t('brief.size.value', {
    additions: format.format(size.additions),
    deletions: format.format(size.deletions),
    files: format.format(size.changedFiles),
  });
}

/**
 * @param {PullRequestBrief} brief
 * @param {Translate} t
 * @param {string} locale
 * @returns {string}
 */
export function briefToText(brief, t, locale) {
  const list = (items) => items.map((item) => `- ${item}`).join('\n');
  return [
    `${t('brief.section.what')}\n${brief.what}`,
    `${t('brief.section.problem')}\n${brief.problem}`,
    `${t('brief.section.risks')}\n${list(brief.risks)}`,
    `${t('brief.section.toCheck')}\n${list(brief.toCheck)}`,
    `${t('brief.section.size')}\n${formatBriefSize(brief.size, t, locale)}`,
  ].join('\n\n');
}

/**
 * @param {PullRequestBrief} brief
 * @param {Translate} t
 * @returns {string}
 */
export function digDeeperQuestion(brief, t) {
  return t('brief.digQuestion', { risks: brief.risks.join(' ; ') });
}

const explainIcon = () => icon('circle-help');

function renderIdle(t) {
  return `<div class="brief-ask"><button type="button" class="btn btn-ask btn-wide" data-action="explain">${explainIcon()}${escapeHtml(t('brief.explainThis'))}</button><span class="brief-hint">${escapeHtml(t('brief.hint'))}</span></div>`;
}

function renderLoading(t) {
  return `<div class="brief" aria-busy="true"><div class="brief-head">${escapeHtml(t('brief.loading'))}</div><div class="brief-skeleton" aria-hidden="true"><i style="width: 92%"></i><i style="width: 78%"></i><i style="width: 85%"></i><i style="width: 60%"></i></div></div>`;
}

function renderError(state, t) {
  const detail = state.detail
    ? `<span class="brief-error-detail">${escapeHtml(state.detail)}</span>`
    : '';
  return `<div class="brief brief-error" role="alert"><div class="brief-section"><p>${escapeHtml(t(state.errorKey))}</p>${detail}</div><div class="brief-foot"><button type="button" class="btn btn-ask" data-action="explain">${escapeHtml(t('brief.retry'))}</button></div></div>`;
}

function renderReady(brief, t, locale) {
  const section = (key, content, extraClass = '') =>
    `<div class="brief-section${extraClass}"><div class="brief-label">${escapeHtml(t(`brief.section.${key}`))}</div>${content}</div>`;
  const paragraph = (text) => `<p>${escapeHtml(text)}</p>`;
  const list = (items) =>
    `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
  const areas =
    brief.areas.length > 0
      ? `<div class="brief-areas">${brief.areas.map((area) => `<span class="chip chip-mono">${escapeHtml(area)}</span>`).join('')}</div>`
      : '';
  return `<div class="brief">
  <div class="brief-head">${escapeHtml(t('brief.title'))}<span class="brief-size mono">${escapeHtml(formatBriefSize(brief.size, t, locale))}</span></div>
  ${section('what', paragraph(brief.what))}
  ${section('problem', paragraph(brief.problem))}
  ${section('risks', list(brief.risks), ' brief-risks')}
  ${section('toCheck', list(brief.toCheck))}
  ${section('size', `<p class="mono">${escapeHtml(formatBriefSize(brief.size, t, locale))}</p>${areas}`)}
  <div class="brief-foot"><button type="button" class="btn btn-ask" data-action="brief-dig">${escapeHtml(t('brief.dig'))}</button><button type="button" class="btn btn-ghost" data-action="brief-copy">${escapeHtml(t('brief.copy'))}</button><button type="button" class="btn btn-ghost" data-action="brief-refresh">${escapeHtml(t('brief.refresh'))}</button></div>
</div>`;
}

/**
 * @param {BriefState} state
 * @param {Translate} t
 * @param {string} locale
 * @returns {string}
 */
export function renderBriefHtml(state, t, locale) {
  if (state.status === 'loading') return renderLoading(t);
  if (state.status === 'ready') return renderReady(state.brief, t, locale);
  if (state.status === 'error') return renderError(state, t);
  return renderIdle(t);
}
