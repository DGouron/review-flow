export type DesktopNotificationCommand = {
  command: string;
  args: string[];
};

export type DesktopNotificationTarget = {
  platform: NodeJS.Platform;
  hasTerminalNotifier: boolean;
};

/**
 * `terminal-notifier` is an optional Homebrew binary, so its location varies
 * (arm64 and Intel prefixes differ). Walking PATH avoids hardcoding prefixes
 * and still finds custom installs.
 */
export function resolveTerminalNotifier(
  pathEnvironment: string | null,
  exists: (candidate: string) => boolean,
): boolean {
  if (pathEnvironment === null) {
    return false;
  }

  return pathEnvironment
    .split(':')
    .filter((directory) => directory.length > 0)
    .some((directory) => exists(`${directory}/terminal-notifier`));
}

/**
 * AppleScript takes the notification as a quoted string literal inside a single
 * `-e` argument, so quotes and backslashes have to be escaped and newlines
 * removed — a raw newline would terminate the statement. Backslashes are
 * escaped first, otherwise the backslash added for a quote would itself be
 * doubled.
 */
function toAppleScriptLiteral(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll(/[\r\n]+/g, ' ');
}

/**
 * `osascript` notifications are posted on behalf of Script Editor, so they hinge
 * on a notification permission users rarely grant to that app.
 * `terminal-notifier` ships its own bundle and gets its own permission entry, so
 * it is preferred when installed; `osascript` stays as the zero-install
 * fallback. Linux and anything else keeps `notify-send`.
 */
export function buildDesktopNotificationCommand(
  target: DesktopNotificationTarget,
  title: string,
  message: string,
): DesktopNotificationCommand {
  if (target.platform === 'darwin' && target.hasTerminalNotifier) {
    return { command: 'terminal-notifier', args: ['-title', title, '-message', message] };
  }

  if (target.platform === 'darwin') {
    const script = `display notification "${toAppleScriptLiteral(message)}" with title "${toAppleScriptLiteral(title)}"`;
    return { command: 'osascript', args: ['-e', script] };
  }

  return {
    command: 'notify-send',
    args: [
      '--app-name=Claude Review',
      '--urgency=normal',
      '--icon=dialog-information',
      title,
      message,
    ],
  };
}
