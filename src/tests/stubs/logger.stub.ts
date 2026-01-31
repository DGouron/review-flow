import type { Logger } from 'pino';

export function createStubLogger(): Logger {
  const noop = () => {};
  return {
    info: noop,
    warn: noop,
    error: noop,
    debug: noop,
    trace: noop,
    fatal: noop,
    child: () => createStubLogger(),
    level: 'silent',
  } as unknown as Logger;
}
