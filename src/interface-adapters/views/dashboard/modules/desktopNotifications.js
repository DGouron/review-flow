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
 * @param {{ kind: string, review: Record<string, unknown> }} notification
 * @param {(key: string, params?: Record<string, string | number>) => string} translate
 * @returns {{ title: string, body: string, tag: string } | null}
 */
export function getDesktopNotificationPayload(notification, translate) {
  const mrNumber = typeof notification.review.mrNumber === 'number'
    ? String(notification.review.mrNumber)
    : '?';

  const messageKeyByKind = {
    reviewStarted: 'notify.reviewStarted',
    followupStarted: 'notify.followupStarted',
    reviewCompleted: 'notify.reviewCompleted',
    followupCompleted: 'notify.followupCompleted',
    reviewFailed: 'notify.reviewFailed',
  };

  const messageKey = messageKeyByKind[notification.kind];
  if (!messageKey) return null;

  return {
    title: translate('notify.desktopTitle'),
    body: translate(messageKey, { mrNumber }),
    tag: `reviewflow-${notification.kind}-${mrNumber}`,
  };
}
