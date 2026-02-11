import { green, bold, dim } from '../shared/services/ansiColors.js';

interface StartupBannerInput {
  port: number;
  enabledPlatforms: Array<'gitlab' | 'github'>;
  daemonPid: number | null;
}

interface StartupBanner {
  lines: string[];
  dashboardUrl: string;
}

export function formatStartupBanner(input: StartupBannerInput): StartupBanner {
  const baseUrl = `http://localhost:${input.port}`;
  const dashboardUrl = `${baseUrl}/dashboard/`;
  const lines: string[] = [];

  const mode = input.daemonPid !== null ? ` (daemon, PID ${input.daemonPid})` : '';
  lines.push(green(bold(`ReviewFlow is running on port ${input.port}${mode}`)));
  lines.push('');
  lines.push(dim(`  Dashboard:  ${dashboardUrl}`));
  lines.push(dim(`  Health:     ${baseUrl}/health`));

  for (const platform of input.enabledPlatforms) {
    lines.push(dim(`  Webhook:    ${baseUrl}/webhooks/${platform}`));
  }

  lines.push('');

  if (input.daemonPid !== null) {
    lines.push(dim('Use `reviewflow stop` to shut down.'));
  } else {
    lines.push(dim('Press Ctrl+C to stop.'));
  }

  return { lines, dashboardUrl };
}
