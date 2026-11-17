export type WebhookAllowlistSource = 'github-meta' | 'cache' | 'manual-only';

export type WebhookAllowlistResolution = {
  source: WebhookAllowlistSource;
  allowedCidrRanges: string[];
};

export function mergeCidrRanges(platformRanges: string[], manualRanges: string[]): string[] {
  return [...new Set([...platformRanges, ...manualRanges])];
}
