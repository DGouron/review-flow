const RESET = '\x1b[0m';

function wrap(code: string): (text: string) => string {
  if (process.env.NO_COLOR) {
    return (text: string) => text;
  }
  return (text: string) => `${code}${text}${RESET}`;
}

export const red = wrap('\x1b[31m');
export const green = wrap('\x1b[32m');
export const yellow = wrap('\x1b[33m');
export const dim = wrap('\x1b[2m');
export const bold = wrap('\x1b[1m');
