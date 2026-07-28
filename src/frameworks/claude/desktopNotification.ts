export type DesktopNotificationCommand = {
  command: string;
  args: string[];
};

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
 * macOS has no `notify-send`; `osascript` is part of the base system. Linux and
 * anything else keeps `notify-send`, which is where it is expected to exist.
 */
export function buildDesktopNotificationCommand(
  platform: NodeJS.Platform,
  title: string,
  message: string,
): DesktopNotificationCommand {
  if (platform === 'darwin') {
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
