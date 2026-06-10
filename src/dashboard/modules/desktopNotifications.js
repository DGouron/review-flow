/**
 * @param {{ permission: string, isDocumentHidden: boolean, notifyWhenVisible?: boolean }} options
 * @returns {boolean}
 */
export function shouldNotifyDesktop(options) {
  if (options.permission !== 'granted') return false;
  if (options.notifyWhenVisible === true) return true;
  return options.isDocumentHidden;
}

/**
 * @typedef {Object} KindFormat
 * @property {string} emoji
 * @property {string} labelKey
 */

/** @type {Record<string, KindFormat>} */
const KIND_FORMATS = {
  reviewStarted: { emoji: '🔍', labelKey: 'notify.label.reviewStarted' },
  followupStarted: { emoji: '🔁', labelKey: 'notify.label.followupStarted' },
  reviewCompleted: { emoji: '✅', labelKey: 'notify.label.reviewCompleted' },
  followupCompleted: { emoji: '✅', labelKey: 'notify.label.followupCompleted' },
  reviewFailed: { emoji: '❌', labelKey: 'notify.label.reviewFailed' },
  reviewPendingConfirmation: { emoji: '⏳', labelKey: 'notify.label.reviewPendingConfirmation' },
};

// Size category thresholds (sum of additions + deletions).
// Tweak here if you find them off — kept central on purpose.
const SIZE_THRESHOLD_SMALL_MAX = 50;
const SIZE_THRESHOLD_MEDIUM_MAX = 300;
const SIZE_EMOJI = { small: '🪶', medium: '🚀', big: '🐘' };

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function toFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * @param {Record<string, unknown> | undefined} sizeMetrics
 * @returns {'small' | 'medium' | 'big'}
 */
function categorizeSize(sizeMetrics) {
  if (!sizeMetrics) return 'small';
  const additions = toFiniteNumber(sizeMetrics.additions);
  const deletions = toFiniteNumber(sizeMetrics.deletions);
  if (additions !== null && deletions !== null) {
    const total = additions + deletions;
    if (total < SIZE_THRESHOLD_SMALL_MAX) return 'small';
    if (total < SIZE_THRESHOLD_MEDIUM_MAX) return 'medium';
    return 'big';
  }
  const filesChanged = toFiniteNumber(sizeMetrics.filesChanged);
  if (filesChanged !== null) {
    if (filesChanged <= 3) return 'small';
    if (filesChanged <= 10) return 'medium';
    return 'big';
  }
  return 'small';
}

/**
 * @param {Record<string, unknown>} review
 * @returns {string | null}
 */
function buildSizeLine(review) {
  const metrics = review.sizeMetrics;
  if (!metrics || typeof metrics !== 'object') return null;
  const typed = /** @type {Record<string, unknown>} */ (metrics);
  const additions = toFiniteNumber(typed.additions);
  const deletions = toFiniteNumber(typed.deletions);
  const filesChanged = toFiniteNumber(typed.filesChanged);
  const hasAnyStat = additions !== null || deletions !== null || filesChanged !== null;
  if (!hasAnyStat) return null;
  const emoji = SIZE_EMOJI[categorizeSize(typed)];
  const parts = [];
  if (additions !== null && deletions !== null) {
    parts.push(`+${additions}/-${deletions}`);
  }
  if (filesChanged !== null) {
    parts.push(`${filesChanged} files`);
  }
  return `${emoji} ${parts.join(' · ')}`;
}

/**
 * @param {unknown} actor
 * @returns {string | null}
 */
function resolveActorName(actor) {
  if (!actor || typeof actor !== 'object') return null;
  const typed = /** @type {{ displayName?: unknown, username?: unknown }} */ (actor);
  if (typeof typed.displayName === 'string' && typed.displayName.length > 0) {
    return typed.displayName;
  }
  if (typeof typed.username === 'string' && typed.username.length > 0) {
    return typed.username;
  }
  return null;
}

/**
 * @param {Record<string, unknown>} review
 * @returns {string | null}
 */
function resolveAuthor(review) {
  return resolveActorName(review.author) ?? resolveActorName(review.assignedBy);
}

/**
 * @param {Record<string, unknown>} review
 * @returns {string | null}
 */
function resolveProjectShortName(review) {
  if (typeof review.project !== 'string' || review.project.length === 0) return null;
  const segments = review.project.split('/');
  const last = segments[segments.length - 1];
  return last && last.length > 0 ? last : null;
}

/**
 * @param {Record<string, unknown>} review
 * @returns {'gitlab' | 'github'}
 */
function resolvePlatform(review) {
  const id = typeof review.id === 'string' ? review.id : '';
  return id.startsWith('github') ? 'github' : 'gitlab';
}

/**
 * @param {Record<string, unknown>} review
 * @returns {'!' | '#'}
 */
function resolveMrPrefix(review) {
  return resolvePlatform(review) === 'github' ? '#' : '!';
}

const PLATFORM_ICONS = {
  gitlab: buildPlatformIconDataUri('GL', 'FC6D26'),
  github: buildPlatformIconDataUri('GH', '181717'),
};

/**
 * @param {string} label
 * @param {string} hexColor
 * @returns {string}
 */
function buildPlatformIconDataUri(label, hexColor) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">` +
    `<rect width="64" height="64" rx="12" fill="#${hexColor}"/>` +
    `<text x="32" y="42" font-size="28" text-anchor="middle" fill="white" ` +
    `font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-weight="700">${label}</text>` +
    '</svg>';
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * @param {KindFormat} format
 * @param {(key: string) => string} translate
 * @param {Record<string, unknown>} review
 * @returns {string}
 */
function buildTitle(format, translate, review) {
  const mrNumber = typeof review.mrNumber === 'number' ? String(review.mrNumber) : '?';
  const mrToken = `${resolveMrPrefix(review)}${mrNumber}`;
  const label = translate(format.labelKey);
  const author = resolveAuthor(review);
  const segments = author
    ? [`${format.emoji} ${label}`, author, mrToken]
    : [`${format.emoji} ${label}`, mrToken];
  return segments.join(' · ');
}

/**
 * @param {Record<string, unknown>} review
 * @returns {string}
 */
function buildBody(review) {
  const lines = [];
  const title = typeof review.title === 'string' ? review.title.trim() : '';
  if (title.length > 0) lines.push(title);
  const sizeLine = buildSizeLine(review);
  const project = resolveProjectShortName(review);
  const secondLineParts = [];
  if (sizeLine) secondLineParts.push(sizeLine);
  if (project) secondLineParts.push(project);
  if (secondLineParts.length > 0) lines.push(secondLineParts.join(' · '));
  return lines.join('\n');
}

/**
 * @param {{ kind: string, review: Record<string, unknown> }} notification
 * @param {(key: string, params?: Record<string, string | number>) => string} translate
 * @returns {{ title: string, body: string, tag: string, url: string | null, iconDataUri: string } | null}
 */
export function getDesktopNotificationPayload(notification, translate) {
  const format = KIND_FORMATS[notification.kind];
  if (!format) return null;

  const mrNumber =
    typeof notification.review.mrNumber === 'number' ? String(notification.review.mrNumber) : '?';
  const url =
    typeof notification.review.mrUrl === 'string' && notification.review.mrUrl.length > 0
      ? notification.review.mrUrl
      : null;

  return {
    title: buildTitle(format, translate, notification.review),
    body: buildBody(notification.review),
    tag: `reviewflow-${notification.kind}-${mrNumber}`,
    url,
    iconDataUri: PLATFORM_ICONS[resolvePlatform(notification.review)],
  };
}
