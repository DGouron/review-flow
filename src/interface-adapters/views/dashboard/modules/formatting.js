import { t, getLanguage } from './i18n.js';

/**
 * @param {string | null | undefined} dateStr
 * @returns {string}
 */
export function formatTime(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;
  if (diff < 60000) return t('time.justNow');
  if (diff < 3600000) return t('time.minutesAgo', { minutes: Math.floor(diff / 60000) });
  if (diff < 86400000) return t('time.hoursAgo', { hours: Math.floor(diff / 3600000) });
  const locale = getLanguage() === 'fr' ? 'fr-FR' : 'en-US';
  return date.toLocaleDateString(locale);
}

/**
 * @param {string | null | undefined} startStr
 * @param {string | null | undefined} endStr
 * @param {number | null | undefined} totalMs
 * @returns {string}
 */
export function formatDuration(startStr, endStr, totalMs) {
  let diff;
  if (totalMs !== undefined && totalMs !== null) {
    diff = Math.floor(totalMs / 1000);
  } else if (startStr) {
    const start = new Date(startStr);
    const end = endStr ? new Date(endStr) : new Date();
    diff = Math.floor((end - start) / 1000);
  } else {
    return '';
  }
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`;
  return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
}

/**
 * @param {string} phase
 * @returns {string}
 */
export function formatPhase(phase) {
  return t(`phase.${phase}`);
}

/**
 * @param {number} timestamp
 * @returns {string}
 */
export function formatLogTime(timestamp) {
  const date = new Date(timestamp);
  const locale = getLanguage() === 'fr' ? 'fr-FR' : 'en-US';
  return date.toLocaleTimeString(locale);
}
