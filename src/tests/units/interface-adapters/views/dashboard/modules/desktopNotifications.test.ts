import { describe, expect, it } from 'vitest';
import {
  getDesktopNotificationPayload,
  shouldNotifyDesktop,
} from '@/interface-adapters/views/dashboard/modules/desktopNotifications.js';

describe('shouldNotifyDesktop', () => {
  it('should notify when permission is granted and document is hidden', () => {
    const result = shouldNotifyDesktop({
      permission: 'granted',
      isDocumentHidden: true,
    });

    expect(result).toBe(true);
  });

  it('should not notify when permission is not granted', () => {
    const result = shouldNotifyDesktop({
      permission: 'default',
      isDocumentHidden: true,
    });

    expect(result).toBe(false);
  });

  it('should notify when visible only if explicitly enabled', () => {
    const result = shouldNotifyDesktop({
      permission: 'granted',
      isDocumentHidden: false,
      notifyWhenVisible: true,
    });

    expect(result).toBe(true);
  });
});

describe('getDesktopNotificationPayload', () => {
  const translate = (key: string, params?: Record<string, string | number>) => {
    if (key === 'notify.desktopTitle') return 'Reviewflow alert';
    if (key === 'notify.reviewStarted') return `Review started for !${params?.mrNumber}`;
    return key;
  };

  it('should map known notification kind to desktop payload', () => {
    const result = getDesktopNotificationPayload(
      {
        kind: 'reviewStarted',
        review: { mrNumber: 42 },
      },
      translate,
    );

    expect(result).toEqual({
      title: 'Reviewflow alert',
      body: 'Review started for !42',
      tag: 'reviewflow-reviewStarted-42',
    });
  });

  it('should return null for unknown notification kind', () => {
    const result = getDesktopNotificationPayload(
      {
        kind: 'unknown',
        review: { mrNumber: 1 },
      },
      translate,
    );

    expect(result).toBeNull();
  });
});
