import { describe, expect, it } from 'vitest';

import {
  TransportRejectionLog,
  type TransportRejection,
} from '@/modules/platform-integration/interface-adapters/controllers/webhook/transportRejectionLog.js';
import { createCapturingLogger } from '@/tests/stubs/capturingLogger.stub.js';

const ONE_MINUTE_IN_MILLISECONDS = 60_000;

function buildRejectionLog() {
  const capturing = createCapturingLogger();
  let currentTime = 0;
  const rejectionLog = new TransportRejectionLog({
    logger: capturing.logger,
    now: () => currentTime,
  });
  return {
    rejectionLog,
    capturing,
    advanceTime: (milliseconds: number) => {
      currentTime += milliseconds;
    },
  };
}

function offAllowlist(clientIp: string): TransportRejection {
  return { reason: 'off-allowlist', clientIp, socketAddress: '127.0.0.1' };
}

describe('TransportRejectionLog', () => {
  it('logs the reason, the client ip and the socket address', () => {
    const { rejectionLog, capturing } = buildRejectionLog();

    rejectionLog.record(offAllowlist('9.234.106.50'));

    expect(capturing.warnMessages).toHaveLength(1);
    expect(capturing.warnMessages[0]).toContain('"reason":"off-allowlist"');
    expect(capturing.warnMessages[0]).toContain('"clientIp":"9.234.106.50"');
    expect(capturing.warnMessages[0]).toContain('"socketAddress":"127.0.0.1"');
  });

  it('truncates a client ip taken from an oversized forwarded header', () => {
    const { rejectionLog, capturing } = buildRejectionLog();

    rejectionLog.record(offAllowlist('a'.repeat(16_000)));

    expect(capturing.warnMessages[0].length).toBeLessThan(400);
    expect(capturing.warnMessages[0]).toContain('"clientIpLength":16000');
  });

  it('logs each source address once per reason and per minute', () => {
    const { rejectionLog, capturing } = buildRejectionLog();

    for (let attempt = 0; attempt < 50; attempt++) {
      rejectionLog.record(offAllowlist('203.0.113.7'));
    }

    expect(capturing.warnMessages).toHaveLength(1);
  });

  it('logs at most 32 distinct addresses per reason and per minute', () => {
    const { rejectionLog, capturing } = buildRejectionLog();

    for (let attempt = 0; attempt < 500; attempt++) {
      rejectionLog.record(offAllowlist(`203.0.113.${attempt % 250}`));
    }

    expect(capturing.warnMessages).toHaveLength(32);
  });

  it('tracks a truncated oversized address as a single source', () => {
    const { rejectionLog, capturing } = buildRejectionLog();

    rejectionLog.record(offAllowlist(`${'a'.repeat(64)}first`));
    rejectionLog.record(offAllowlist(`${'a'.repeat(64)}second`));

    expect(capturing.warnMessages).toHaveLength(1);
  });

  it('keys a rejection without client ip on its socket address', () => {
    const { rejectionLog, capturing } = buildRejectionLog();

    rejectionLog.record({ reason: 'untrusted-socket', clientIp: null, socketAddress: '10.0.0.9' });
    rejectionLog.record({ reason: 'untrusted-socket', clientIp: null, socketAddress: '10.0.0.9' });
    rejectionLog.record({ reason: 'untrusted-socket', clientIp: null, socketAddress: '10.0.0.10' });

    expect(capturing.warnMessages).toHaveLength(2);
  });

  it('throttles each reason separately', () => {
    const { rejectionLog, capturing } = buildRejectionLog();

    for (let attempt = 0; attempt < 50; attempt++) {
      rejectionLog.record(offAllowlist(`203.0.113.${attempt}`));
    }
    rejectionLog.record({ reason: 'untrusted-socket', clientIp: null, socketAddress: '10.0.0.9' });

    expect(capturing.warnMessages).toHaveLength(33);
    expect(capturing.warnMessages[32]).toContain('"reason":"untrusted-socket"');
  });

  it('still logs a GitHub refusal while a scanner floods the same reason', () => {
    const { rejectionLog, capturing } = buildRejectionLog();

    for (let attempt = 0; attempt < 50; attempt++) {
      rejectionLog.record(offAllowlist('203.0.113.7'));
    }
    rejectionLog.record(offAllowlist('9.234.106.50'));

    expect(capturing.warnMessages.at(-1)).toContain('"clientIp":"9.234.106.50"');
  });

  it('logs again in the next minute with the count of rejections it suppressed', () => {
    const { rejectionLog, capturing, advanceTime } = buildRejectionLog();
    for (let attempt = 0; attempt < 25; attempt++) {
      rejectionLog.record(offAllowlist('203.0.113.7'));
    }

    advanceTime(ONE_MINUTE_IN_MILLISECONDS);
    rejectionLog.record(offAllowlist('9.234.106.50'));

    expect(capturing.warnMessages).toHaveLength(2);
    expect(capturing.warnMessages[1]).toContain('"clientIp":"9.234.106.50"');
    expect(capturing.warnMessages[1]).toContain('"suppressedInPreviousWindow":24');
  });
});
