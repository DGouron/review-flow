import { describe, expect, it } from 'vitest';

import { buildDesktopNotificationCommand } from '@/frameworks/claude/desktopNotification.js';

describe('buildDesktopNotificationCommand', () => {
  describe('on macOS', () => {
    it('uses osascript, which ships with the OS', () => {
      const command = buildDesktopNotificationCommand('darwin', 'Review terminée', 'MR !42');

      expect(command.command).toBe('osascript');
      expect(command.args).toEqual([
        '-e',
        'display notification "MR !42" with title "Review terminée"',
      ]);
    });

    it('escapes double quotes so a quoted MR title cannot break the AppleScript', () => {
      const command = buildDesktopNotificationCommand('darwin', 'Review', 'MR "quoted" title');

      expect(command.args[1]).toBe(
        'display notification "MR \\"quoted\\" title" with title "Review"',
      );
    });

    it('escapes backslashes before quotes so escaping cannot be smuggled', () => {
      const command = buildDesktopNotificationCommand('darwin', 'Review', 'path\\to\\file');

      expect(command.args[1]).toBe('display notification "path\\\\to\\\\file" with title "Review"');
    });

    it('strips newlines, which would terminate the AppleScript statement', () => {
      const command = buildDesktopNotificationCommand('darwin', 'Review', 'line one\nline two');

      expect(command.args[1]).toBe('display notification "line one line two" with title "Review"');
    });
  });

  describe('on Linux', () => {
    it('keeps notify-send with the existing flags', () => {
      const command = buildDesktopNotificationCommand('linux', 'Review terminée', 'MR !42');

      expect(command.command).toBe('notify-send');
      expect(command.args).toEqual([
        '--app-name=Claude Review',
        '--urgency=normal',
        '--icon=dialog-information',
        'Review terminée',
        'MR !42',
      ]);
    });

    it('passes title and message through untouched, since they are separate argv entries', () => {
      const command = buildDesktopNotificationCommand('linux', 'Review', 'MR "quoted" title');

      expect(command.args.at(-1)).toBe('MR "quoted" title');
    });
  });

  it('falls back to notify-send on other platforms', () => {
    expect(buildDesktopNotificationCommand('freebsd', 'Review', 'MR !42').command).toBe(
      'notify-send',
    );
  });
});
